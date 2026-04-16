import { body, param, query } from 'express-validator';

// ─── Shared Enums ────────────────────────────────────────────────────────────

const CHANNELS = ['sms', 'email', 'whatsapp', 'sms_email', 'all'];
const SINGLE_CHANNELS = ['sms', 'email', 'whatsapp'];
const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'paused',
  'sent',
  'failed',
  'cancelled',
];
const AUDIENCE_TYPES = [
  'all_leads',
  'filtered_leads',
  'all_users',
  'filtered_users',
  'custom_list',
];
const TEMPLATE_CATEGORIES = [
  'follow_up',
  'promotion',
  'reminder',
  'announcement',
  'welcome',
  're_engagement',
  'deadline',
  'review_request',
];
const OPT_OUT_REASONS = [
  'user_request',
  'reply_stop',
  'bounce_hard',
  'bounce_soft_3x',
  'admin_manual',
  'spam_complaint',
];
const OPT_OUT_CHANNELS = ['sms', 'email', 'whatsapp', 'all'];

// ─── Campaign Validators ─────────────────────────────────────────────────────

export function createCampaignValidation(): ReturnType<typeof body>[] {
  return [
    body('name').isString().trim().isLength({ min: 1, max: 200 }),
    body('channel').isIn(CHANNELS),
    body('audienceType').isIn(AUDIENCE_TYPES),
    body('audienceFilters').optional().isObject(),
    body('audienceFilters.leadStatus').optional().isArray(),
    body('audienceFilters.priority').optional().isArray(),
    body('audienceFilters.source').optional().isArray(),
    body('audienceFilters.state').optional().isArray(),
    body('audienceFilters.tags').optional().isArray(),
    body('audienceFilters.financialYear').optional().isString(),
    body('audienceFilters.hasConsent').optional().isBoolean(),
    body('customList').optional().isArray({ max: 10000 }),
    body('customList.*.mobile')
      .optional()
      .matches(/^\+61\d{9}$/),
    body('customList.*.email').optional().isEmail(),
    body('customList.*.firstName').optional().isString().trim().isLength({ max: 100 }),
    body('customList.*.lastName').optional().isString().trim().isLength({ max: 100 }),
    body('smsTemplateId').optional().isMongoId(),
    body('emailTemplateId').optional().isMongoId(),
    body('whatsappTemplateId').optional().isMongoId(),
    body('smsBody').optional().isString().isLength({ max: 1600 }),
    body('emailSubject').optional().isString().isLength({ max: 500 }),
    body('emailBody').optional().isString().isLength({ max: 50000 }),
    body('whatsappTemplateName').optional().isString().isLength({ max: 200 }),
    body('whatsappTemplateParams').optional().isArray(),
    body('scheduledAt').optional().isISO8601(),
    body('abTest').optional().isObject(),
    body('abTest.enabled').optional().isBoolean(),
    body('abTest.winnerMetric').optional().isIn(['open_rate', 'click_rate']),
  ];
}

export function updateCampaignValidation(): ReturnType<typeof body>[] {
  return [
    param('id').isMongoId(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 200 }),
    body('channel').optional().isIn(CHANNELS),
    body('audienceType').optional().isIn(AUDIENCE_TYPES),
    body('audienceFilters').optional().isObject(),
    body('customList').optional().isArray({ max: 10000 }),
    body('smsTemplateId').optional().isMongoId(),
    body('emailTemplateId').optional().isMongoId(),
    body('whatsappTemplateId').optional().isMongoId(),
    body('smsBody').optional().isString().isLength({ max: 1600 }),
    body('emailSubject').optional().isString().isLength({ max: 500 }),
    body('emailBody').optional().isString().isLength({ max: 50000 }),
    body('whatsappTemplateName').optional().isString().isLength({ max: 200 }),
    body('whatsappTemplateParams').optional().isArray(),
    body('scheduledAt').optional().isISO8601(),
    body('abTest').optional().isObject(),
  ];
}

export function campaignIdValidation(): ReturnType<typeof param>[] {
  return [param('id').isMongoId()];
}

export function listCampaignsValidation(): ReturnType<typeof query>[] {
  return [
    query('status').optional().isIn(CAMPAIGN_STATUSES),
    query('channel').optional().isIn(CHANNELS),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ];
}

export function campaignMessagesValidation(): ReturnType<typeof param | typeof query>[] {
  return [
    param('id').isMongoId(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status')
      .optional()
      .isIn([
        'queued',
        'sending',
        'sent',
        'delivered',
        'failed',
        'bounced',
        'opened',
        'clicked',
        'opted_out',
      ]),
  ];
}

export function previewCampaignValidation(): ReturnType<typeof param | typeof body>[] {
  return [
    param('id').isMongoId(),
    body('channel').isIn(SINGLE_CHANNELS),
    body('mergeData').optional().isObject(),
  ];
}

export function previewMessageValidation(): ReturnType<typeof body>[] {
  return [
    body('channel').isIn(SINGLE_CHANNELS),
    body('body').isString().isLength({ min: 1, max: 50000 }),
    body('subject').optional().isString().trim().isLength({ max: 500 }),
    body('mergeData').optional().isObject(),
  ];
}

// ─── Template Validators ─────────────────────────────────────────────────────

export function createTemplateValidation(): ReturnType<typeof body>[] {
  return [
    body('name').isString().trim().isLength({ min: 1, max: 200 }),
    body('channel').isIn(SINGLE_CHANNELS),
    body('category').isIn(TEMPLATE_CATEGORIES),
    body('subject').optional().isString().trim().isLength({ max: 500 }),
    body('body').isString().isLength({ min: 1, max: 10000 }),
  ];
}

export function updateTemplateValidation(): ReturnType<typeof body>[] {
  return [
    param('id').isMongoId(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 200 }),
    body('subject').optional().isString().trim().isLength({ max: 500 }),
    body('body').optional().isString().isLength({ min: 1, max: 10000 }),
    body('isActive').optional().isBoolean(),
    body('category').optional().isIn(TEMPLATE_CATEGORIES),
  ];
}

export function listTemplatesValidation(): ReturnType<typeof query>[] {
  return [
    query('channel').optional().isIn(SINGLE_CHANNELS),
    query('category').optional().isIn(TEMPLATE_CATEGORIES),
    query('isActive').optional().isBoolean(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ];
}

// ─── Opt-Out Validators ──────────────────────────────────────────────────────

export function createOptOutValidation(): ReturnType<typeof body>[] {
  return [
    body('contact').isString().trim().isLength({ min: 1, max: 320 }),
    body('contactType').isIn(['mobile', 'email']),
    body('channel').isIn(OPT_OUT_CHANNELS),
    body('reason').isIn(OPT_OUT_REASONS),
    body('campaignId').optional().isMongoId(),
  ];
}

export function listOptOutsValidation(): ReturnType<typeof query>[] {
  return [
    query('channel').optional().isIn(OPT_OUT_CHANNELS),
    query('contactType').optional().isIn(['mobile', 'email']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ];
}

export function checkOptOutValidation(): ReturnType<typeof body>[] {
  return [
    body('contact').isString().trim().isLength({ min: 1, max: 320 }),
    body('channel').isIn(OPT_OUT_CHANNELS),
  ];
}

export function importOptOutsValidation(): ReturnType<typeof body>[] {
  return [
    body('entries').isArray({ min: 1, max: 5000 }),
    body('entries.*.contact').isString().trim().isLength({ min: 1 }),
    body('entries.*.contactType').isIn(['mobile', 'email']),
    body('entries.*.channel').isIn(OPT_OUT_CHANNELS),
    body('entries.*.reason').isIn(OPT_OUT_REASONS),
  ];
}
