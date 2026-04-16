import type { Document, Types } from 'mongoose';
import type { Request } from 'express';

// ─── Gateway Enums ───────────────────────────────────────────────────────────

export type PaymentGateway = 'stripe' | 'payzoo';

export type RoutingRule = 'primary_only' | 'fallback' | 'round_robin' | 'amount_based';

export type PaymentStatus =
  | 'pending'
  | 'requires_capture'
  | 'authorised'
  | 'captured'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed';

export type RefundStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export type WebhookEventStatus = 'received' | 'processing' | 'processed' | 'failed' | 'ignored';

// ─── Payment Provider Interface ──────────────────────────────────────────────

export interface CreateIntentParams {
  amount: number; // integer cents
  currency: string;
  orderId: string;
  userId: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  gatewayTxnId: string;
  clientSecret: string;
  gateway: PaymentGateway;
  publishableKey: string;
  status: string;
}

export interface CaptureParams {
  gatewayTxnId: string;
  amount?: number; // optional partial capture in cents
}

export interface CaptureResult {
  gatewayTxnId: string;
  capturedAmount: number;
  status: string;
}

export interface CancelParams {
  gatewayTxnId: string;
  // Optional cancellation reason — Stripe accepts a fixed enum
  // ('duplicate' | 'fraudulent' | 'requested_by_customer' | 'abandoned'),
  // but the package-level interface keeps it as a free-form string and
  // each provider maps as needed. Used for compensation rollback when a
  // saga step fails after intent creation.
  reason?: string;
}

export interface CancelResult {
  gatewayTxnId: string;
  status: string; // 'cancelled' on success
}

export interface RefundParams {
  gatewayTxnId: string;
  amount: number; // cents
  reason?: string;
  idempotencyKey: string;
}

export interface RefundResult {
  gatewayRefundId: string;
  amount: number;
  status: string;
}

export interface PaymentStatusResult {
  gatewayTxnId: string;
  status: string;
  amount: number;
  capturedAmount: number;
  refundedAmount: number;
}

/**
 * All payment gateways implement this interface.
 * Product-agnostic — no QEGOS-specific logic.
 */
export interface IPaymentProvider {
  name: PaymentGateway;
  createPaymentIntent(params: CreateIntentParams): Promise<PaymentIntentResult>;
  capturePayment(params: CaptureParams): Promise<CaptureResult>;
  // Cancel an unconfirmed/uncaptured intent. Used as the saga
  // compensation when a downstream step fails after intent creation —
  // tells the gateway to release the held funds and fires the
  // gateway's `payment_intent.canceled` webhook for any reconciliation
  // hooks. Idempotent at the gateway: cancelling an already-cancelled
  // intent is not an error in callers' eyes (provider may map to a
  // success or specific error code).
  cancelPayment(params: CancelParams): Promise<CancelResult>;
  refundPayment(params: RefundParams): Promise<RefundResult>;
  getPaymentStatus(gatewayTxnId: string): Promise<PaymentStatusResult>;
  testConnection(): Promise<boolean>;
}

// ─── Gateway Config ──────────────────────────────────────────────────────────

export interface IGatewayConfig {
  primaryGateway: PaymentGateway;
  routingRule: RoutingRule;
  amountThreshold: number; // cents — for amount_based routing
  stripeEnabled: boolean;
  stripePublishableKey: string;
  payzooEnabled: boolean;
  payzooPublicKey: string;
  fallbackTimeoutMs: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  updatedBy?: Types.ObjectId;
}

export interface IGatewayConfigDocument extends IGatewayConfig, Document {
  _id: Types.ObjectId;
  updatedAt: Date;
}

// ─── Payment Model ───────────────────────────────────────────────────────────

export interface IRefundEntry {
  refundId: string;
  amount: number; // cents
  reason: string;
  gateway: PaymentGateway;
  gatewayRefundId: string;
  status: RefundStatus;
  createdAt: Date;
  processedAt?: Date;
}

export interface IPaymentMetadata {
  clientIp?: string;
  userAgent?: string;
  deviceType?: 'mobile' | 'web';
  browserFingerprint?: string;
}

export interface IPayment {
  paymentNumber: string;
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  gateway: PaymentGateway;
  gatewayTxnId: string;
  gatewayCustomerId?: string;
  idempotencyKey: string;
  amount: number; // integer cents
  currency: string;
  status: PaymentStatus;
  capturedAmount: number;
  refundedAmount: number;
  failureCode?: string;
  failureMessage?: string;
  refunds: IRefundEntry[];
  metadata?: IPaymentMetadata;
  xeroPaymentId?: string;
  xeroSynced: boolean;
  webhookProcessed: boolean;
  webhookProcessedAt?: Date;
  // Idempotency marker for the consuming app's domain compensation
  // listener (e.g. apps/api's paymentCompensation.listener). When a
  // webhook fires `payment.failed` / `payment.cancelled` and the
  // listener has restored credits/promo/order state, this flips to
  // true so concurrent or replayed webhooks don't double-compensate.
  // Tier-1 owns the field but is agnostic to who sets it.
  domainCompensated?: boolean;
  domainCompensatedAt?: Date;
}

export interface IPaymentDocument extends IPayment, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Webhook Event ───────────────────────────────────────────────────────────

export interface IWebhookEvent {
  eventId: string;
  gateway: PaymentGateway;
  eventType: string;
  payload: Record<string, unknown>;
  processedAt?: Date;
  status: WebhookEventStatus;
  error?: string;
  retryCount: number;
}

export interface IWebhookEventDocument extends IWebhookEvent, Document {
  _id: Types.ObjectId;
  createdAt: Date;
}

// ─── GST Calculation ─────────────────────────────────────────────────────────

export interface GSTCalculation {
  priceInCents: number;
  gstAmountInCents: number;
  priceExGstInCents: number;
  gstInclusive: boolean;
}

export interface LineItemWithGST {
  description: string;
  priceInCents: number;
  quantity: number;
  gstInclusive: boolean;
}

export interface OrderGSTSummary {
  lineItems: Array<LineItemWithGST & { gstAmountInCents: number; totalInCents: number }>;
  subtotalInCents: number;
  totalGstInCents: number;
  grandTotalInCents: number;
}

// ─── Billing Dispute ─────────────────────────────────────────────────────────

export type DisputeType =
  | 'overcharge'
  | 'service_not_delivered'
  | 'quality_issue'
  | 'incorrect_amount'
  | 'duplicate_charge'
  | 'unauthorised';

export type DisputeResolution =
  | 'full_refund'
  | 'partial_refund'
  | 'credit_issued'
  | 'no_action'
  | 'service_redo'
  | 'discount_applied';

export type DisputeStatus =
  | 'raised'
  | 'investigating'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'completed';

export interface IBillingDispute {
  ticketId?: Types.ObjectId;
  orderId: Types.ObjectId;
  paymentId: Types.ObjectId;
  disputeType: DisputeType;
  disputedAmount: number; // cents
  clientStatement: string;
  staffAssessment?: string;
  resolution?: DisputeResolution;
  resolvedAmount?: number; // cents
  status: DisputeStatus;
  approvedBy?: Types.ObjectId;
  xeroAdjustmentMade: boolean;
}

export interface IBillingDisputeDocument extends IBillingDispute, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Payment Router Types ────────────────────────────────────────────────────

export interface PaymentRouterConfig {
  providers: Map<PaymentGateway, IPaymentProvider>;
  getGatewayConfig: () => Promise<IGatewayConfig>;
}

export interface GatewayError extends Error {
  code?: string;
  type?: string;
  statusCode?: number;
  isRetryable?: boolean;
}

// ─── Payment Package Config ──────────────────────────────────────────────────

export interface PaymentGatewayConfig {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  payzooApiKey?: string;
  payzooApiSecret?: string;
  payzooBaseUrl?: string;
  payzooWebhookSecret?: string;
}

// ─── Status Transition Map ───────────────────────────────────────────────────

/**
 * PAY-INV-07: One-directional payment status transitions.
 * Defines which transitions are valid from each status.
 */
export const VALID_STATUS_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  // Stripe's default auto-capture PaymentIntent flow fires
  // `payment_intent.succeeded` directly against a freshly created
  // intent — there is no intermediate capture event. Without
  // `pending → succeeded` here, the Pay Now webhook is silently marked
  // `ignored` and the order never transitions to paid.
  pending: ['requires_capture', 'authorised', 'captured', 'succeeded', 'failed', 'cancelled'],
  requires_capture: ['captured', 'succeeded', 'failed', 'cancelled'],
  authorised: ['captured', 'succeeded', 'failed', 'cancelled'],
  captured: ['succeeded', 'failed'],
  succeeded: ['refund_pending', 'refunded', 'partially_refunded', 'disputed'],
  failed: [],
  cancelled: [],
  refund_pending: ['refunded', 'partially_refunded', 'failed'],
  refunded: [],
  partially_refunded: ['refund_pending', 'refunded', 'disputed'],
  disputed: ['refunded', 'partially_refunded', 'succeeded'],
};

// ─── Event Types ─────────────────────────────────────────────────────────────

export type PaymentEvent =
  | 'payment.created'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment.partially_refunded'
  | 'payment.disputed'
  | 'payment.captured'
  | 'payment.cancelled';

export interface PaymentEventPayload {
  paymentId: string;
  orderId: string;
  userId: string;
  gateway: PaymentGateway;
  amount: number;
  status: PaymentStatus;
  previousStatus?: PaymentStatus;
  refundAmount?: number;
}

// ─── Request Types ───────────────────────────────────────────────────────────

export interface AuthenticatedPaymentRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
  scopeFilter?: Record<string, unknown>;
}

// ─── Refund Approval ─────────────────────────────────────────────────────────

export type RefundApprovalLevel = 'none' | 'admin' | 'super_admin';

// ─── Write-Off Types ─────────────────────────────────────────────────────────

export interface WriteOffParams {
  paymentId: string;
  reason: string;
  contactAttempts: number;
  contactLog: string;
}

// ─── Idempotency ─────────────────────────────────────────────────────────────

export interface IdempotencyCachedResponse {
  statusCode: number;
  body: Record<string, unknown>;
  createdAt: number;
}
