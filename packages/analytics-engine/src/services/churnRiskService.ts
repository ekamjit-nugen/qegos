/**
 * Churn Risk Service — Identify clients who filed last FY but not current FY
 */

import type { Model } from 'mongoose';
import type { ChurnRiskEntry } from '../types';

/**
 * Anti-join: users who had a TaxYearSummary for previousFY but not currentFY.
 */
export async function getChurnRisk(
  TaxYearSummaryModel: Model<any>,
  UserModel: Model<any>,
  financialYear: string,
): Promise<ChurnRiskEntry[]> {
  // Parse current FY to find previous (e.g., "2025-2026" → "2024-2025")
  const parts = financialYear.split('-').map(Number);
  const previousFY = `${parts[0] - 1}-${parts[1] - 1}`;

  // Users who filed last FY
  const lastFYUsers = await TaxYearSummaryModel.aggregate([
    { $match: { financialYear: previousFY } },
    { $group: { _id: '$userId' } },
  ]);
  const lastFYUserIds = lastFYUsers.map((u: { _id: unknown }) => u._id);

  if (lastFYUserIds.length === 0) {
    return [];
  }

  // Users who filed current FY
  const currentFYUsers = await TaxYearSummaryModel.aggregate([
    { $match: { financialYear, userId: { $in: lastFYUserIds } } },
    { $group: { _id: '$userId' } },
  ]);
  const currentFYUserIdSet = new Set(
    currentFYUsers.map((u: { _id: { toString: () => string } }) => u._id.toString()),
  );

  // At-risk = last FY minus current FY
  const atRiskIds = lastFYUserIds.filter((id: unknown) => !currentFYUserIdSet.has(String(id)));

  if (atRiskIds.length === 0) {
    return [];
  }

  // Fetch user details and last payment
  const users = await UserModel.find(
    { _id: { $in: atRiskIds }, isDeleted: { $ne: true } },
    { firstName: 1, lastName: 1, createdAt: 1 },
  ).lean();

  const now = Date.now();
  return users.map((u: Record<string, unknown>) => ({
    userId: String(u._id),
    displayName: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
    lastFinancialYear: previousFY,
    totalPaidCents: 0, // Could be enriched from TaxYearSummary.totalPaidToQegos
    daysSinceLastOrder: Math.round(
      (now - new Date(u.createdAt as string).getTime()) / (1000 * 60 * 60 * 24),
    ),
  })) as ChurnRiskEntry[];
}
