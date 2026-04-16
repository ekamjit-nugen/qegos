import type { Model } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type { IXeroSyncLogDocument, IXeroConfigDocument } from '../types';
import { callXeroApi, XeroOfflineError } from './xeroClient';

// ─── Module State ───────────────────────────────────────────────────────────

let XeroSyncLogModel: Model<IXeroSyncLogDocument>;
let XeroConfigModel: Model<IXeroConfigDocument>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<IOrderDocument>
let OrderModel: Model<any>;

export function initCreditNoteSync(
  syncLogModel: Model<IXeroSyncLogDocument>,
  configModel: Model<IXeroConfigDocument>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<IOrderDocument>
  orderModel: Model<any>,
): void {
  XeroSyncLogModel = syncLogModel;
  XeroConfigModel = configModel;
  OrderModel = orderModel;
}

// ─── Create Credit Note for Refund ──────────────────────────────────────

export async function createCreditNote(
  orderId: string,
  refundAmountCents: number,
  reference: string,
): Promise<{ xeroCreditNoteId: string }> {
  const order = await OrderModel.findById(orderId);
  if (!order) {
    throw AppError.notFound('Order');
  }
  if (!order.xeroInvoiceId) {
    throw AppError.badRequest('Order has no Xero invoice to credit');
  }

  const config = await XeroConfigModel.findOne().lean();
  const accountCode = config?.xeroRevenueAccountCode ?? '200';

  const syncLog = await XeroSyncLogModel.create({
    entityType: 'credit_note',
    entityId: orderId,
    action: 'create',
    status: 'processing',
    requestPayload: { orderId, refundAmountCents, reference },
  });

  try {
    const result = await callXeroApi(async (accessToken, tenantId) => {
      // First get the invoice to find contact
      const invoiceRes = await fetch(
        `https://api.xero.com/api.xro/2.0/Invoices/${order.xeroInvoiceId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            Accept: 'application/json',
          },
        },
      );

      if (!invoiceRes.ok) {
        throw new Error(`Failed to fetch Xero invoice: ${invoiceRes.status}`);
      }

      const invoiceData = (await invoiceRes.json()) as {
        Invoices: Array<{ Contact: { ContactID: string } }>;
      };
      const contactId = invoiceData.Invoices[0]?.Contact?.ContactID;

      const creditNotePayload = {
        Type: 'ACCRECCREDIT',
        Contact: { ContactID: contactId },
        Reference: reference,
        Status: 'AUTHORISED',
        LineAmountTypes: 'Inclusive',
        LineItems: [
          {
            Description: `Refund for ${order.orderNumber ?? orderId}`,
            Quantity: 1,
            UnitAmount: refundAmountCents / 100,
            AccountCode: accountCode,
          },
        ],
        CurrencyCode: 'AUD',
      };

      const res = await fetch('https://api.xero.com/api.xro/2.0/CreditNotes', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(creditNotePayload),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Xero credit note creation failed: ${res.status} ${errBody}`);
      }

      const data = (await res.json()) as {
        CreditNotes: Array<{ CreditNoteID: string }>;
      };
      const creditNoteId = data.CreditNotes[0].CreditNoteID;

      // Allocate credit note to invoice
      await fetch(`https://api.xero.com/api.xro/2.0/CreditNotes/${creditNoteId}/Allocations`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          Allocations: [
            {
              Invoice: { InvoiceID: order.xeroInvoiceId },
              Amount: refundAmountCents / 100,
            },
          ],
        }),
      });

      return { creditNoteId };
    });

    syncLog.status = 'success';
    syncLog.xeroEntityId = result.creditNoteId;
    syncLog.processedAt = new Date();
    await syncLog.save();

    await XeroConfigModel.findOneAndUpdate({}, { $set: { lastSyncAt: new Date() } });

    return { xeroCreditNoteId: result.creditNoteId };
  } catch (err: unknown) {
    syncLog.status = err instanceof XeroOfflineError ? 'queued' : 'failed';
    syncLog.error = (err as Error).message;
    await syncLog.save();
    throw err;
  }
}
