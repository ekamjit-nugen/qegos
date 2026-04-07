import type {
  GSTCalculation,
  LineItemWithGST,
  OrderGSTSummary,
} from '../types';

/**
 * BIL-INV-01: Calculate GST for a single line item.
 * ATO requirement: GST calculated PER LINE ITEM, rounded to nearest cent.
 *
 * For GST-inclusive prices: GST = Math.round(priceInCents / 11)
 * For GST-exclusive prices: GST = Math.round(priceInCents / 10)
 *
 * All arithmetic in integer cents — no floating point.
 */
export function calculateLineItemGST(
  priceInCents: number,
  gstInclusive: boolean,
): GSTCalculation {
  if (!Number.isInteger(priceInCents) || priceInCents < 0) {
    throw new Error('Price must be a non-negative integer (cents)');
  }

  if (priceInCents === 0) {
    return {
      priceInCents: 0,
      gstAmountInCents: 0,
      priceExGstInCents: 0,
      gstInclusive,
    };
  }

  let gstAmountInCents: number;
  let priceExGstInCents: number;

  if (gstInclusive) {
    // Price includes GST: GST = price / 11 (Australian GST rate is 10%)
    gstAmountInCents = Math.round(priceInCents / 11);
    priceExGstInCents = priceInCents - gstAmountInCents;
  } else {
    // Price excludes GST: GST = price / 10
    gstAmountInCents = Math.round(priceInCents / 10);
    priceExGstInCents = priceInCents;
  }

  return {
    priceInCents: gstInclusive ? priceInCents : priceInCents + gstAmountInCents,
    gstAmountInCents,
    priceExGstInCents,
    gstInclusive,
  };
}

/**
 * BIL-INV-01: Calculate GST for an entire order.
 * CRITICAL: Sum per-item GST. NEVER calculate GST on the total.
 *
 * Each line item has its own quantity, and GST is calculated on the
 * per-item price then multiplied by quantity.
 */
export function calculateOrderGST(lineItems: LineItemWithGST[]): OrderGSTSummary {
  const itemResults: OrderGSTSummary['lineItems'] = [];
  let totalGstInCents = 0;
  let subtotalInCents = 0;

  for (const item of lineItems) {
    if (!Number.isInteger(item.priceInCents) || item.priceInCents < 0) {
      throw new Error(`Invalid price for line item "${item.description}": must be a non-negative integer`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      throw new Error(`Invalid quantity for line item "${item.description}": must be a non-negative integer`);
    }

    // Calculate GST per single unit
    const unitGst = calculateLineItemGST(item.priceInCents, item.gstInclusive);

    // Multiply by quantity for line totals
    const lineGst = unitGst.gstAmountInCents * item.quantity;
    const lineTotal = unitGst.priceInCents * item.quantity;

    totalGstInCents += lineGst;
    subtotalInCents += unitGst.priceExGstInCents * item.quantity;

    itemResults.push({
      ...item,
      gstAmountInCents: lineGst,
      totalInCents: lineTotal,
    });
  }

  return {
    lineItems: itemResults,
    subtotalInCents,
    totalGstInCents,
    grandTotalInCents: subtotalInCents + totalGstInCents,
  };
}
