import { v4 as uuidv4 } from 'uuid';
import type { Model } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type {
  IPaymentDocument,
  IPaymentProvider,
  PaymentGateway,
  RefundApprovalLevel,
  IRefundEntry,
  PaymentEventPayload,
} from '../types';
import { isValidTransition } from '../models/paymentModel';
import { paymentEvents } from './webhookProcessor';

let _PaymentModel: Model<IPaymentDocument> | null = null;
let _providers: Map<PaymentGateway, IPaymentProvider> = new Map();

export function initRefundService(
  PaymentModel: Model<IPaymentDocument>,
  providers: Map<PaymentGateway, IPaymentProvider>,
): void {
  _PaymentModel = PaymentModel;
  _providers = providers;
}

function getPaymentModel(): Model<IPaymentDocument> {
  if (!_PaymentModel) {
    throw new Error('Refund service not initialized. Call initRefundService first.');
  }
  return _PaymentModel;
}

/**
 * BIL-INV-04: Determine approval level required for a refund amount.
 * >$500 (50000 cents) = admin
 * >$2000 (200000 cents) = super_admin
 */
export function getRequiredApprovalLevel(amountInCents: number): RefundApprovalLevel {
  if (amountInCents > 200000) {
    return 'super_admin';
  }
  if (amountInCents > 50000) {
    return 'admin';
  }
  return 'none';
}

/**
 * Check if the actor has sufficient approval level.
 * userType 0 = super_admin, 1 = admin
 */
export function hasApprovalAuthority(
  userType: number,
  requiredLevel: RefundApprovalLevel,
): boolean {
  switch (requiredLevel) {
    case 'none':
      return true;
    case 'admin':
      return userType <= 1; // super_admin (0) or admin (1)
    case 'super_admin':
      return userType === 0; // super_admin only
    default:
      return false;
  }
}

interface ProcessRefundParams {
  paymentId: string;
  amount?: number; // cents, undefined = full refund
  reason: string;
  idempotencyKey: string;
  actorId: string;
  actorType: number;
}

interface ProcessRefundResult {
  refundEntry: IRefundEntry;
  payment: IPaymentDocument;
  requiredApproval: RefundApprovalLevel;
}

/**
 * Process a refund request.
 *
 * PAY-INV-06: Validates sum(existing refunds) + newAmount <= capturedAmount.
 * BIL-INV-04: Enforces approval gates based on amount.
 */
export async function processRefund(params: ProcessRefundParams): Promise<ProcessRefundResult> {
  const PaymentModel = getPaymentModel();

  const payment = await PaymentModel.findById(params.paymentId);
  if (!payment) {
    throw AppError.notFound('Payment');
  }

  // Payment must be in a refundable state
  if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') {
    throw AppError.badRequest(
      `Payment cannot be refunded in status "${payment.status}". Must be "succeeded" or "partially_refunded".`,
    );
  }

  // Determine refund amount
  const refundAmount = params.amount ?? payment.capturedAmount - payment.refundedAmount;

  if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
    throw AppError.badRequest('Refund amount must be a positive integer (cents)');
  }

  // PAY-INV-06: Validate refund amount doesn't exceed captured amount
  const totalAfterRefund = payment.refundedAmount + refundAmount;
  if (totalAfterRefund > payment.capturedAmount) {
    throw AppError.badRequest(
      `Refund amount (${refundAmount}) plus existing refunds (${payment.refundedAmount}) exceeds captured amount (${payment.capturedAmount})`,
    );
  }

  // BIL-INV-04: Check approval gates
  const requiredApproval = getRequiredApprovalLevel(refundAmount);
  if (!hasApprovalAuthority(params.actorType, requiredApproval)) {
    const levelLabel = requiredApproval === 'super_admin' ? 'Super Admin' : 'Admin';
    throw AppError.forbidden(`Refund of ${refundAmount} cents requires ${levelLabel} approval`);
  }

  // Get the gateway provider
  const provider = _providers.get(payment.gateway);
  if (!provider) {
    throw AppError.gatewayError(`Payment gateway "${payment.gateway}" is not available for refund`);
  }

  // Validate status transition
  const targetStatus =
    totalAfterRefund >= payment.capturedAmount
      ? ('refunded' as const)
      : ('partially_refunded' as const);

  if (!isValidTransition(payment.status, 'refund_pending')) {
    throw AppError.badRequest(
      `Cannot transition payment from "${payment.status}" to "refund_pending"`,
    );
  }

  // Set to refund_pending
  const previousStatus = payment.status;
  payment.status = 'refund_pending';
  await payment.save();

  try {
    // Call gateway
    const refundResult = await provider.refundPayment({
      gatewayTxnId: payment.gatewayTxnId,
      amount: refundAmount,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
    });

    // Create refund entry
    const refundEntry: IRefundEntry = {
      refundId: uuidv4(),
      amount: refundAmount,
      reason: params.reason,
      gateway: payment.gateway,
      gatewayRefundId: refundResult.gatewayRefundId,
      status: 'succeeded',
      createdAt: new Date(),
      processedAt: new Date(),
    };

    // Update payment
    payment.refunds.push(refundEntry);
    payment.refundedAmount = totalAfterRefund;
    payment.status = targetStatus;
    await payment.save();

    // Emit event for PAY-INV-11 and PAY-INV-12
    const eventPayload: PaymentEventPayload = {
      paymentId: payment._id.toString(),
      orderId: payment.orderId.toString(),
      userId: payment.userId.toString(),
      gateway: payment.gateway,
      amount: payment.amount,
      status: payment.status,
      previousStatus,
      refundAmount,
    };

    paymentEvents.emit(`payment.${targetStatus}`, eventPayload);

    return {
      refundEntry,
      payment,
      requiredApproval,
    };
  } catch (err) {
    // Rollback status on failure
    payment.status = previousStatus;
    await payment.save();
    throw err;
  }
}
