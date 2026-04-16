import type { Model } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type { IXeroSyncLogDocument, IXeroConfigDocument } from '../types';
import { calculateGst } from '../types';
import { callXeroApi, XeroOfflineError } from './xeroClient';
import { syncContact } from './contactSync';

// ─── Module State ───────────────────────────────────────────────────────────

let XeroSyncLogModel: Model<IXeroSyncLogDocument>;
let XeroConfigModel: Model<IXeroConfigDocument>;
let OrderModel: Model<any>;

export function initInvoiceSync(
  syncLogModel: Model<IXeroSyncLogDocument>,
  configModel: Model<IXeroConfigDocument>,
  orderModel: Model<any>,
  _userModel: Model<any>,
): void {
  XeroSyncLogModel = syncLogModel;
  XeroConfigModel = configModel;
  OrderModel = orderModel;
}

// ─── Create Invoice (XRO-INV-04, XRO-INV-07, XRO-INV-11) ──────────────

export async function createInvoice(orderId: string): Promise<{
  xeroInvoiceId: string;
  xeroInvoiceNumber: string;
}> {
  const order = await OrderModel.findById(orderId);
  if (!order) {
    throw AppError.notFound('Order');
  }

  // XRO-INV-04: Dual idempotency — check local first
  if (order.xeroInvoiceId) {
    return {
      xeroInvoiceId: order.xeroInvoiceId as string,
      xeroInvoiceNumber: order.xeroInvoiceNumber as string,
    };
  }

  // Ensure contact exists in Xero
  const { xeroContactId } = await syncContact(order.userId.toString());

  const config = await XeroConfigModel.findOne().lean();
  const accountCode = config?.xeroRevenueAccountCode ?? '200';
  const taxType = config?.xeroDefaultTaxType ?? 'OUTPUT';

  const syncLog = await XeroSyncLogModel.create({
    entityType: 'invoice',
    entityId: orderId,
    action: 'create',
    status: 'processing',
    requestPayload: { orderId, orderNumber: order.orderNumber },
  });

  try {
    const result = await callXeroApi(async (accessToken, tenantId) => {
      // XRO-INV-04: Dual idempotency — search Xero by reference (orderNumber)
      const existingInvoice = await searchXeroInvoiceByReference(
        accessToken,
        tenantId,
        order.orderNumber as string,
      );

      if (existingInvoice) {
        return {
          invoiceId: existingInvoice.InvoiceID as string,
          invoiceNumber: existingInvoice.InvoiceNumber as string,
        };
      }

      // XRO-INV-07: Build line items using priceAtCreation, NOT catalogue price
      const lineItems = buildLineItems(order.lineItems ?? [], accountCode, taxType);

      const invoicePayload = {
        Type: 'ACCREC', // Accounts Receivable
        Contact: { ContactID: xeroContactId },
        Reference: order.orderNumber,
        Status: 'AUTHORISED',
        LineAmountTypes: 'Inclusive', // Australian GST inclusive
        LineItems: lineItems,
        CurrencyCode: 'AUD',
      };

      const res = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ Invoices: [invoicePayload] }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Xero invoice creation failed: ${res.status} ${errBody}`);
      }

      const data = (await res.json()) as {
        Invoices: Array<{ InvoiceID: string; InvoiceNumber: string }>;
      };
      const invoice = data.Invoices[0];
      return { invoiceId: invoice.InvoiceID, invoiceNumber: invoice.InvoiceNumber };
    });

    // Store Xero IDs on Order
    order.xeroInvoiceId = result.invoiceId;
    order.xeroInvoiceNumber = result.invoiceNumber;
    await order.save();

    // Update sync log
    syncLog.status = 'success';
    syncLog.xeroEntityId = result.invoiceId;
    syncLog.processedAt = new Date();
    await syncLog.save();

    // Update last sync time
    await XeroConfigModel.findOneAndUpdate({}, { $set: { lastSyncAt: new Date() } });

    return { xeroInvoiceId: result.invoiceId, xeroInvoiceNumber: result.invoiceNumber };
  } catch (err: unknown) {
    syncLog.status = err instanceof XeroOfflineError ? 'queued' : 'failed';
    syncLog.error = (err as Error).message;
    await syncLog.save();
    throw err;
  }
}

// ─── Void Invoice (XRO-INV-08) ──────────────────────────────────────────

export async function voidInvoice(orderId: string, adminOverride = false): Promise<void> {
  const order = await OrderModel.findById(orderId);
  if (!order) {
    throw AppError.notFound('Order');
  }
  if (!order.xeroInvoiceId) {
    throw AppError.badRequest('Order has no Xero invoice');
  }

  // XRO-INV-08: Void requires Order.status = 9 (Cancelled) or admin override
  if (order.status !== 9 && !adminOverride) {
    throw AppError.badRequest(
      'Invoice can only be voided when order is cancelled (status 9) or via admin override',
    );
  }

  const syncLog = await XeroSyncLogModel.create({
    entityType: 'invoice',
    entityId: orderId,
    action: 'void',
    status: 'processing',
    requestPayload: { xeroInvoiceId: order.xeroInvoiceId },
  });

  try {
    await callXeroApi(async (accessToken, tenantId) => {
      const res = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${order.xeroInvoiceId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          InvoiceID: order.xeroInvoiceId,
          Status: 'VOIDED',
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Xero invoice void failed: ${res.status} ${errBody}`);
      }
    });

    syncLog.status = 'success';
    syncLog.processedAt = new Date();
    await syncLog.save();
  } catch (err: unknown) {
    syncLog.status = err instanceof XeroOfflineError ? 'queued' : 'failed';
    syncLog.error = (err as Error).message;
    await syncLog.save();
    throw err;
  }
}

// ─── Adjust Invoice (BIL-INV-02: void + recreate) ──────────────────────

export async function adjustInvoice(orderId: string): Promise<{
  xeroInvoiceId: string;
  xeroInvoiceNumber: string;
}> {
  const order = await OrderModel.findById(orderId);
  if (!order) {
    throw AppError.notFound('Order');
  }

  if (order.xeroInvoiceId) {
    // Void existing invoice first
    await voidInvoice(orderId, true);
    order.xeroInvoiceId = undefined;
    order.xeroInvoiceNumber = undefined;
    await order.save();
  }

  // Create fresh invoice with current line items
  return createInvoice(orderId);
}

// ─── Bulk Sync Invoices ─────────────────────────────────────────────────

export async function bulkSyncInvoices(): Promise<{ synced: number; failed: number }> {
  const orders = await OrderModel.find({
    xeroInvoiceId: { $exists: false },
    status: { $gte: 4 }, // In Progress or later
  })
    .select('_id')
    .lean();

  let synced = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      await createInvoice((order as any)._id.toString());
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function searchXeroInvoiceByReference(
  accessToken: string,
  tenantId: string,
  reference: string,
): Promise<Record<string, unknown> | null> {
  const where = `Reference=="${reference}"`;
  const res = await fetch(
    `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(where)}&Statuses=AUTHORISED`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-Tenant-Id': tenantId,
        Accept: 'application/json',
      },
    },
  );

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { Invoices: Array<Record<string, unknown>> };
  return data.Invoices?.[0] ?? null;
}

/**
 * XRO-INV-07: Build Xero line items from Order.lineItems using priceAtCreation.
 * XRO-INV-11: GST = Math.round(priceInclusive / 11).
 */
function buildLineItems(
  orderLineItems: Array<{
    description?: string;
    serviceName?: string;
    priceAtCreation: number;
    quantity?: number;
  }>,
  accountCode: string,
  taxType: string,
): Array<Record<string, unknown>> {
  return orderLineItems.map((item) => {
    const quantity = item.quantity ?? 1;
    // XRO-INV-07: Use priceAtCreation (integer cents), convert to dollars for Xero
    const unitAmountDollars = item.priceAtCreation / 100;
    // XRO-INV-11: GST component
    // XRO-INV-11: GST component (used by Xero LineAmountTypes=Inclusive)
    calculateGst(item.priceAtCreation * quantity);

    return {
      Description: item.description ?? item.serviceName ?? 'Tax Service',
      Quantity: quantity,
      UnitAmount: unitAmountDollars,
      AccountCode: accountCode,
      TaxType: taxType,
      LineAmount: (item.priceAtCreation * quantity) / 100,
    };
  });
}
