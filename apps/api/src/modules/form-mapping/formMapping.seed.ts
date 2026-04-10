/**
 * Form Mapping — Seed
 *
 * Seeds one published + default form mapping per active Sales item for
 * FY 2025-2026. The schema below mirrors the real QETAX intake form at
 * https://www.qetax.com.au/tax/file-your-tax (source of truth:
 * /Users/lovishmahajan/Desktop/qetax-website/src/components/fileyourtax.tsx).
 *
 * The seed is idempotent — it checks for existing (salesItemId, FY) rows
 * and skips rather than re-creating.
 */

import type { Model, Types } from 'mongoose';
import type {
  IFormMappingDocument,
  IFormMappingVersionDocument,
  FormMappingSchema,
} from './formMapping.types';

// ─── QETAX canonical form schema (FY 2025-2026) ──────────────────────────

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

const RENTAL_EXPENSE_LABELS = [
  'advertising',
  'borrowing_expenses',
  'council_rates',
  'water',
  'gardening',
  'interest',
  'legal_fees',
  'agents_fees',
  'capital_works_deductions',
  'travel',
  'body_corporate_fees',
  'cleaning',
  'capital_allowance_assets',
  'insurance',
  'land_tax',
  'pest_control',
  'repairs',
  'office_supplies',
  'sundry_expenses',
];

function money(fieldKey: string, title: string): Record<string, unknown> {
  return {
    type: 'number',
    title,
    minimum: 0,
    'x-qegos': { fieldKey, widget: 'currency', placeholder: '0.00' },
  };
}

function buildRentalExpenseProps(): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const key of RENTAL_EXPENSE_LABELS) {
    const title = key
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    props[`rental_exp_${key}`] = money(`rental_exp_${key}`, `${title} ($)`);
  }
  return props;
}

export const QETAX_DEFAULT_SCHEMA: FormMappingSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  title: 'QETAX Individual Tax Return Intake — FY 2025-2026',
  'x-qegos': {
    taxYear: '2025-2026',
    steps: [
      'personal_details',
      'address_details',
      'tax_banking',
      'work_related_expenses',
      'investment_property',
      'primary_id',
      'secondary_id',
      'other_comments',
      'consent',
    ],
  },
  properties: {
    // ─── Step 1: Personal Details ──────────────────────────────────
    personal_details: {
      type: 'object',
      title: 'Personal Details',
      'x-qegos': { stepId: 'personal_details', description: 'Your identity & contact info' },
      properties: {
        first_name: {
          type: 'string',
          title: 'First Name',
          minLength: 1,
          maxLength: 100,
          'x-qegos': { fieldKey: 'first_name', widget: 'text', placeholder: 'Jane' },
        },
        last_name: {
          type: 'string',
          title: 'Last Name',
          minLength: 1,
          maxLength: 100,
          'x-qegos': { fieldKey: 'last_name', widget: 'text', placeholder: 'Doe' },
        },
        email: {
          type: 'string',
          title: 'Email',
          format: 'email',
          'x-qegos': { fieldKey: 'email', widget: 'text', placeholder: 'jane@example.com' },
        },
        phone: {
          type: 'string',
          title: 'Phone',
          pattern: '^\\d{10}$',
          'x-qegos': { fieldKey: 'phone', widget: 'text', placeholder: '0412345678' },
        },
        date_of_birth: {
          type: 'string',
          title: 'Date of Birth',
          format: 'date',
          'x-qegos': { fieldKey: 'date_of_birth', widget: 'date' },
        },
        gender: {
          type: 'string',
          title: 'Gender',
          enum: ['male', 'female'],
          'x-qegos': { fieldKey: 'gender', widget: 'radio' },
        },
      },
      required: ['first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'gender'],
    },

    // ─── Step 2: Address Details ───────────────────────────────────
    address_details: {
      type: 'object',
      title: 'Address Details',
      'x-qegos': { stepId: 'address_details' },
      properties: {
        house_number: {
          type: 'string',
          title: 'House / Unit Number',
          'x-qegos': { fieldKey: 'house_number', widget: 'text' },
        },
        street_name: {
          type: 'string',
          title: 'Street Name',
          'x-qegos': { fieldKey: 'street_name', widget: 'text' },
        },
        city: {
          type: 'string',
          title: 'Suburb / City',
          'x-qegos': { fieldKey: 'city', widget: 'text' },
        },
        post_code: {
          type: 'string',
          title: 'Post Code',
          pattern: '^\\d{4}$',
          'x-qegos': { fieldKey: 'post_code', widget: 'text', placeholder: '2000' },
        },
        state: {
          type: 'string',
          title: 'State',
          enum: AU_STATES,
          'x-qegos': { fieldKey: 'state', widget: 'select' },
        },
      },
      required: ['house_number', 'street_name', 'city', 'post_code', 'state'],
    },

    // ─── Step 3: Tax and Banking ───────────────────────────────────
    tax_banking: {
      type: 'object',
      title: 'Tax and Banking Details',
      'x-qegos': { stepId: 'tax_banking' },
      properties: {
        work_type: {
          type: 'string',
          title: 'Work Type',
          enum: ['TFN', 'ABN', 'ACN'],
          'x-qegos': { fieldKey: 'work_type', widget: 'select' },
        },
        tfn_abn_acn: {
          type: 'string',
          title: 'TFN / ABN / ACN Number',
          pattern: '^\\d{9,11}$',
          'x-qegos': {
            fieldKey: 'tfn_abn_acn',
            widget: 'text',
            sensitive: true,
            placeholder: '9/11 digit number',
          },
        },
        bsb: {
          type: 'string',
          title: 'BSB',
          pattern: '^\\d{6}$',
          'x-qegos': { fieldKey: 'bsb', widget: 'text', placeholder: '062123' },
        },
        account_number: {
          type: 'string',
          title: 'Account Number',
          pattern: '^\\d{4,10}$',
          'x-qegos': { fieldKey: 'account_number', widget: 'text' },
        },
        account_name: {
          type: 'string',
          title: 'Account Name',
          'x-qegos': { fieldKey: 'account_name', widget: 'text' },
        },
      },
      required: ['work_type', 'tfn_abn_acn', 'bsb', 'account_number', 'account_name'],
    },

    // ─── Step 4: Work Related Expenses (all optional) ─────────────
    work_related_expenses: {
      type: 'object',
      title: 'Work Related Expenses',
      'x-qegos': { stepId: 'work_related_expenses' },
      properties: {
        car_expenses: money('car_expenses', 'Car Expenses ($)'),
        travel_expenses: money('travel_expenses', 'Travel Expenses ($)'),
        motor_vehicle_expenses: money('motor_vehicle_expenses', 'Motor Vehicle Expenses ($)'),
        self_education_expenses: money('self_education_expenses', 'Self Education Expenses ($)'),
        depreciable_expenses: money('depreciable_expenses', 'Depreciable Expenses ($)'),
        other_expenses: money('other_expenses', 'Other Expenses ($)'),
        clothing_laundry_dry_cleaning: money(
          'clothing_laundry_dry_cleaning',
          'Clothing, Laundry, Dry Cleaning ($)',
        ),
        further_information: {
          type: 'string',
          title: 'Any Further Information',
          maxLength: 5000,
          'x-qegos': { fieldKey: 'further_information', widget: 'textarea' },
        },
      },
    },

    // ─── Step 5: Investment Property ──────────────────────────────
    investment_property: {
      type: 'object',
      title: 'Investment Property',
      'x-qegos': { stepId: 'investment_property' },
      properties: {
        has_investment_property: {
          type: 'boolean',
          title: 'Do you have an investment property?',
          'x-qegos': { fieldKey: 'has_investment_property', widget: 'checkbox' },
        },
        rental_house_number: {
          type: 'string',
          title: 'Rental — House / Unit Number',
          'x-qegos': { fieldKey: 'rental_house_number', widget: 'text' },
        },
        rental_street_name: {
          type: 'string',
          title: 'Rental — Street Name',
          'x-qegos': { fieldKey: 'rental_street_name', widget: 'text' },
        },
        rental_city: {
          type: 'string',
          title: 'Rental — Suburb / City',
          'x-qegos': { fieldKey: 'rental_city', widget: 'text' },
        },
        rental_post_code: {
          type: 'string',
          title: 'Rental — Post Code',
          pattern: '^\\d{4}$',
          'x-qegos': { fieldKey: 'rental_post_code', widget: 'text' },
        },
        rental_state: {
          type: 'string',
          title: 'Rental — State',
          enum: AU_STATES,
          'x-qegos': { fieldKey: 'rental_state', widget: 'select' },
        },
        rental_income: money('rental_income', 'Rental Income P.A. ($)'),
        other_rental_income: money('other_rental_income', 'Other Rental Income ($)'),
        ...buildRentalExpenseProps(),
        ownership_details: {
          type: 'string',
          title: 'Ownership Details (owners + percentages)',
          maxLength: 5000,
          'x-qegos': { fieldKey: 'ownership_details', widget: 'textarea' },
        },
      },
    },

    // ─── Step 6: Upload Primary ID ─────────────────────────────────
    primary_id: {
      type: 'object',
      title: 'Upload Primary ID',
      'x-qegos': {
        stepId: 'primary_id',
        description:
          'Accepted documents: Australian full birth certificate, Australian passport, Australian citizenship certificate, Register of Citizenship Extract, or Foreign passport.',
      },
      properties: {
        primary_id_type: {
          type: 'string',
          title: 'Document Type',
          enum: [
            'australian_full_birth_certificate',
            'australian_passport',
            'australian_citizenship_certificate',
            'register_of_citizenship_extract',
            'foreign_passport',
            'drivers_license',
          ],
          'x-qegos': { fieldKey: 'primary_id_type', widget: 'select' },
        },
        primary_id_url: {
          type: 'string',
          title: 'Upload Document',
          format: 'uri',
          'x-qegos': { fieldKey: 'primary_id_url', widget: 'file_upload' },
        },
      },
      required: ['primary_id_type', 'primary_id_url'],
    },

    // ─── Step 7: Upload Secondary ID ───────────────────────────────
    secondary_id: {
      type: 'object',
      title: 'Upload Secondary ID',
      'x-qegos': {
        stepId: 'secondary_id',
        description:
          'Accepted documents: National photo ID card, foreign government ID, marriage certificate, driver’s license, or current bank statement / card.',
      },
      properties: {
        secondary_id_type: {
          type: 'string',
          title: 'Document Type',
          enum: [
            'national_photo_id_card',
            'foreign_government_id',
            'marriage_certificate',
            'drivers_license',
            'bank_statement_or_card',
          ],
          'x-qegos': { fieldKey: 'secondary_id_type', widget: 'select' },
        },
        secondary_id_url: {
          type: 'string',
          title: 'Upload Document',
          format: 'uri',
          'x-qegos': { fieldKey: 'secondary_id_url', widget: 'file_upload' },
        },
      },
      required: ['secondary_id_type', 'secondary_id_url'],
    },

    // ─── Step 8: Other Comments ────────────────────────────────────
    other_comments: {
      type: 'object',
      title: 'Other Comments',
      'x-qegos': { stepId: 'other_comments' },
      properties: {
        comments: {
          type: 'string',
          title: 'Comments',
          maxLength: 5000,
          'x-qegos': { fieldKey: 'comments', widget: 'textarea' },
        },
      },
    },

    // ─── Step 9: Consent ───────────────────────────────────────────
    consent: {
      type: 'object',
      title: 'Consent Agreement',
      'x-qegos': { stepId: 'consent' },
      properties: {
        consent_agreement: {
          type: 'boolean',
          title:
            'I agree to share my financial information with Quintessential Accounting & Taxation.',
          const: true,
          'x-qegos': { fieldKey: 'consent_agreement', widget: 'checkbox' },
        },
      },
      required: ['consent_agreement'],
    },
  },
  required: [
    'personal_details',
    'address_details',
    'tax_banking',
    'primary_id',
    'secondary_id',
    'consent',
  ],
};

export const DEFAULT_UI_ORDER = [
  'personal_details',
  'address_details',
  'tax_banking',
  'work_related_expenses',
  'investment_property',
  'primary_id',
  'secondary_id',
  'other_comments',
  'consent',
];

// ─── Seeder ───────────────────────────────────────────────────────────

interface SeedArgs {
  FormMappingModel: Model<IFormMappingDocument>;
  FormMappingVersionModel: Model<IFormMappingVersionDocument>;
  SalesModel: Model<{ _id: Types.ObjectId; isActive?: boolean; name?: string; category?: string }>;
  systemUserId: Types.ObjectId;
  financialYear?: string;
}

export async function seedFormMappings(args: SeedArgs): Promise<void> {
  const {
    FormMappingModel,
    FormMappingVersionModel,
    SalesModel,
    systemUserId,
    financialYear = '2025-2026',
  } = args;

  const salesItems = await SalesModel.find({ isActive: true }).lean();
  if (salesItems.length === 0) {
    // Silent exit — sales seeding runs first, but if it didn't, skip.
    return;
  }

  for (const sale of salesItems) {
    const existing = await FormMappingModel.findOne({
      salesItemId: sale._id,
      financialYear,
    });
    if (existing) {
      continue;
    }

    const mapping = await FormMappingModel.create({
      salesItemId: sale._id,
      financialYear,
      title: `${sale.name ?? 'Product'} Intake — FY ${financialYear}`,
      description: `Default form mapping for ${sale.name ?? 'product'} seeded from the live QETAX intake form.`,
      createdBy: systemUserId,
    });

    const version = await FormMappingVersionModel.create({
      mappingId: mapping._id,
      version: 1,
      status: 'published',
      lifecycleStatus: 'active',
      isDefault: true,
      jsonSchema: QETAX_DEFAULT_SCHEMA,
      uiOrder: DEFAULT_UI_ORDER,
      publishedAt: new Date(),
      publishedBy: systemUserId,
      notes: 'Seeded from fileyourtax.tsx — QETAX canonical form (FY 2025-2026).',
    });

    void version; // no-op to silence unused warning in some configs
  }
}
