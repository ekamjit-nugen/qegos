import type { Model } from 'mongoose';
import type { IXeroConfigDocument } from '../types';
import { RECONCILIATION_THRESHOLD_CENTS } from '../types';
import { callXeroApi } from './xeroClient';

// ─── Module State ───────────────────────────────────────────────────────────

let OrderModel: Model<any>;
let PaymentModel: Model<any>;

export function initReconciliation(
  _configModel: Model<IXeroConfigDocument>,
  orderModel: Model<any>,
  paymentModel: Model<any>,
): void {
  OrderModel = orderModel;
  PaymentModel = paymentModel;
}

// ─── Reconciliation Report (XRO-INV-09) ─────────────────────────────────

export interface ReconciliationResult {
  matched: number;
  mismatched: Array<{
    orderId: string;
    orderNumber: string;
    qegosAmountCents: number;
    xeroAmountCents: number;
    differenceCents: number;
  }>;
  xeroOnly: Array<{ xeroInvoiceId: string; xeroAmount: number }>;
  qegosOnly: Array<{ orderId: string; orderNumber: string; amountCents: number }>;
  total: number;
}

/**
 * XRO-INV-09: Compare QEGOS payments vs Xero payments.
 * Flag mismatches > $0.01 (1 cent).
 */
export async function runReconciliation(
  dateFrom?: Date,
  dateTo?: Date,
): Promise<ReconciliationResult> {
  // Get QEGOS orders with Xero invoices
  const orderFilter: Record<string, unknown> = {
    xeroInvoiceId: { $exists: true, $ne: null },
  };
  if (dateFrom || dateTo) {
    orderFilter.createdAt = {};
    if (dateFrom) (orderFilter.createdAt as Record<string, Date>).$gte = dateFrom;
    if (dateTo) (orderFilter.createdAt as Record<string, Date>).$lte = dateTo;
  }

  const orders = await OrderModel.find(orderFilter)
    .select('_id orderNumber xeroInvoiceId finalAmount')
    .lean();

  // Get QEGOS payment totals per order
  const qegosPayments = new Map<string, number>();
  for (const order of orders) {
    const payments = await PaymentModel.find({
      orderId: order._id,
      status: 'succeeded',
    }).select('amount').lean();

    const totalCents = (payments as any[]).reduce(
      (sum: number, p: { amount: number }) => sum + p.amount, 0,
    );
    qegosPayments.set((order as any)._id.toString(), totalCents);
  }

  // Get Xero invoice payment totals
  const xeroPayments = await callXeroApi(async (accessToken, tenantId) => {
    const xeroInvoiceIds = (orders as any[])
      .map((o: { xeroInvoiceId: string }) => o.xeroInvoiceId)
      .filter(Boolean);

    const paymentMap = new Map<string, number>();

    // Fetch in batches of 50
    for (let i = 0; i < xeroInvoiceIds.length; i += 50) {
      const batch = xeroInvoiceIds.slice(i, i + 50);
      const ids = batch.join(',');

      const res = await fetch(
        `https://api.xero.com/api.xro/2.0/Invoices?IDs=${encodeURIComponent(ids)}&Statuses=AUTHORISED,PAID`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            Accept: 'application/json',
          },
        },
      );

      if (res.ok) {
        const data = await res.json() as {
          Invoices: Array<{
            InvoiceID: string;
            AmountPaid: number;
          }>;
        };
        for (const inv of data.Invoices) {
          // Convert Xero dollars to cents
          paymentMap.set(inv.InvoiceID, Math.round(inv.AmountPaid * 100));
        }
      }
    }

    return paymentMap;
  });

  // Compare
  const result: ReconciliationResult = {
    matched: 0,
    mismatched: [],
    xeroOnly: [],
    qegosOnly: [],
    total: orders.length,
  };

  for (const order of orders) {
    const orderId = (order as any)._id.toString();
    const qegosCents = qegosPayments.get(orderId) ?? 0;
    const xeroCents = xeroPayments.get((order as any).xeroInvoiceId as string) ?? 0;
    const diff = Math.abs(qegosCents - xeroCents);

    if (diff <= RECONCILIATION_THRESHOLD_CENTS) {
      result.matched++;
    } else {
      result.mismatched.push({
        orderId,
        orderNumber: (order as any).orderNumber as string,
        qegosAmountCents: qegosCents,
        xeroAmountCents: xeroCents,
        differenceCents: diff,
      });
    }
  }

  return result;
}
