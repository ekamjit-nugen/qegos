import type { Model, FilterQuery } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type {
  ILeadDocument,
  ILeadActivityDocument,
} from './lead.types';

export interface LeadActivityServiceDeps {
  LeadModel: Model<ILeadDocument>;
  LeadActivityModel: Model<ILeadActivityDocument>;
  recalculateScore: (leadId: string) => Promise<{ score: number; priority: string }>;
}

export interface ActivityListResult {
  activities: ILeadActivityDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LeadActivityServiceResult {
  logActivity: (data: Partial<ILeadActivityDocument>) => Promise<ILeadActivityDocument>;
  getActivities: (leadId: string, pagination: { page?: number; limit?: number }, scopeFilter?: Record<string, unknown>) => Promise<ActivityListResult>;
  updateActivity: (id: string, data: Partial<ILeadActivityDocument>) => Promise<ILeadActivityDocument>;
  logCall: (data: { leadId: string; callDuration: number; callDirection: string; outcome?: string; description: string; nextAction?: string; nextActionDate?: string; performedBy: string }) => Promise<ILeadActivityDocument>;
  getTodaysCalls: (staffId: string) => Promise<ILeadActivityDocument[]>;
  getStaffActivities: (staffId: string, pagination: { page?: number; limit?: number }) => Promise<ActivityListResult>;
}

export function createLeadActivityService(deps: LeadActivityServiceDeps): LeadActivityServiceResult {
  const { LeadModel, LeadActivityModel, recalculateScore } = deps;

  async function logActivity(data: Partial<ILeadActivityDocument>): Promise<ILeadActivityDocument> {
    if (!data.leadId) throw AppError.badRequest('Lead ID is required');

    const lead = await LeadModel.findById(data.leadId);
    if (!lead) throw AppError.notFound('Lead');

    const activity = await LeadActivityModel.create({
      ...data,
      servicesQuoted: data.servicesQuoted ?? [],
      attachments: data.attachments ?? [],
      isSystemGenerated: data.isSystemGenerated ?? false,
    });

    // Update lead's lastContactedAt and followUpCount
    const updateData: Record<string, unknown> = {
      lastContactedAt: new Date(),
    };
    if (data.nextAction) updateData.nextAction = data.nextAction;
    if (data.nextActionDate) updateData.nextActionDate = data.nextActionDate;

    await LeadModel.findByIdAndUpdate(data.leadId, {
      $set: updateData,
      $inc: { followUpCount: 1 },
    });

    // Trigger score recalculation
    await recalculateScore(data.leadId.toString());

    return activity;
  }

  async function getActivities(
    leadId: string,
    pagination: { page?: number; limit?: number },
    scopeFilter?: Record<string, unknown>,
  ): Promise<ActivityListResult> {
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Verify lead exists and user has access
    const leadFilter: FilterQuery<ILeadDocument> = { _id: leadId };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(leadFilter, scopeFilter);
    }
    const lead = await LeadModel.findOne(leadFilter);
    if (!lead) throw AppError.notFound('Lead');

    const filter: FilterQuery<ILeadActivityDocument> = { leadId };

    const [activities, total] = await Promise.all([
      LeadActivityModel.find(filter)
        .populate('performedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<ILeadActivityDocument[]>(),
      LeadActivityModel.countDocuments(filter),
    ]);

    return {
      activities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async function updateActivity(
    id: string,
    data: Partial<ILeadActivityDocument>,
  ): Promise<ILeadActivityDocument> {
    // Only allow editing notes/outcome
    const allowedFields: Record<string, unknown> = {};
    if (data.description !== undefined) allowedFields.description = data.description;
    if (data.outcome !== undefined) allowedFields.outcome = data.outcome;
    if (data.subject !== undefined) allowedFields.subject = data.subject;
    if (data.sentiment !== undefined) allowedFields.sentiment = data.sentiment;

    const activity = await LeadActivityModel.findByIdAndUpdate(
      id,
      allowedFields,
      { new: true, runValidators: true },
    );
    if (!activity) throw AppError.notFound('Activity');
    return activity;
  }

  async function logCall(data: {
    leadId: string;
    callDuration: number;
    callDirection: string;
    outcome?: string;
    description: string;
    nextAction?: string;
    nextActionDate?: string;
    performedBy: string;
  }): Promise<ILeadActivityDocument> {
    return logActivity({
      leadId: data.leadId as unknown as ILeadActivityDocument['leadId'],
      type: data.callDirection === 'inbound' ? 'phone_call_inbound' : 'phone_call_outbound',
      description: data.description,
      callDuration: data.callDuration,
      callDirection: data.callDirection as ILeadActivityDocument['callDirection'],
      outcome: data.outcome as ILeadActivityDocument['outcome'],
      nextAction: data.nextAction,
      nextActionDate: data.nextActionDate ? new Date(data.nextActionDate) : undefined,
      performedBy: data.performedBy as unknown as ILeadActivityDocument['performedBy'],
    });
  }

  async function getTodaysCalls(staffId: string): Promise<ILeadActivityDocument[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    return LeadActivityModel.find({
      performedBy: staffId,
      type: { $in: ['phone_call_outbound', 'phone_call_inbound', 'phone_call_missed'] },
      createdAt: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('leadId', 'leadNumber firstName lastName mobile')
      .sort({ createdAt: -1 })
      .lean<ILeadActivityDocument[]>();
  }

  async function getStaffActivities(
    staffId: string,
    pagination: { page?: number; limit?: number },
  ): Promise<ActivityListResult> {
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 20, 100);
    const skip = (page - 1) * limit;

    const filter: FilterQuery<ILeadActivityDocument> = { performedBy: staffId };

    const [activities, total] = await Promise.all([
      LeadActivityModel.find(filter)
        .populate('leadId', 'leadNumber firstName lastName mobile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<ILeadActivityDocument[]>(),
      LeadActivityModel.countDocuments(filter),
    ]);

    return {
      activities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  return {
    logActivity,
    getActivities,
    updateActivity,
    logCall,
    getTodaysCalls,
    getStaffActivities,
  };
}
