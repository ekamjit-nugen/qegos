import type { Model, Types } from 'mongoose';
import type {
  AudienceType,
  AudienceFilters,
  CustomRecipient,
  SingleChannel,
  IOptOutDocument,
  IConsentRecordDocument,
  ResolvedRecipient,
} from '../types';

// ─── Module State ────────────────────────────────────────────────────────────
// Note: LeadModel/UserModel typed as Model<any> because Mongoose's Model<T>
// is invariant over T; using `any` at this DI boundary avoids forcing every
// consumer to cast `Model<ISpecificUser>` with `as never`. The package only
// calls structural methods (findById, find, countDocuments), never reads
// typed fields off result docs.

/* eslint-disable @typescript-eslint/no-explicit-any */
let LeadModel: Model<any>;
let UserModel: Model<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */
let OptOutModel: Model<IOptOutDocument>;
let ConsentModel: Model<IConsentRecordDocument>;

export function initAudienceService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leadModel: Model<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userModel: Model<any>,
  optOutModel: Model<IOptOutDocument>,
  consentModel: Model<IConsentRecordDocument>,
): void {
  LeadModel = leadModel;
  UserModel = userModel;
  OptOutModel = optOutModel;
  ConsentModel = consentModel;
}

// ─── Build Query from Filters ────────────────────────────────────────────────

function buildLeadQuery(filters?: AudienceFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (!filters) {
    return query;
  }

  if (filters.leadStatus?.length) {
    query.status = { $in: filters.leadStatus };
  }
  if (filters.priority?.length) {
    query.priority = { $in: filters.priority };
  }
  if (filters.source?.length) {
    query.source = { $in: filters.source };
  }
  if (filters.state?.length) {
    query.state = { $in: filters.state };
  }
  if (filters.tags?.length) {
    query.tags = { $in: filters.tags };
  }
  if (filters.financialYear) {
    query.financialYear = filters.financialYear;
  }

  return query;
}

function buildUserQuery(filters?: AudienceFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (!filters) {
    return query;
  }

  if (filters.userType?.length) {
    query.role = { $in: filters.userType };
  }
  if (filters.state?.length) {
    query.state = { $in: filters.state };
  }

  return query;
}

// ─── DND / Consent Checks ────────────────────────────────────────────────────

/**
 * BRC-INV-01: Check DND at SEND time (not schedule time).
 * Returns true if the contact is opted out for the given channel.
 */
async function isOptedOut(contact: string, channel: SingleChannel): Promise<boolean> {
  const optOut = await OptOutModel.findOne({
    contact,
    $or: [{ channel }, { channel: 'all' }],
  });
  return optOut !== null;
}

/**
 * BRC-INV-07: No ConsentRecord = no message.
 * Returns true if the contact has active consent for the channel.
 */
async function hasConsent(
  contactId: Types.ObjectId,
  contactType: 'lead' | 'user',
  channel: SingleChannel,
): Promise<boolean> {
  const consent = await ConsentModel.findOne({
    contactId,
    contactType,
    channel,
    consented: true,
    withdrawnAt: { $exists: false },
  });
  return consent !== null;
}

// ─── Extract Contact Info ────────────────────────────────────────────────────

function extractMergeData(doc: {
  toObject: () => Record<string, unknown>;
}): Record<string, string> {
  const obj = doc.toObject();
  const result: Record<string, string> = {};
  const fields = [
    'firstName',
    'lastName',
    'leadNumber',
    'orderNumber',
    'financialYear',
    'email',
    'mobile',
  ];
  for (const f of fields) {
    if (obj[f] !== undefined && obj[f] !== null) {
      result[f] = String(obj[f]);
    }
  }
  return result;
}

// ─── Audience Resolution ─────────────────────────────────────────────────────

/**
 * Resolve audience at execution time (BRC-INV-06).
 * Filters out opted-out contacts and those without consent.
 */
export async function resolveAudience(
  audienceType: AudienceType,
  channel: SingleChannel,
  filters?: AudienceFilters,
  customList?: CustomRecipient[],
): Promise<ResolvedRecipient[]> {
  const recipients: ResolvedRecipient[] = [];

  if (audienceType === 'custom_list' && customList) {
    for (const item of customList) {
      const contact = channel === 'email' ? item.email : item.mobile;
      if (!contact) {
        continue;
      }

      const optedOut = await isOptedOut(contact, channel);
      if (optedOut) {
        continue;
      }

      recipients.push({
        recipientType: 'custom',
        mobile: item.mobile,
        email: item.email,
        mergeData: {
          firstName: item.firstName ?? '',
          lastName: item.lastName ?? '',
        },
      });
    }
    return recipients;
  }

  const isLeadAudience = audienceType === 'all_leads' || audienceType === 'filtered_leads';
  const Model = isLeadAudience ? LeadModel : UserModel;
  const contactType = isLeadAudience ? 'lead' : 'user';
  const query = isLeadAudience ? buildLeadQuery(filters) : buildUserQuery(filters);

  const docs = await Model.find(query).lean(false);

  for (const doc of docs) {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const contact =
      channel === 'email' ? (obj.email as string | undefined) : (obj.mobile as string | undefined);

    if (!contact) {
      continue;
    }

    // BRC-INV-01: Check DND at send time
    const optedOut = await isOptedOut(contact, channel);
    if (optedOut) {
      continue;
    }

    // BRC-INV-07: Check consent
    const consentOk = await hasConsent(doc._id as Types.ObjectId, contactType, channel);
    if (!consentOk) {
      continue;
    }

    recipients.push({
      recipientId: doc._id as Types.ObjectId,
      recipientType: contactType,
      mobile: obj.mobile as string | undefined,
      email: obj.email as string | undefined,
      mergeData: extractMergeData(doc),
    });
  }

  return recipients;
}

/**
 * Count audience without full resolution (for cost estimation).
 */
export async function getAudienceCount(
  audienceType: AudienceType,
  filters?: AudienceFilters,
  customList?: CustomRecipient[],
): Promise<number> {
  if (audienceType === 'custom_list') {
    return customList?.length ?? 0;
  }

  const isLeadAudience = audienceType === 'all_leads' || audienceType === 'filtered_leads';
  const Model = isLeadAudience ? LeadModel : UserModel;
  const query = isLeadAudience ? buildLeadQuery(filters) : buildUserQuery(filters);

  return Model.countDocuments(query);
}
