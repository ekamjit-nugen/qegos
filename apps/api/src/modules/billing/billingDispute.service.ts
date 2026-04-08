import type { Model, Types } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type { IBillingDisputeDocument, DisputeStatus } from './billingDispute.types';
import { VALID_DISPUTE_TRANSITIONS } from './billingDispute.types';

// ─── Module State ───────────────────────────────────────────────────────────

let BillingDisputeModel: Model<IBillingDisputeDocument>;

export function initBillingService(model: Model<IBillingDisputeDocument>): void {
  BillingDisputeModel = model;
}

// ─── Create Dispute ────────────────────────────────────────────────────────

export interface CreateDisputeParams {
  orderId: string;
  paymentId: string;
  disputeType: string;
  disputedAmount: number;
  clientStatement: string;
  ticketId?: string;
}

export async function createDispute(
  params: CreateDisputeParams,
): Promise<IBillingDisputeDocument> {
  return BillingDisputeModel.create({
    ...params,
    status: 'raised',
  });
}

// ─── List Disputes ─────────────────────────────────────────────────────────

export interface ListDisputesParams {
  status?: string;
  disputeType?: string;
  scopeFilter?: Record<string, unknown>;
  page?: number;
  limit?: number;
}

export async function listDisputes(
  params: ListDisputesParams,
): Promise<{ disputes: IBillingDisputeDocument[]; total: number }> {
  const { status, disputeType, scopeFilter, page = 1, limit = 20 } = params;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (disputeType) filter.disputeType = disputeType;
  if (scopeFilter && Object.keys(scopeFilter).length > 0) {
    Object.assign(filter, scopeFilter);
  }

  const skip = (page - 1) * limit;

  const [disputes, total] = await Promise.all([
    BillingDisputeModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BillingDisputeModel.countDocuments(filter),
  ]);

  return { disputes: disputes as IBillingDisputeDocument[], total };
}

// ─── Get Dispute ───────────────────────────────────────────────────────────

export async function getDispute(
  id: string,
  scopeFilter?: Record<string, unknown>,
): Promise<IBillingDisputeDocument> {
  const query: Record<string, unknown> = { _id: id };
  if (scopeFilter && Object.keys(scopeFilter).length > 0) {
    Object.assign(query, scopeFilter);
  }

  const dispute = await BillingDisputeModel.findOne(query).lean();
  if (!dispute) {
    throw AppError.notFound('Billing dispute');
  }

  return dispute as IBillingDisputeDocument;
}

// ─── Update Dispute ────────────────────────────────────────────────────────

export interface UpdateDisputeParams {
  status?: DisputeStatus;
  staffAssessment?: string;
  resolution?: string;
  resolvedAmount?: number;
}

export interface UpdateDisputeResult {
  dispute: IBillingDisputeDocument;
  changes: Record<string, { from: unknown; to: unknown }>;
}

export async function updateDispute(
  id: string,
  updates: UpdateDisputeParams,
  approvedByUserId: string,
  scopeFilter?: Record<string, unknown>,
): Promise<UpdateDisputeResult> {
  const query: Record<string, unknown> = { _id: id };
  if (scopeFilter && Object.keys(scopeFilter).length > 0) {
    Object.assign(query, scopeFilter);
  }

  const dispute = await BillingDisputeModel.findOne(query);
  if (!dispute) {
    throw AppError.notFound('Billing dispute');
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (updates.status) {
    const allowed = VALID_DISPUTE_TRANSITIONS[dispute.status];
    if (!allowed.includes(updates.status)) {
      throw AppError.badRequest(
        `Invalid dispute status transition: ${dispute.status} -> ${updates.status}`,
      );
    }
    changes.status = { from: dispute.status, to: updates.status };
    dispute.status = updates.status;
  }

  if (updates.staffAssessment !== undefined) {
    changes.staffAssessment = { from: dispute.staffAssessment, to: updates.staffAssessment };
    dispute.staffAssessment = updates.staffAssessment;
  }

  if (updates.resolution !== undefined) {
    changes.resolution = { from: dispute.resolution, to: updates.resolution };
    dispute.resolution = updates.resolution as IBillingDisputeDocument['resolution'];
  }

  if (updates.resolvedAmount !== undefined) {
    changes.resolvedAmount = { from: dispute.resolvedAmount, to: updates.resolvedAmount };
    dispute.resolvedAmount = updates.resolvedAmount;
  }

  if (updates.status === 'approved') {
    dispute.approvedBy = approvedByUserId as unknown as Types.ObjectId;
  }

  await dispute.save();

  return { dispute, changes };
}

// ─── Soft Delete Dispute ───────────────────────────────────────────────────

export async function softDeleteDispute(
  id: string,
  scopeFilter?: Record<string, unknown>,
): Promise<IBillingDisputeDocument> {
  const query: Record<string, unknown> = { _id: id };
  if (scopeFilter && Object.keys(scopeFilter).length > 0) {
    Object.assign(query, scopeFilter);
  }

  const dispute = await BillingDisputeModel.findOne(query);
  if (!dispute) {
    throw AppError.notFound('Billing dispute');
  }

  dispute.isDeleted = true;
  dispute.deletedAt = new Date();
  await dispute.save();

  return dispute;
}
