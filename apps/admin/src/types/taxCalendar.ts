export type DeadlineType =
  | 'individual_filing'
  | 'bas_quarterly'
  | 'bas_monthly'
  | 'payg_instalment'
  | 'super_guarantee'
  | 'fringe_benefits'
  | 'company_return'
  | 'trust_return'
  | 'smsf_return'
  | 'custom';

export const DEADLINE_TYPE_LABELS: Record<DeadlineType, string> = {
  individual_filing: 'Individual Filing',
  bas_quarterly: 'BAS Quarterly',
  bas_monthly: 'BAS Monthly',
  payg_instalment: 'PAYG Instalment',
  super_guarantee: 'Super Guarantee',
  fringe_benefits: 'Fringe Benefits',
  company_return: 'Company Return',
  trust_return: 'Trust Return',
  smsf_return: 'SMSF Return',
  custom: 'Custom',
};

export interface TaxDeadline {
  _id: string;
  title: string;
  description?: string;
  deadlineDate: string;
  type: DeadlineType;
  applicableTo: string;
  financialYear: string;
  isRecurring: boolean;
  isActive: boolean;
  notificationsSent?: number;
  createdAt: string;
}

export interface TaxDeadlineListQuery {
  page?: number;
  limit?: number;
  type?: DeadlineType;
  financialYear?: string;
}
