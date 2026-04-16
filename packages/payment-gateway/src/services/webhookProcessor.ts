import { EventEmitter } from 'events';
import type { Model } from 'mongoose';
import type {
  IWebhookEventDocument,
  IPaymentDocument,
  PaymentStatus,
  PaymentEventPayload,
} from '../types';
import { isValidTransition } from '../models/paymentModel';

/**
 * Global event emitter for payment events.
 * Consumers register listeners: paymentEvents.on('payment.succeeded', handler)
 * Event-driven integration per CLAUDE.md rule #4.
 */
export const paymentEvents = new EventEmitter();

let _WebhookEventModel: Model<IWebhookEventDocument> | null = null;
let _PaymentModel: Model<IPaymentDocument> | null = null;

export function initWebhookProcessor(
  WebhookEventModel: Model<IWebhookEventDocument>,
  PaymentModel: Model<IPaymentDocument>,
): void {
  _WebhookEventModel = WebhookEventModel;
  _PaymentModel = PaymentModel;
}

function getModels(): {
  WebhookEventModel: Model<IWebhookEventDocument>;
  PaymentModel: Model<IPaymentDocument>;
} {
  if (!_WebhookEventModel || !_PaymentModel) {
    throw new Error('Webhook processor not initialized. Call initWebhookProcessor first.');
  }
  return { WebhookEventModel: _WebhookEventModel, PaymentModel: _PaymentModel };
}

/**
 * Emit a typed payment event.
 */
function emitPaymentEvent(eventName: string, payload: PaymentEventPayload): void {
  paymentEvents.emit(eventName, payload);
}

/**
 * Map Stripe webhook event types to payment status transitions.
 */
const STRIPE_EVENT_MAP: Record<string, PaymentStatus> = {
  'payment_intent.succeeded': 'succeeded',
  'payment_intent.payment_failed': 'failed',
  'payment_intent.canceled': 'cancelled',
  'payment_intent.amount_capturable_updated': 'authorised',
  'charge.refunded': 'refunded',
  'charge.dispute.created': 'disputed',
};

/**
 * Map Payroo webhook event types to payment status transitions.
 */
const PAYROO_EVENT_MAP: Record<string, PaymentStatus> = {
  'payment.completed': 'succeeded',
  'payment.failed': 'failed',
  'payment.cancelled': 'cancelled',
  'payment.authorized': 'authorised',
  'payment.refunded': 'refunded',
  'payment.disputed': 'disputed',
};

/**
 * PAY-INV-03: Process a webhook event with exactly-once semantics.
 * - Check WebhookEvent by eventId. If exists, return without reprocessing.
 * - Otherwise, create the event record and process it.
 */
async function processWebhookEvent(
  eventId: string,
  gateway: 'stripe' | 'payroo',
  eventType: string,
  payload: Record<string, unknown>,
  gatewayTxnId: string,
  eventMap: Record<string, PaymentStatus>,
): Promise<{ processed: boolean; duplicate: boolean }> {
  const { WebhookEventModel, PaymentModel } = getModels();

  // PAY-INV-03: Check for duplicate webhook (exactly-once)
  const existingEvent = await WebhookEventModel.findOne({ eventId }).lean();
  if (existingEvent) {
    return { processed: false, duplicate: true };
  }

  // Create the event record with status 'processing'
  const webhookEvent = await WebhookEventModel.create({
    eventId,
    gateway,
    eventType,
    payload,
    status: 'processing',
  });

  try {
    // Determine target status from event type
    const targetStatus = eventMap[eventType];
    if (!targetStatus) {
      // Event type not mapped — mark as ignored
      webhookEvent.status = 'ignored';
      await webhookEvent.save();
      return { processed: false, duplicate: false };
    }

    // Find the payment by gateway transaction ID
    const payment = await PaymentModel.findOne({ gatewayTxnId });
    if (!payment) {
      webhookEvent.status = 'failed';
      webhookEvent.error = `Payment not found for gatewayTxnId: ${gatewayTxnId}`;
      await webhookEvent.save();
      return { processed: false, duplicate: false };
    }

    const previousStatus = payment.status;

    // PAY-INV-07: Validate status transition
    if (!isValidTransition(previousStatus, targetStatus)) {
      webhookEvent.status = 'ignored';
      webhookEvent.error = `Invalid transition: ${previousStatus} -> ${targetStatus}`;
      await webhookEvent.save();
      return { processed: false, duplicate: false };
    }

    // Update payment status
    payment.status = targetStatus;
    payment.webhookProcessed = true;
    payment.webhookProcessedAt = new Date();

    // Handle specific status updates
    if (targetStatus === 'succeeded' && payment.capturedAmount === 0) {
      payment.capturedAmount = payment.amount;
    }

    // Handle refund amounts from webhook payload
    if (targetStatus === 'refunded' || eventType === 'charge.refunded') {
      const refundAmount = extractRefundAmount(gateway, payload);
      if (refundAmount > 0) {
        payment.refundedAmount = refundAmount;
        // Determine if fully or partially refunded
        if (refundAmount >= payment.capturedAmount) {
          payment.status = 'refunded';
        } else {
          payment.status = 'partially_refunded';
        }
      }
    }

    await payment.save();

    // Mark webhook event as processed
    webhookEvent.status = 'processed';
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    // PAY-INV-11: Emit event for audit logging and downstream processing
    const eventPayload: PaymentEventPayload = {
      paymentId: payment._id.toString(),
      orderId: payment.orderId.toString(),
      userId: payment.userId.toString(),
      gateway: payment.gateway,
      amount: payment.amount,
      status: payment.status,
      previousStatus,
    };

    if (targetStatus === 'refunded' || targetStatus === 'partially_refunded') {
      eventPayload.refundAmount = payment.refundedAmount;
    }

    const eventName = `payment.${payment.status}`;
    emitPaymentEvent(eventName, eventPayload);

    return { processed: true, duplicate: false };
  } catch (err) {
    // Update webhook event with error
    webhookEvent.status = 'failed';
    webhookEvent.error = (err as Error).message;
    webhookEvent.retryCount += 1;
    await webhookEvent.save();
    throw err;
  }
}

/**
 * Extract refund amount from webhook payload.
 */
function extractRefundAmount(
  gateway: 'stripe' | 'payroo',
  payload: Record<string, unknown>,
): number {
  if (gateway === 'stripe') {
    // Stripe charge.refunded event
    const data = payload.data as Record<string, unknown> | undefined;
    const object = data?.object as Record<string, unknown> | undefined;
    return (object?.amount_refunded as number) ?? 0;
  }

  // Payroo refund events
  return (payload.refundedAmount as number) ?? 0;
}

/**
 * Process a Stripe webhook event.
 */
export async function processStripeWebhook(
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<{ processed: boolean; duplicate: boolean }> {
  // Extract gateway transaction ID from Stripe event
  const data = payload.data as Record<string, unknown> | undefined;
  const object = data?.object as Record<string, unknown> | undefined;

  let gatewayTxnId: string;

  if (eventType.startsWith('payment_intent.')) {
    gatewayTxnId = (object?.id as string) ?? '';
  } else if (eventType.startsWith('charge.')) {
    gatewayTxnId = (object?.payment_intent as string) ?? '';
  } else {
    gatewayTxnId = (object?.id as string) ?? '';
  }

  return processWebhookEvent(eventId, 'stripe', eventType, payload, gatewayTxnId, STRIPE_EVENT_MAP);
}

/**
 * Process a Payroo webhook event.
 */
export async function processPayrooWebhook(
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<{ processed: boolean; duplicate: boolean }> {
  const gatewayTxnId = (payload.transactionId as string) ?? '';

  return processWebhookEvent(eventId, 'payroo', eventType, payload, gatewayTxnId, PAYROO_EVENT_MAP);
}
