/**
 * Consent Form — Service layer.
 *
 * Takes validated DTO input, encrypts the sensitive fields via
 * AES-256-GCM, computes the last-4 / year projections, and persists
 * a Mongoose document. Never returns ciphertext or plaintext secrets
 * to callers — the response shape is a `ConsentFormResponse`.
 */

import type { Model, Types } from 'mongoose';
import type {
  CreateConsentFormInput,
  ConsentFormResponse,
  IConsentFormDocument,
} from './consentForm.types';
import { encryptField, last4, yearFromDob } from './consentForm.crypto';

export interface ConsentFormServiceDeps {
  ConsentFormModel: Model<IConsentFormDocument>;
}

export interface AdminListFilters {
  userId?: string;
  workType?: string;
  search?: string;
  limit?: number;
  skip?: number;
}

export interface AdminListResult {
  rows: ConsentFormResponse[];
  total: number;
}

export interface ConsentFormService {
  createSubmission(
    input: CreateConsentFormInput,
    userId: string | Types.ObjectId,
  ): Promise<ConsentFormResponse>;
  listByUser(userId: string | Types.ObjectId): Promise<ConsentFormResponse[]>;
  getById(
    id: string,
    userId: string | Types.ObjectId,
  ): Promise<ConsentFormResponse | null>;
  /**
   * Admin-only: list across ALL users. Still returns the sanitized
   * `ConsentFormResponse` — no ciphertext or decrypted secrets.
   */
  listAll(filters?: AdminListFilters): Promise<AdminListResult>;
  /**
   * Admin-only: fetch a single submission by id with no user scoping.
   */
  getByIdAdmin(id: string): Promise<ConsentFormResponse | null>;
}

function toResponse(doc: IConsentFormDocument): ConsentFormResponse {
  return {
    _id: doc._id.toString(),
    userId: doc.userId.toString(),

    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    phone: doc.phone,
    dateOfBirthYear: doc.dateOfBirthYear,
    gender: doc.gender,

    houseNumber: doc.houseNumber,
    streetName: doc.streetName,
    city: doc.city,
    postCode: doc.postCode,
    state: doc.state,

    workType: doc.workType,
    tfnAbnAcnLast4: doc.tfnAbnAcnLast4,
    bsbLast4: doc.bsbLast4,
    accountNumberLast4: doc.accountNumberLast4,
    accountName: doc.accountName,

    primaryIdType: doc.primaryIdType,
    primaryIdUrl: doc.primaryIdUrl,
    secondaryIdType: doc.secondaryIdType,
    secondaryIdUrl: doc.secondaryIdUrl,

    consentAgreement: true,
    submittedAt: doc.submittedAt.toISOString(),
  };
}

export function createConsentFormService(
  deps: ConsentFormServiceDeps,
): ConsentFormService {
  const { ConsentFormModel } = deps;

  return {
    async createSubmission(input, userId) {
      // Encrypt sensitive fields BEFORE persistence. If encryption throws
      // (e.g. ENCRYPTION_KEY misconfigured) we fail the entire request
      // rather than silently persist plaintext.
      const dateOfBirthEncrypted = encryptField(input.dateOfBirth);
      const tfnAbnAcnEncrypted = encryptField(input.tfnAbnAcn);
      const bsbEncrypted = encryptField(input.bsb);
      const accountNumberEncrypted = encryptField(input.accountNumber);

      const doc = await ConsentFormModel.create({
        userId,

        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,

        dateOfBirthEncrypted,
        dateOfBirthYear: yearFromDob(input.dateOfBirth),

        gender: input.gender,

        houseNumber: input.houseNumber,
        streetName: input.streetName,
        city: input.city,
        postCode: input.postCode,
        state: input.state,

        workType: input.workType,

        tfnAbnAcnEncrypted,
        tfnAbnAcnLast4: last4(input.tfnAbnAcn),

        bsbEncrypted,
        bsbLast4: last4(input.bsb),

        accountNumberEncrypted,
        accountNumberLast4: last4(input.accountNumber),

        accountName: input.accountName,

        primaryIdType: input.primaryIdType,
        primaryIdUrl: input.primaryIdUrl,
        secondaryIdType: input.secondaryIdType,
        secondaryIdUrl: input.secondaryIdUrl,

        consentAgreement: true,
        submittedAt: new Date(),
      });

      return toResponse(doc);
    },

    async listByUser(userId) {
      const docs = await ConsentFormModel.find({ userId }).sort({ submittedAt: -1 });
      return docs.map(toResponse);
    },

    async getById(id, userId) {
      const doc = await ConsentFormModel.findOne({ _id: id, userId });
      return doc ? toResponse(doc) : null;
    },

    async listAll(filters = {}) {
      const query: Record<string, unknown> = {};
      if (filters.userId) query.userId = filters.userId;
      if (filters.workType) query.workType = filters.workType;
      if (filters.search) {
        const safe = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(safe, 'i');
        query.$or = [
          { firstName: rx },
          { lastName: rx },
          { email: rx },
          { phone: rx },
          { accountName: rx },
          { tfnAbnAcnLast4: rx },
          { accountNumberLast4: rx },
        ];
      }
      const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
      const skip = Math.max(filters.skip ?? 0, 0);
      const [docs, total] = await Promise.all([
        ConsentFormModel.find(query)
          .sort({ submittedAt: -1 })
          .skip(skip)
          .limit(limit),
        ConsentFormModel.countDocuments(query),
      ]);
      return { rows: docs.map(toResponse), total };
    },

    async getByIdAdmin(id) {
      const doc = await ConsentFormModel.findOne({ _id: id });
      return doc ? toResponse(doc) : null;
    },
  };
}
