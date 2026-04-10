/**
 * Consent Form — TypeScript interfaces.
 *
 * Submissions from the client portal's QETAX-style consent intake form.
 * Sensitive fields (account number, BSB, TFN/ABN/ACN, DOB) are stored
 * encrypted at rest with AES-256-GCM. Only a "last 4" projection is kept
 * in plaintext so the admin UI can show an identifier like
 * "Account ending 1234" without ever touching ciphertext.
 *
 * Decryption is intentionally NOT exposed via any HTTP endpoint in this
 * module — the only way to get plaintext back is a one-off ATO-lodgement
 * script that holds the ENCRYPTION_KEY. This matches the "never decrypt
 * in UI, last4 only" access model chosen for the feature.
 */

import type { Document, Types } from 'mongoose';

// ─── Wire / DTO shapes ────────────────────────────────────────────────────

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const;
export type AuState = typeof AU_STATES[number];

export const WORK_TYPES = ['TFN', 'ABN', 'ACN'] as const;
export type WorkType = typeof WORK_TYPES[number];

export const GENDERS = ['male', 'female'] as const;
export type Gender = typeof GENDERS[number];

export const PRIMARY_ID_TYPES = [
  'australian_full_birth_certificate',
  'australian_passport',
  'australian_citizenship_certificate',
  'register_of_citizenship_extract',
  'foreign_passport',
  'drivers_license',
] as const;
export type PrimaryIdType = typeof PRIMARY_ID_TYPES[number];

export const SECONDARY_ID_TYPES = [
  'national_photo_id_card',
  'foreign_government_id',
  'marriage_certificate',
  'drivers_license',
  'bank_statement_or_card',
] as const;
export type SecondaryIdType = typeof SECONDARY_ID_TYPES[number];

/**
 * The plaintext submission body the client portal POSTs.
 * Anything marked "sensitive" below is encrypted on the server
 * immediately after validation and never round-tripped back to any UI.
 */
export interface CreateConsentFormInput {
  // Personal
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string; // YYYY-MM-DD — sensitive
  gender: Gender;

  // Address
  houseNumber: string;
  streetName: string;
  city: string;
  postCode: string;
  state: AuState;

  // Tax & Banking — ALL sensitive
  workType: WorkType;
  tfnAbnAcn: string; // 9 or 11 digits — sensitive
  bsb: string;       // 6 digits — sensitive
  accountNumber: string; // 4-10 digits — sensitive
  accountName: string;

  // Primary ID
  primaryIdType: PrimaryIdType;
  primaryIdUrl: string;

  // Secondary ID
  secondaryIdType: SecondaryIdType;
  secondaryIdUrl: string;

  // Consent
  consentAgreement: true;
}

/**
 * The shape we return to the admin UI. Ciphertext is NEVER included;
 * only the last4 / year projections. `accountNumberLast4` etc. are
 * the ONLY way the admin surfaces these values.
 */
export interface ConsentFormResponse {
  _id: string;
  userId: string;

  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirthYear: number; // e.g. 1990 — "last 4" for DOB
  gender: Gender;

  houseNumber: string;
  streetName: string;
  city: string;
  postCode: string;
  state: AuState;

  workType: WorkType;
  tfnAbnAcnLast4: string;
  bsbLast4: string;
  accountNumberLast4: string;
  accountName: string;

  primaryIdType: PrimaryIdType;
  primaryIdUrl: string;
  secondaryIdType: SecondaryIdType;
  secondaryIdUrl: string;

  consentAgreement: true;
  submittedAt: string;
}

// ─── Mongo document shape ─────────────────────────────────────────────────

/**
 * Ciphertext envelope format: `${iv}:${authTag}:${ciphertext}` (all hex),
 * matching the pattern used in user.model.ts / order.model.ts. Stored as
 * a single string so the field is opaque to anything that doesn't hold
 * the ENCRYPTION_KEY.
 */
export type EncryptedField = string;

export interface IConsentForm {
  userId: Types.ObjectId;

  firstName: string;
  lastName: string;
  email: string;
  phone: string;

  // DOB: encrypted full date, plus the year kept in plaintext for display.
  dateOfBirthEncrypted: EncryptedField;
  dateOfBirthYear: number;

  gender: Gender;

  houseNumber: string;
  streetName: string;
  city: string;
  postCode: string;
  state: AuState;

  workType: WorkType;

  tfnAbnAcnEncrypted: EncryptedField;
  tfnAbnAcnLast4: string;

  bsbEncrypted: EncryptedField;
  bsbLast4: string;

  accountNumberEncrypted: EncryptedField;
  accountNumberLast4: string;

  accountName: string;

  primaryIdType: PrimaryIdType;
  primaryIdUrl: string;
  secondaryIdType: SecondaryIdType;
  secondaryIdUrl: string;

  consentAgreement: true;

  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConsentFormDocument extends IConsentForm, Document {
  _id: Types.ObjectId;
}
