/**
 * Consent Form — Mongoose model.
 *
 * Stores QETAX-style intake submissions with field-level encryption on
 * TFN/ABN/ACN, BSB, account number, and date of birth. A last-4
 * projection is persisted alongside each encrypted field so the admin
 * UI can render a human-readable identifier without ever touching the
 * ciphertext.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { IConsentFormDocument } from './consentForm.types';
import {
  AU_STATES,
  WORK_TYPES,
  GENDERS,
  PRIMARY_ID_TYPES,
  SECONDARY_ID_TYPES,
} from './consentForm.types';

const consentFormSchema = new Schema<IConsentFormDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Personal ─────────────────────────────────────────────────────
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{10}$/,
    },

    dateOfBirthEncrypted: { type: String, required: true },
    dateOfBirthYear: {
      type: Number,
      required: true,
      min: 1900,
      max: new Date().getFullYear(),
    },

    gender: { type: String, enum: GENDERS, required: true },

    // ── Address ──────────────────────────────────────────────────────
    houseNumber: { type: String, required: true, trim: true, maxlength: 20 },
    streetName: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    postCode: { type: String, required: true, match: /^\d{4}$/ },
    state: { type: String, enum: AU_STATES, required: true },

    // ── Tax & Banking (encrypted) ────────────────────────────────────
    workType: { type: String, enum: WORK_TYPES, required: true },

    tfnAbnAcnEncrypted: { type: String, required: true },
    tfnAbnAcnLast4: { type: String, required: true, match: /^\d{1,4}$/ },

    bsbEncrypted: { type: String, required: true },
    bsbLast4: { type: String, required: true, match: /^\d{1,4}$/ },

    accountNumberEncrypted: { type: String, required: true },
    accountNumberLast4: { type: String, required: true, match: /^\d{1,4}$/ },

    accountName: { type: String, required: true, trim: true, maxlength: 200 },

    // ── Identification ───────────────────────────────────────────────
    primaryIdType: { type: String, enum: PRIMARY_ID_TYPES, required: true },
    primaryIdUrl: { type: String, required: true },
    secondaryIdType: { type: String, enum: SECONDARY_ID_TYPES, required: true },
    secondaryIdUrl: { type: String, required: true },

    // ── Consent ──────────────────────────────────────────────────────
    consentAgreement: {
      type: Boolean,
      required: true,
      validate: {
        validator: (v: boolean): boolean => v === true,
        message: 'consentAgreement must be true to submit',
      },
    },

    submittedAt: { type: Date, default: (): Date => new Date() },
  },
  {
    timestamps: true,
    // Prevent accidental ciphertext leakage via JSON serialisation.
    // Routes do their own explicit projection; this is belt-and-braces.
    toJSON: {
      transform(_doc, ret): Record<string, unknown> {
        const scrubbed = ret as Record<string, unknown>;
        delete scrubbed.dateOfBirthEncrypted;
        delete scrubbed.tfnAbnAcnEncrypted;
        delete scrubbed.bsbEncrypted;
        delete scrubbed.accountNumberEncrypted;
        delete scrubbed.__v;
        return scrubbed;
      },
    },
  },
);

export function createConsentFormModel(connection: Connection): Model<IConsentFormDocument> {
  return connection.model<IConsentFormDocument>('ConsentForm', consentFormSchema);
}
