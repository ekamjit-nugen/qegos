import type { Request } from 'express';
import type { Types } from 'mongoose';
import type { AtoRefundStatus } from '@nugen/file-storage';

// ─── Authenticated Request ──────────────────────────────────────────────────

export interface AuthUser {
  userId: string;
  userType: number;
  roleId: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

// ─── Vault Upload ───────────────────────────────────────────────────────────

export interface UploadDocumentBody {
  financialYear: string;
  category: string;
  description?: string;
  tags?: string[];
}

// ─── ATO Status Update ─────────────────────────────────────────────────────

export interface AtoStatusUpdateBody {
  userId: string;
  atoRefundStatus: AtoRefundStatus;
  assessmentDate?: string;
  noaReceived?: boolean;
  atoRefundIssuedDate?: string;
}

export interface BulkAtoStatusUpdate {
  userId: string;
  financialYear: string;
  atoRefundStatus: AtoRefundStatus;
  assessmentDate?: string;
  noaReceived?: boolean;
  atoRefundIssuedDate?: string;
}

// ─── Tax Summary Creation ───────────────────────────────────────────────────

export interface CreateTaxSummaryBody {
  userId: string;
  financialYear: string;
  orderId?: string;
  totalIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  medicareLevyAmount: number;
  hecsRepayment: number;
  totalTaxPayable: number;
  taxWithheld: number;
  refundOrOwing: number;
  superannuationReported?: number;
  filingDate?: string;
  assessmentDate?: string;
  noaReceived?: boolean;
  atoRefundStatus?: AtoRefundStatus;
  servicesUsed?: string[];
  totalPaidToQegos?: number;
}
