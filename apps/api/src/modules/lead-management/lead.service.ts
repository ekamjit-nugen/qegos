import type { Model, FilterQuery, Connection } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type {
  ILeadDocument,
  ILeadActivityDocument,
  ILeadReminderDocument,
  LeadListQuery,
  LeadListResult,
  LeadPriority,
  DuplicateMatch,
  LeadStatus as LeadStatusType,
} from './lead.types';
import { LeadStatus, LEAD_STATUS_TRANSITIONS, LOST_REASONS } from './lead.types';
import { generateLeadNumber } from './lead.model';

export interface LeadServiceDeps {
  LeadModel: Model<ILeadDocument>;
  LeadActivityModel: Model<ILeadActivityDocument>;
  LeadReminderModel: Model<ILeadReminderDocument>;
  connection: Connection;
}

export interface LeadServiceResult {
  createLead: (data: Partial<ILeadDocument>, performedBy: string) => Promise<{ lead: ILeadDocument; isDuplicate: boolean; duplicateMatches: DuplicateMatch[] }>;
  updateLead: (id: string, data: Partial<ILeadDocument>, scopeFilter?: Record<string, unknown>) => Promise<ILeadDocument>;
  getLead: (id: string, scopeFilter?: Record<string, unknown>) => Promise<ILeadDocument>;
  listLeads: (query: LeadListQuery) => Promise<LeadListResult>;
  transitionStatus: (id: string, newStatus: number, data: { lostReason?: string; lostReasonNote?: string; note?: string }, performedBy: string, scopeFilter?: Record<string, unknown>) => Promise<ILeadDocument>;
  assignLead: (id: string, staffId: string, performedBy: string) => Promise<ILeadDocument>;
  bulkAssign: (leadIds: string[], staffId: string, performedBy: string) => Promise<{ updated: number }>;
  bulkStatusChange: (leadIds: string[], status: number, data: { lostReason?: string; lostReasonNote?: string }, performedBy: string) => Promise<{ updated: number; errors: Array<{ leadId: string; error: string }> }>;
  convertLead: (leadId: string, performedBy: string) => Promise<{ lead: ILeadDocument; orderId: string; userId: string }>;
  convertToExistingUser: (leadId: string, userId: string, performedBy: string) => Promise<{ lead: ILeadDocument; orderId: string }>;
  mergeLead: (primaryId: string, secondaryId: string, fieldSelections: Record<string, 'primary' | 'secondary'>) => Promise<ILeadDocument>;
  checkDuplicate: (mobile?: string, email?: string) => Promise<DuplicateMatch[]>;
  searchLeads: (query: string, scopeFilter?: Record<string, unknown>) => Promise<ILeadDocument[]>;
  calculateScore: (leadId: string) => Promise<{ score: number; priority: LeadPriority }>;
  softDelete: (id: string, scopeFilter?: Record<string, unknown>) => Promise<ILeadDocument>;
  getStats: () => Promise<Record<string, unknown>>;
  getPipelineStats: () => Promise<Record<string, unknown>>;
  getStaffStats: () => Promise<Record<string, unknown>>;
  getSourceStats: () => Promise<Record<string, unknown>>;
  getAgingStats: () => Promise<Record<string, unknown>>;
}

export function createLeadService(deps: LeadServiceDeps): LeadServiceResult {
  const { LeadModel, LeadActivityModel, LeadReminderModel, connection } = deps;

  // ─── Duplicate Check (LM-INV-01) ───────────────────────────────────────

  async function checkDuplicate(mobile?: string, email?: string): Promise<DuplicateMatch[]> {
    if (!mobile && !email) return [];

    const orConditions: FilterQuery<ILeadDocument>[] = [];
    if (mobile) {
      // Normalize for search
      let normalizedMobile = mobile.trim();
      if (/^04\d{8}$/.test(normalizedMobile)) {
        normalizedMobile = `+61${normalizedMobile.substring(1)}`;
      }
      orConditions.push({ mobile: normalizedMobile });
    }
    if (email) {
      orConditions.push({ email: email.toLowerCase().trim() });
    }

    const matches = await LeadModel.find({ $or: orConditions })
      .select('leadNumber firstName lastName mobile email')
      .lean<Array<Pick<ILeadDocument, '_id' | 'leadNumber' | 'firstName' | 'lastName' | 'mobile' | 'email'>>>();

    return matches.map((m) => {
      const matchedOn: ('mobile' | 'email')[] = [];
      if (mobile) {
        let normalizedMobile = mobile.trim();
        if (/^04\d{8}$/.test(normalizedMobile)) {
          normalizedMobile = `+61${normalizedMobile.substring(1)}`;
        }
        if (m.mobile === normalizedMobile) matchedOn.push('mobile');
      }
      if (email && m.email === email.toLowerCase().trim()) matchedOn.push('email');

      return {
        leadId: m._id,
        leadNumber: m.leadNumber,
        firstName: m.firstName,
        lastName: m.lastName,
        mobile: m.mobile,
        email: m.email,
        matchedOn,
        confidence: matchedOn.length > 1 ? 'high' as const : 'medium' as const,
      };
    });
  }

  // ─── Score Calculation (LM-INV-11) ────────────────────────────────────

  async function calculateScore(leadId: string): Promise<{ score: number; priority: LeadPriority }> {
    const lead = await LeadModel.findById(leadId).lean<ILeadDocument>();
    if (!lead) throw AppError.notFound('Lead');

    let score = 0;

    // Positive factors
    if (lead.email) score += 5;
    // Complete profile: check tax profile fields
    const profileFields = [lead.maritalStatus, lead.employmentType, lead.hasRentalProperty, lead.hasSharePortfolio, lead.hasForeignIncome, lead.numberOfDependants];
    if (profileFields.every((f) => f !== undefined && f !== null)) score += 10;
    if (lead.hasRentalProperty) score += 15;
    if (lead.hasSharePortfolio) score += 10;
    if (lead.employmentType === 'self_employed' || lead.employmentType === 'contractor') score += 15;
    if (lead.serviceInterest && lead.serviceInterest.length >= 2) score += 10;
    if (lead.hasSpouse) score += 10;
    if (lead.numberOfDependants && lead.numberOfDependants > 0) score += 5;
    if (lead.source === 'referral') score += 10;
    if (lead.source === 'repeat_client') score += 15;
    if (lead.hasForeignIncome) score += 10;

    // Activity-based factors
    const activities = await LeadActivityModel.find({ leadId })
      .select('outcome createdAt')
      .lean<Array<{ outcome?: string; createdAt: Date }>>();

    const hasPositiveOutcome = activities.some((a) => a.outcome === 'interested');
    if (hasPositiveOutcome) score += 15;

    const hasQuoteRequested = activities.some((a) => a.outcome === 'quote_requested');
    if (hasQuoteRequested) score += 10;

    // Recent contact (within 3 days)
    if (lead.lastContactedAt) {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      if (new Date(lead.lastContactedAt) >= threeDaysAgo) score += 5;
    }

    // Negative factors
    const overdueReminders = await LeadReminderModel.countDocuments({
      leadId,
      isOverdue: true,
      isCompleted: false,
    });
    if (overdueReminders > 0) score -= 10;

    const noAnswerCount = activities.filter((a) => a.outcome === 'no_answer').length;
    if (noAnswerCount >= 3) score -= 10;

    // Gone cold (no activity in 7 days)
    if (activities.length > 0) {
      const latestActivity = activities.reduce((latest, a) =>
        new Date(a.createdAt) > new Date(latest.createdAt) ? a : latest,
      );
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      if (new Date(latestActivity.createdAt) < sevenDaysAgo) score -= 5;
    }

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    // Auto-priority thresholds
    let priority: LeadPriority;
    if (score >= 61) {
      priority = 'hot';
    } else if (score >= 31) {
      priority = 'warm';
    } else {
      priority = 'cold';
    }

    // Update lead
    await LeadModel.findByIdAndUpdate(leadId, { score, priority });

    return { score, priority };
  }

  // ─── Create Lead ──────────────────────────────────────────────────────

  async function createLead(
    data: Partial<ILeadDocument>,
    performedBy: string,
  ): Promise<{ lead: ILeadDocument; isDuplicate: boolean; duplicateMatches: DuplicateMatch[] }> {
    // LM-INV-01: Duplicate check (non-blocking)
    const duplicateMatches = await checkDuplicate(data.mobile, data.email);

    // Generate lead number
    const leadNumber = await generateLeadNumber(LeadModel);

    const lead = await LeadModel.create({
      ...data,
      leadNumber,
      status: data.status ?? LeadStatus.New,
      priority: data.priority ?? 'warm',
      score: 0,
      followUpCount: 0,
      isConverted: false,
      isDeleted: false,
    });

    // Log system activity
    await LeadActivityModel.create({
      leadId: lead._id,
      type: 'note',
      description: `Lead created from ${lead.source}`,
      performedBy,
      isSystemGenerated: true,
      servicesQuoted: [],
      attachments: [],
    });

    // Calculate initial score
    await calculateScore(lead._id.toString());

    // Refetch with updated score
    const updatedLead = await LeadModel.findById(lead._id).lean<ILeadDocument>();

    return {
      lead: updatedLead!,
      isDuplicate: duplicateMatches.length > 0,
      duplicateMatches,
    };
  }

  // ─── Get Lead ─────────────────────────────────────────────────────────

  async function getLead(id: string, scopeFilter?: Record<string, unknown>): Promise<ILeadDocument> {
    const filter: FilterQuery<ILeadDocument> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const lead = await LeadModel.findOne(filter)
      .populate('serviceInterest', 'title price category')
      .populate('assignedTo', 'firstName lastName email')
      .lean<ILeadDocument>();
    if (!lead) throw AppError.notFound('Lead');
    return lead;
  }

  // ─── List Leads ───────────────────────────────────────────────────────

  async function listLeads(query: LeadListQuery): Promise<LeadListResult> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const filter: FilterQuery<ILeadDocument> = {};

    if (query.scopeFilter && Object.keys(query.scopeFilter).length > 0) {
      Object.assign(filter, query.scopeFilter);
    }

    if (query.status !== undefined) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.source) filter.source = query.source;
    if (query.assignedTo) filter.assignedTo = query.assignedTo;
    if (query.state) filter.state = query.state;
    if (query.tags) filter.tags = { $in: query.tags.split(',') };

    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) {
        (filter.createdAt as Record<string, unknown>).$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        (filter.createdAt as Record<string, unknown>).$lte = new Date(query.dateTo);
      }
    }

    if (query.hasFollowUpDue === 'true') {
      filter.nextActionDate = { $lte: new Date() };
    }

    if (query.search) {
      filter.$text = { $search: query.search };
    }

    const [leads, total] = await Promise.all([
      LeadModel.find(filter)
        .populate('assignedTo', 'firstName lastName')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean<ILeadDocument[]>(),
      LeadModel.countDocuments(filter),
    ]);

    return {
      leads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Update Lead ──────────────────────────────────────────────────────

  async function updateLead(
    id: string,
    data: Partial<ILeadDocument>,
    scopeFilter?: Record<string, unknown>,
  ): Promise<ILeadDocument> {
    const filter: FilterQuery<ILeadDocument> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }

    // Prevent overwriting protected fields
    delete (data as Record<string, unknown>).leadNumber;
    delete (data as Record<string, unknown>).isConverted;
    delete (data as Record<string, unknown>).convertedOrderId;
    delete (data as Record<string, unknown>).convertedUserId;

    const lead = await LeadModel.findOneAndUpdate(filter, data, {
      new: true,
      runValidators: true,
    });
    if (!lead) throw AppError.notFound('Lead');

    // Trigger score recalculation
    await calculateScore(lead._id.toString());

    return (await LeadModel.findById(lead._id).lean<ILeadDocument>())!;
  }

  // ─── Status Transition (LM-INV-02, LM-INV-03) ────────────────────────

  async function transitionStatus(
    id: string,
    newStatus: number,
    data: { lostReason?: string; lostReasonNote?: string; note?: string },
    performedBy: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<ILeadDocument> {
    const filter: FilterQuery<ILeadDocument> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }

    const lead = await LeadModel.findOne(filter);
    if (!lead) throw AppError.notFound('Lead');

    const currentStatus = lead.status as LeadStatusType;
    const allowed = LEAD_STATUS_TRANSITIONS[currentStatus] ?? [];

    // LM-INV-02: Validate against adjacency map
    if (!allowed.includes(newStatus as LeadStatusType)) {
      throw AppError.badRequest(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
        [{ field: 'status', message: `Allowed transitions: [${allowed.join(', ')}]` }],
      );
    }

    // LM-INV-03: Lost requires lostReason
    if (newStatus === LeadStatus.Lost) {
      if (!data.lostReason) {
        throw AppError.badRequest('Lost reason is required when transitioning to Lost status');
      }
      if (!LOST_REASONS.includes(data.lostReason as (typeof LOST_REASONS)[number])) {
        throw AppError.badRequest(`Invalid lost reason: ${data.lostReason}`);
      }
      lead.lostReason = data.lostReason as (typeof LOST_REASONS)[number];
      if (data.lostReasonNote) lead.lostReasonNote = data.lostReasonNote;
    }

    lead.status = newStatus;
    await lead.save();

    // Log activity
    await LeadActivityModel.create({
      leadId: lead._id,
      type: 'status_change',
      description: `Status changed from ${currentStatus} to ${newStatus}${data.note ? `: ${data.note}` : ''}`,
      performedBy,
      isSystemGenerated: true,
      servicesQuoted: [],
      attachments: [],
    });

    // Recalculate score
    await calculateScore(lead._id.toString());

    return (await LeadModel.findById(lead._id).lean<ILeadDocument>())!;
  }

  // ─── Assign Lead ──────────────────────────────────────────────────────

  async function assignLead(
    id: string,
    staffId: string,
    performedBy: string,
  ): Promise<ILeadDocument> {
    const lead = await LeadModel.findById(id);
    if (!lead) throw AppError.notFound('Lead');

    const previousAssignee = lead.assignedTo?.toString();
    lead.assignedTo = staffId as unknown as ILeadDocument['assignedTo'];
    await lead.save();

    // Log activity
    await LeadActivityModel.create({
      leadId: lead._id,
      type: 'assignment_change',
      description: previousAssignee
        ? `Reassigned from ${previousAssignee} to ${staffId}`
        : `Assigned to ${staffId}`,
      performedBy,
      isSystemGenerated: true,
      servicesQuoted: [],
      attachments: [],
    });

    return (await LeadModel.findById(lead._id)
      .populate('assignedTo', 'firstName lastName email')
      .lean<ILeadDocument>())!;
  }

  // ─── Bulk Assign ──────────────────────────────────────────────────────

  async function bulkAssign(
    leadIds: string[],
    staffId: string,
    performedBy: string,
  ): Promise<{ updated: number }> {
    const result = await LeadModel.updateMany(
      { _id: { $in: leadIds } },
      { assignedTo: staffId },
    );

    // Log activities for each
    const activities = leadIds.map((leadId) => ({
      leadId,
      type: 'assignment_change' as const,
      description: `Bulk assigned to ${staffId}`,
      performedBy,
      isSystemGenerated: true,
      servicesQuoted: [],
      attachments: [],
    }));
    await LeadActivityModel.insertMany(activities);

    return { updated: result.modifiedCount };
  }

  // ─── Bulk Status Change ───────────────────────────────────────────────

  async function bulkStatusChange(
    leadIds: string[],
    status: number,
    data: { lostReason?: string; lostReasonNote?: string },
    performedBy: string,
  ): Promise<{ updated: number; errors: Array<{ leadId: string; error: string }> }> {
    const errors: Array<{ leadId: string; error: string }> = [];
    let updated = 0;

    for (const leadId of leadIds) {
      try {
        await transitionStatus(leadId, status, data, performedBy);
        updated++;
      } catch (err) {
        errors.push({
          leadId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { updated, errors };
  }

  // ─── Convert Lead (LM-INV-04, LM-INV-05) ─────────────────────────────

  async function convertLead(
    leadId: string,
    performedBy: string,
  ): Promise<{ lead: ILeadDocument; orderId: string; userId: string }> {
    const session = await connection.startSession();
    session.startTransaction();

    try {
      const lead = await LeadModel.findById(leadId).session(session);
      if (!lead) throw AppError.notFound('Lead');

      // LM-INV-05: Cannot convert twice
      if (lead.isConverted) {
        throw AppError.conflict('Lead has already been converted');
      }

      // Create User from lead data
      const UserModel = connection.model('User');
      const user = await UserModel.create(
        [
          {
            firstName: lead.firstName,
            lastName: lead.lastName ?? '',
            mobile: lead.mobile,
            email: lead.email,
            status: true,
            userType: 2, // client
            preferredLanguage: lead.preferredLanguage ?? 'en',
            preferredContact: lead.preferredContact ?? 'sms',
            timezone: 'Australia/Sydney',
            isDeleted: false,
            ...(lead.state ? { address: { state: lead.state, suburb: lead.suburb, postcode: lead.postcode } } : {}),
          },
        ],
        { session },
      );

      const userId = user[0]._id.toString();

      // Create Order
      const OrderModel = connection.model('Order');
      // Generate order number
      const lastOrder = await OrderModel.findOne({}, { orderNumber: 1 })
        .sort({ _id: -1 })
        .session(session)
        .lean<{ orderNumber: string }>();

      let nextOrderNum = 1;
      if (lastOrder?.orderNumber) {
        const match = lastOrder.orderNumber.match(/QGS-O-(\d+)/);
        if (match) nextOrderNum = parseInt(match[1], 10) + 1;
      }
      const orderNumber = `QGS-O-${String(nextOrderNum).padStart(4, '0')}`;

      const order = await OrderModel.create(
        [
          {
            orderNumber,
            userId: user[0]._id,
            leadId: lead._id,
            financialYear: lead.financialYear ?? '',
            status: 1, // Pending
            personalDetails: {
              firstName: lead.firstName,
              lastName: lead.lastName ?? '',
              mobile: lead.mobile,
              email: lead.email,
            },
            maritalStatus: lead.maritalStatus,
            lineItems: [],
            totalAmount: 0,
            discountPercent: 0,
            discountAmount: 0,
            finalAmount: 0,
            completionPercent: 0,
            isDeleted: false,
            orderType: 'standard',
            amendmentCount: 0,
          },
        ],
        { session },
      );

      const orderId = order[0]._id.toString();

      // Update lead — LM-INV-04: atomic within transaction
      lead.isConverted = true;
      lead.convertedOrderId = order[0]._id;
      lead.convertedUserId = user[0]._id;
      lead.status = LeadStatus.Won;
      await lead.save({ session });

      // Log activity
      await LeadActivityModel.create(
        [
          {
            leadId: lead._id,
            type: 'converted',
            description: `Converted to order ${orderNumber} and user ${userId}`,
            performedBy,
            isSystemGenerated: true,
            servicesQuoted: [],
            attachments: [],
          },
        ],
        { session },
      );

      await session.commitTransaction();

      return {
        lead: (await LeadModel.findById(leadId).lean<ILeadDocument>())!,
        orderId,
        userId,
      };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  // ─── Convert to Existing User ─────────────────────────────────────────

  async function convertToExistingUser(
    leadId: string,
    userId: string,
    performedBy: string,
  ): Promise<{ lead: ILeadDocument; orderId: string }> {
    const session = await connection.startSession();
    session.startTransaction();

    try {
      const lead = await LeadModel.findById(leadId).session(session);
      if (!lead) throw AppError.notFound('Lead');

      if (lead.isConverted) {
        throw AppError.conflict('Lead has already been converted');
      }

      // Verify user exists
      const UserModel = connection.model('User');
      const user = await UserModel.findById(userId).session(session);
      if (!user) throw AppError.notFound('User');

      // Create Order
      const OrderModel = connection.model('Order');
      const lastOrder = await OrderModel.findOne({}, { orderNumber: 1 })
        .sort({ _id: -1 })
        .session(session)
        .lean<{ orderNumber: string }>();

      let nextOrderNum = 1;
      if (lastOrder?.orderNumber) {
        const match = lastOrder.orderNumber.match(/QGS-O-(\d+)/);
        if (match) nextOrderNum = parseInt(match[1], 10) + 1;
      }
      const orderNumber = `QGS-O-${String(nextOrderNum).padStart(4, '0')}`;

      const order = await OrderModel.create(
        [
          {
            orderNumber,
            userId,
            leadId: lead._id,
            financialYear: lead.financialYear ?? '',
            status: 1,
            personalDetails: {
              firstName: lead.firstName,
              lastName: lead.lastName ?? '',
              mobile: lead.mobile,
              email: lead.email,
            },
            maritalStatus: lead.maritalStatus,
            lineItems: [],
            totalAmount: 0,
            discountPercent: 0,
            discountAmount: 0,
            finalAmount: 0,
            completionPercent: 0,
            isDeleted: false,
            orderType: 'standard',
            amendmentCount: 0,
          },
        ],
        { session },
      );

      const orderId = order[0]._id.toString();

      lead.isConverted = true;
      lead.convertedOrderId = order[0]._id;
      lead.convertedUserId = user._id;
      lead.status = LeadStatus.Won;
      await lead.save({ session });

      await LeadActivityModel.create(
        [
          {
            leadId: lead._id,
            type: 'converted',
            description: `Converted to existing user ${userId}, order ${orderNumber}`,
            performedBy,
            isSystemGenerated: true,
            servicesQuoted: [],
            attachments: [],
          },
        ],
        { session },
      );

      await session.commitTransaction();

      return {
        lead: (await LeadModel.findById(leadId).lean<ILeadDocument>())!,
        orderId,
      };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  // ─── Merge Lead (LM-INV-06) ──────────────────────────────────────────

  async function mergeLead(
    primaryId: string,
    secondaryId: string,
    fieldSelections: Record<string, 'primary' | 'secondary'>,
  ): Promise<ILeadDocument> {
    const [primary, secondary] = await Promise.all([
      LeadModel.findById(primaryId),
      LeadModel.findById(secondaryId),
    ]);
    if (!primary) throw AppError.notFound('Primary lead');
    if (!secondary) throw AppError.notFound('Secondary lead');

    // Apply field selections from secondary to primary
    for (const [field, selection] of Object.entries(fieldSelections)) {
      if (selection === 'secondary') {
        const value = (secondary as Record<string, unknown>)[field];
        (primary as Record<string, unknown>)[field] = value;
      }
    }

    await primary.save();

    // Transfer all activities from secondary to primary
    await LeadActivityModel.updateMany(
      { leadId: secondaryId },
      { leadId: primaryId },
    );

    // Transfer all reminders from secondary to primary
    await LeadReminderModel.updateMany(
      { leadId: secondaryId },
      { leadId: primaryId },
    );

    // Soft-delete secondary
    secondary.isDeleted = true;
    secondary.deletedAt = new Date();
    await secondary.save();

    return (await LeadModel.findById(primaryId).lean<ILeadDocument>())!;
  }

  // ─── Search Leads ─────────────────────────────────────────────────────

  async function searchLeads(
    query: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<ILeadDocument[]> {
    const filter: FilterQuery<ILeadDocument> = {
      $text: { $search: query },
    };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }

    return LeadModel.find(filter)
      .select('leadNumber firstName lastName mobile email status priority score assignedTo')
      .sort({ score: { $meta: 'textScore' } })
      .limit(50)
      .lean<ILeadDocument[]>();
  }

  // ─── Soft Delete ──────────────────────────────────────────────────────

  async function softDelete(
    id: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<ILeadDocument> {
    const filter: FilterQuery<ILeadDocument> = { _id: id };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const lead = await LeadModel.findOne(filter);
    if (!lead) throw AppError.notFound('Lead');
    lead.isDeleted = true;
    lead.deletedAt = new Date();
    await lead.save();
    return lead;
  }

  // ─── Stats ────────────────────────────────────────────────────────────

  async function getStats(): Promise<Record<string, unknown>> {
    const [byStatus, bySource, totalActive, newThisWeek, conversionRate] = await Promise.all([
      LeadModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 }, totalValue: { $sum: '$estimatedValue' } } },
      ]),
      LeadModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      LeadModel.countDocuments({ status: { $in: [1, 2, 3, 4, 5] } }),
      LeadModel.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
      LeadModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            converted: { $sum: { $cond: [{ $eq: ['$isConverted', true] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const pipelineValue = byStatus
      .filter((s: { _id: number }) => [1, 2, 3, 4, 5].includes(s._id))
      .reduce((sum: number, s: { totalValue: number }) => sum + (s.totalValue || 0), 0);

    return {
      byStatus,
      bySource,
      totalActive,
      newThisWeek,
      conversionRate: conversionRate[0]
        ? {
            total: conversionRate[0].total,
            converted: conversionRate[0].converted,
            rate: conversionRate[0].total > 0
              ? Math.round((conversionRate[0].converted / conversionRate[0].total) * 100)
              : 0,
          }
        : { total: 0, converted: 0, rate: 0 },
      pipelineValue,
    };
  }

  async function getPipelineStats(): Promise<Record<string, unknown>> {
    const pipeline = await LeadModel.aggregate([
      { $match: { isDeleted: { $ne: true }, status: { $in: [1, 2, 3, 4, 5] } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$estimatedValue' },
          leads: {
            $push: {
              _id: '$_id',
              leadNumber: '$leadNumber',
              firstName: '$firstName',
              lastName: '$lastName',
              priority: '$priority',
              estimatedValue: '$estimatedValue',
              nextActionDate: '$nextActionDate',
              assignedTo: '$assignedTo',
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return { pipeline };
  }

  async function getStaffStats(): Promise<Record<string, unknown>> {
    const stats = await LeadModel.aggregate([
      { $match: { isDeleted: { $ne: true }, assignedTo: { $ne: null } } },
      {
        $group: {
          _id: '$assignedTo',
          assigned: { $sum: 1 },
          contacted: { $sum: { $cond: [{ $gte: ['$status', 2] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $eq: ['$isConverted', true] }, 1, 0] } },
        },
      },
    ]);
    return { stats };
  }

  async function getSourceStats(): Promise<Record<string, unknown>> {
    const stats = await LeadModel.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      {
        $group: {
          _id: '$source',
          total: { $sum: 1 },
          converted: { $sum: { $cond: [{ $eq: ['$isConverted', true] }, 1, 0] } },
          avgValue: { $avg: '$estimatedValue' },
        },
      },
      {
        $addFields: {
          conversionRate: {
            $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$converted', '$total'] }, 100] }, 0],
          },
        },
      },
    ]);
    return { stats };
  }

  async function getAgingStats(): Promise<Record<string, unknown>> {
    const now = new Date();
    const stats = await LeadModel.aggregate([
      { $match: { isDeleted: { $ne: true }, status: { $in: [1, 2, 3, 4, 5] } } },
      {
        $addFields: {
          ageInDays: {
            $divide: [{ $subtract: [now, '$createdAt'] }, 1000 * 60 * 60 * 24],
          },
        },
      },
      {
        $bucket: {
          groupBy: '$ageInDays',
          boundaries: [0, 1, 3, 7, 14, 30, 60, 90],
          default: '90+',
          output: {
            count: { $sum: 1 },
            leads: { $push: { _id: '$_id', leadNumber: '$leadNumber', status: '$status' } },
          },
        },
      },
    ]);
    return { stats };
  }

  return {
    createLead,
    updateLead,
    getLead,
    listLeads,
    transitionStatus,
    assignLead,
    bulkAssign,
    bulkStatusChange,
    convertLead,
    convertToExistingUser,
    mergeLead,
    checkDuplicate,
    searchLeads,
    calculateScore,
    softDelete,
    getStats,
    getPipelineStats,
    getStaffStats,
    getSourceStats,
    getAgingStats,
  };
}
