export interface TaxYearSummary {
  _id: string;
  userId: string;
  financialYear: string;
  totalIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  medicareLevyAmount: number;
  hecsRepayment: number;
  totalTaxPayable: number;
  taxWithheld: number;
  refundOrOwing: number;
  superannuationReported: number;
  filingDate?: string;
  assessmentDate?: string;
  noaReceived: boolean;
  atoRefundStatus: 'pending' | 'approved' | 'rejected' | 'paid';
  atoRefundIssuedDate?: string;
  createdAt: string;
}

export interface AtoStatus {
  status: string;
  assessmentDate?: string;
  noaReceived: boolean;
  refundIssuedDate?: string;
}

export interface YearComparison {
  current: TaxYearSummary;
  previous: TaxYearSummary | null;
  changes: Record<
    string,
    {
      current: number;
      previous: number;
      delta: number;
      percentChange: number;
    }
  >;
}
