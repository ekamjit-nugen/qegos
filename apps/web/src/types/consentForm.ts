/**
 * Consent Form — shared wire types between apps/web and apps/api.
 *
 * Sensitive fields (accountNumber / bsb / tfnAbnAcn / dateOfBirth) are
 * sent plaintext to the server over TLS and are IMMEDIATELY encrypted
 * at rest with AES-256-GCM. The server never round-trips them back —
 * every response only surfaces the `*Last4` / year projections.
 */

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const;
export type AuState = (typeof AU_STATES)[number];

export const WORK_TYPES = ['TFN', 'ABN', 'ACN'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export type Gender = 'male' | 'female';

export const PRIMARY_ID_TYPES = [
  'australian_full_birth_certificate',
  'australian_passport',
  'australian_citizenship_certificate',
  'register_of_citizenship_extract',
  'foreign_passport',
  'drivers_license',
] as const;
export type PrimaryIdType = (typeof PRIMARY_ID_TYPES)[number];

export const PRIMARY_ID_LABELS: Record<PrimaryIdType, string> = {
  australian_full_birth_certificate: 'Australian Full Birth Certificate',
  australian_passport: 'Australian Passport',
  australian_citizenship_certificate: 'Australian Citizenship Certificate',
  register_of_citizenship_extract: 'Register of Citizenship Extract',
  foreign_passport: 'Foreign Passport',
  drivers_license: "Driver's Licence",
};

export const SECONDARY_ID_TYPES = [
  'national_photo_id_card',
  'foreign_government_id',
  'marriage_certificate',
  'drivers_license',
  'bank_statement_or_card',
] as const;
export type SecondaryIdType = (typeof SECONDARY_ID_TYPES)[number];

export const SECONDARY_ID_LABELS: Record<SecondaryIdType, string> = {
  national_photo_id_card: 'National Photo ID Card',
  foreign_government_id: 'Foreign Government ID',
  marriage_certificate: 'Marriage Certificate',
  drivers_license: "Driver's Licence",
  bank_statement_or_card: 'Current Bank Statement or Bank Card',
};

/**
 * Request payload sent to POST /api/v1/consent-forms.
 * All sensitive fields are plaintext here — encrypted server-side.
 */
export interface CreateConsentFormRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: Gender;

  houseNumber: string;
  streetName: string;
  city: string;
  postCode: string;
  state: AuState;

  workType: WorkType;
  tfnAbnAcn: string;
  bsb: string;
  accountNumber: string;
  accountName: string;

  primaryIdType: PrimaryIdType;
  primaryIdUrl: string;
  secondaryIdType: SecondaryIdType;
  secondaryIdUrl: string;

  consentAgreement: true;
}

/**
 * Server response. Contains ONLY the last-4 / year projections for
 * anything sensitive — the ciphertext is never sent to any client.
 */
export interface ConsentFormSubmission {
  _id: string;
  userId: string;

  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirthYear: number;
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
