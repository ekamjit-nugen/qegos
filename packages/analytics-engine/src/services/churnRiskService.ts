import type { Model, Document } from 'mongoose';
import type { ChurnRiskEntry } from '../types';

/**
 * Churn risk: clients who filed last financial year but haven't started current year.
 * Anti-join pattern using aggregation $lookup.
 */
export async function getChurnRisk(
  TaxYearSummaryModel: Model<Document>,
  UserModel: Model<Document>,
  financialYear: string,
): Promise<{ atRiskClients: ChurnRiskEntry[]; riskCount: number }> {
  // Determine previous financial year
  // Financial year format: "2024-25" → previous is "2023-24"
  const [startYear] = financialYear.split('-').map(Number);
  const prevFY = `${startYear - 1}-${String(startYear).slice(2)}`;

  const now = new Date();

  // Find users who filed in previous FY
  const previousFilers = await TaxYearSummaryModel.aggregate([
    { $match: { financialYear: prevFY } },
    {
      $lookup: {
        from: TaxYearSummaryModel.collection.name,
        let: { uid: '$userId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$userId', '$$uid'] },
                  { $eq: ['$financialYear', financialYear] },
                ],
              },
            },
          },
        ],
        as: 'currentFiling',
      },
    },
    // Anti-join: no filing in current FY
    { $match: { currentFiling: { $size: 0 } } },
    {
      $lookup: {
        from: UserModel.collection.name,
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        userId: 1,
        lastFilingFY: '$financialYear',
        lastFilingDate: '$filingDate',
        name: { $concat: [{ $ifNull: ['$user.firstName', ''] }, ' ', { $ifNull: ['$user.lastName', ''] }] },
        email: '$user.email',
      },
    },
  ]);

  const atRiskClients: ChurnRiskEntry[] = previousFilers.map((f) => {
    const daysSince = f.lastFilingDate
      ? Math.floor((now.getTime() - new Date(f.lastFilingDate).getTime()) / 86400000)
      : 365;

    // Risk score: higher days = higher risk, max 1.0
    const riskScore = Math.min(1, daysSince / 730);

    return {
      userId: String(f.userId),
      name: (f.name ?? '').trim(),
      email: f.email ?? '',
      lastFilingFY: f.lastFilingFY,
      lastFilingDate: f.lastFilingDate ? new Date(f.lastFilingDate).toISOString() : '',
      daysSinceLastFiling: daysSince,
      riskScore: Math.round(riskScore * 100) / 100,
    };
  });

  // Sort by risk score descending
  atRiskClients.sort((a, b) => b.riskScore - a.riskScore);

  return {
    atRiskClients,
    riskCount: atRiskClients.length,
  };
}
