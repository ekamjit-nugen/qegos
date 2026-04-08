export interface TaxSummary {
  _id: string;
  userId: string;
  financialYear: string;
  totalIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  taxPayable: number;
  taxWithheld: number;
  refundOrOwing: number;
  isRefund: boolean;
  lodgementDate?: string;
  assessmentDate?: string;
  createdAt: string;
}

export interface AtoStatus {
  financialYear: string;
  status: 'not_lodged' | 'lodged' | 'processing' | 'assessed' | 'amended';
  noticeOfAssessment?: string;
  lastChecked?: string;
}
