import type { Model } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type { IXeroSyncLogDocument, IXeroConfigDocument } from '../types';
import { callXeroApi, XeroOfflineError } from './xeroClient';

// ─── Module State ───────────────────────────────────────────────────────────

let XeroSyncLogModel: Model<IXeroSyncLogDocument>;
let XeroConfigModel: Model<IXeroConfigDocument>;
/* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<IFooDocument> */
let OrderModel: Model<any>;
let PaymentModel: Model<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export function initPaymentSync(
  syncLogModel: Model<IXeroSyncLogDocument>,
  configModel: Model<IXeroConfigDocument>,
  /* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<IFooDocument> */
  orderModel: Model<any>,
  paymentModel: Model<any>,
  /* eslint-enable @typescript-eslint/no-explicit-any */
): void {
  XeroSyncLogModel = syncLogModel;
  XeroConfigModel = configModel;
  OrderModel = orderModel;
  PaymentModel = paymentModel;
}

// ─── Record Payment in Xero ─────────────────────────────────────────────

export async function recordPayment(paymentId: string): Promise<{
  xeroPaymentId: string;
}> {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment) {
    throw AppError.notFound('Payment');
  }

  // Idempotency: already synced
  if (payment.xeroPaymentId) {
    return { xeroPaymentId: payment.xeroPaymentId as string };
  }

  // Must have a completed order with Xero invoice
  const order = await OrderModel.findById(payment.orderId);
  if (!order) {
    throw AppError.notFound('Order');
  }

  if (!order.xeroInvoiceId) {
    throw new Error('Order has no Xero invoice — invoice must be synced first');
  }

  const config = await XeroConfigModel.findOne().lean();
  const bankAccountId = config?.xeroBankAccountId;

  const syncLog = await XeroSyncLogModel.create({
    entityType: 'payment',
    entityId: paymentId,
    action: 'create',
    status: 'processing',
    requestPayload: {
      paymentId,
      orderId: payment.orderId?.toString(),
      amount: payment.amount,
      xeroInvoiceId: order.xeroInvoiceId,
    },
  });

  try {
    const result = await callXeroApi(async (accessToken, tenantId) => {
      const paymentPayload: Record<string, unknown> = {
        Invoice: { InvoiceID: order.xeroInvoiceId },
        Amount: payment.amount / 100, // cents to dollars
        Date: payment.paidAt ?? payment.createdAt ?? new Date(),
        Reference: payment.paymentNumber ?? paymentId,
        CurrencyRate: 1.0,
      };

      if (bankAccountId) {
        paymentPayload.Account = { AccountID: bankAccountId };
      }

      const res = await fetch('https://api.xero.com/api.xro/2.0/Payments', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(paymentPayload),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Xero payment recording failed: ${res.status} ${errBody}`);
      }

      const data = (await res.json()) as {
        Payments: Array<{ PaymentID: string }>;
      };
      return { paymentId: data.Payments[0].PaymentID };
    });

    // Store Xero payment ID on Payment
    payment.xeroPaymentId = result.paymentId;
    payment.xeroSynced = true;
    await payment.save();

    syncLog.status = 'success';
    syncLog.xeroEntityId = result.paymentId;
    syncLog.processedAt = new Date();
    await syncLog.save();

    // Update last sync time
    await XeroConfigModel.findOneAndUpdate({}, { $set: { lastSyncAt: new Date() } });

    return { xeroPaymentId: result.paymentId };
  } catch (err: unknown) {
    syncLog.status = err instanceof XeroOfflineError ? 'queued' : 'failed';
    syncLog.error = (err as Error).message;
    await syncLog.save();
    throw err;
  }
}
