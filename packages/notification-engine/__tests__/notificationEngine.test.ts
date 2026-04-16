/**
 * @nugen/notification-engine Tests
 *
 * Validates:
 * - Types, constants, and configuration shapes
 * - Merge tag rendering (NTF-INV-04)
 * - Quiet hours calculation (NTF-INV-02)
 * - Dedup key format (NTF-INV-05)
 * - Validators
 * - Route factory exports
 */

import {
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  RECIPIENT_TYPES,
  PREFERENCE_LANGUAGES,
  QUIET_HOURS_EXEMPT_CHANNELS,
  DEDUP_TTL_SECONDS,
  DEFAULT_QUIET_START,
  DEFAULT_QUIET_END,
  DEFAULT_TIMEZONE,
  DEFAULT_RETENTION_DAYS,
  MERGE_TAG_FALLBACKS,
} from '../src/types';

import type {
  NotificationType,
  NotificationChannel,
  RecipientType,
  NotificationEngineConfig,
  INotification,
  INotificationPreference,
  ChannelResult,
  SendNotificationParams,
} from '../src/types';

import { renderMergeTags } from '../src/services/templateService';
import { calculateQuietHoursDelay, buildDedupKey } from '../src/services/notificationService';

import {
  validateListNotifications,
  validateMarkRead,
  validateUpdatePreferences,
  validateSendNotification,
} from '../src/validators/notificationValidators';

import { createNotificationRoutes } from '../src/routes/notificationRoutes';

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

describe('@nugen/notification-engine — Types & Constants', () => {
  test('notification types include all 16 types', () => {
    expect(NOTIFICATION_TYPES).toHaveLength(16);
    expect(NOTIFICATION_TYPES).toEqual(
      expect.arrayContaining([
        'order_status',
        'payment_received',
        'payment_failed',
        'document_signed',
        'lead_assigned',
        'lead_reminder',
        'follow_up_due',
        'follow_up_overdue',
        'broadcast_delivery',
        'chat_message',
        'review_request',
        'review_submitted',
        'referral_reward',
        'deadline_reminder',
        'cra_status_update',
        'system_alert',
      ]),
    );
  });

  test('notification channels include 5 channels', () => {
    expect(NOTIFICATION_CHANNELS).toHaveLength(5);
    expect(NOTIFICATION_CHANNELS).toEqual(
      expect.arrayContaining(['push', 'sms', 'email', 'in_app', 'slack']),
    );
  });

  test('recipient types include 3 types', () => {
    expect(RECIPIENT_TYPES).toHaveLength(3);
    expect(RECIPIENT_TYPES).toEqual(expect.arrayContaining(['client', 'staff', 'admin']));
  });

  test('preference languages include 6 languages', () => {
    expect(PREFERENCE_LANGUAGES).toHaveLength(6);
    expect(PREFERENCE_LANGUAGES).toEqual(
      expect.arrayContaining(['en', 'zh', 'hi', 'pa', 'vi', 'ar']),
    );
  });

  test('NTF-INV-02: quiet hours exempt channels are email and in_app', () => {
    expect(QUIET_HOURS_EXEMPT_CHANNELS).toHaveLength(2);
    expect(QUIET_HOURS_EXEMPT_CHANNELS).toContain('email');
    expect(QUIET_HOURS_EXEMPT_CHANNELS).toContain('in_app');
    expect(QUIET_HOURS_EXEMPT_CHANNELS).not.toContain('push');
    expect(QUIET_HOURS_EXEMPT_CHANNELS).not.toContain('sms');
  });

  test('NTF-INV-05: dedup TTL is 300 seconds (5 minutes)', () => {
    expect(DEDUP_TTL_SECONDS).toBe(300);
  });

  test('default quiet hours are 21:00 to 08:00', () => {
    expect(DEFAULT_QUIET_START).toBe('21:00');
    expect(DEFAULT_QUIET_END).toBe('08:00');
  });

  test('default timezone is Australia/Sydney', () => {
    expect(DEFAULT_TIMEZONE).toBe('Australia/Sydney');
  });

  test('default retention is 90 days', () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(90);
  });
});

// =============================================================================
// MERGE TAG RENDERING (NTF-INV-04)
// =============================================================================

describe('@nugen/notification-engine — Merge Tags', () => {
  test('NTF-INV-04: renders merge tags with provided data', () => {
    const result = renderMergeTags('Hello {{firstName}}, your order {{orderNumber}} is ready!', {
      firstName: 'John',
      orderNumber: 'QGS-O-0042',
    });
    expect(result).toBe('Hello John, your order QGS-O-0042 is ready!');
  });

  test('NTF-INV-04: uses fallback for missing data', () => {
    const result = renderMergeTags('Hello {{firstName}}, welcome to {{companyName}}!', {});
    expect(result).toBe('Hello Valued Client, welcome to QEGOS!');
  });

  test('NTF-INV-04: unrecognized tags resolve to empty string', () => {
    const result = renderMergeTags('Hello {{unknownTag}}!', {});
    expect(result).toBe('Hello !');
  });

  test('NTF-INV-04: empty merge data uses all fallbacks', () => {
    const result = renderMergeTags('{{firstName}} - {{staffName}} - {{companyName}}', {});
    expect(result).toBe('Valued Client -  - QEGOS');
  });

  test('NTF-INV-04: provided data overrides fallbacks', () => {
    const result = renderMergeTags('Dear {{firstName}}', { firstName: 'Alice' });
    expect(result).toBe('Dear Alice');
  });

  test('NTF-INV-04: template with no tags is returned unchanged', () => {
    const result = renderMergeTags('No tags here', { firstName: 'Test' });
    expect(result).toBe('No tags here');
  });

  test('merge tag fallbacks contain expected keys', () => {
    expect(MERGE_TAG_FALLBACKS).toHaveProperty('firstName', 'Valued Client');
    expect(MERGE_TAG_FALLBACKS).toHaveProperty('companyName', 'QEGOS');
    expect(MERGE_TAG_FALLBACKS).toHaveProperty('amount', '');
    expect(MERGE_TAG_FALLBACKS).toHaveProperty('staffName', '');
    expect(MERGE_TAG_FALLBACKS).toHaveProperty('deadlineDate', '');
    expect(MERGE_TAG_FALLBACKS).toHaveProperty('orderNumber', '');
  });
});

// =============================================================================
// QUIET HOURS (NTF-INV-02)
// =============================================================================

describe('@nugen/notification-engine — Quiet Hours', () => {
  test('NTF-INV-02: calculateQuietHoursDelay is a function', () => {
    expect(typeof calculateQuietHoursDelay).toBe('function');
  });

  test('NTF-INV-02: returns a non-negative number', () => {
    const result = calculateQuietHoursDelay('Australia/Sydney', '21:00', '08:00');
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('NTF-INV-02: returns 0 for same start and end (no quiet hours)', () => {
    const result = calculateQuietHoursDelay('Australia/Sydney', '12:00', '12:00');
    expect(result).toBe(0);
  });

  test('NTF-INV-02: result is always in milliseconds (multiple of 60000)', () => {
    const result = calculateQuietHoursDelay('UTC', '00:00', '23:59');
    // If we're in quiet hours, delay should be a multiple of 60000 ms
    if (result > 0) {
      expect(result % 60000).toBe(0);
    }
  });

  test('NTF-INV-02: handles valid IANA timezone without throwing', () => {
    expect(() => calculateQuietHoursDelay('America/New_York', '22:00', '06:00')).not.toThrow();
    expect(() => calculateQuietHoursDelay('Europe/London', '23:00', '07:00')).not.toThrow();
    expect(() => calculateQuietHoursDelay('Asia/Kolkata', '21:00', '08:00')).not.toThrow();
  });
});

// =============================================================================
// DEDUP KEY (NTF-INV-05)
// =============================================================================

describe('@nugen/notification-engine — Dedup Key', () => {
  test('NTF-INV-05: builds dedup key with all components', () => {
    const key = buildDedupKey('order_status', 'user123', 'order456');
    expect(key).toBe('ntf:dedup:order_status:user123:order456');
  });

  test('NTF-INV-05: uses "none" when no relatedResourceId', () => {
    const key = buildDedupKey('system_alert', 'user123');
    expect(key).toBe('ntf:dedup:system_alert:user123:none');
  });

  test('NTF-INV-05: different types produce different keys', () => {
    const key1 = buildDedupKey('payment_received', 'user1', 'pay1');
    const key2 = buildDedupKey('payment_failed', 'user1', 'pay1');
    expect(key1).not.toBe(key2);
  });

  test('NTF-INV-05: different recipients produce different keys', () => {
    const key1 = buildDedupKey('order_status', 'user1', 'order1');
    const key2 = buildDedupKey('order_status', 'user2', 'order1');
    expect(key1).not.toBe(key2);
  });
});

// =============================================================================
// VALIDATORS
// =============================================================================

describe('@nugen/notification-engine — Validators', () => {
  test('validateListNotifications returns 4 chains', () => {
    expect(validateListNotifications()).toHaveLength(4);
  });

  test('validateMarkRead returns 1 chain', () => {
    expect(validateMarkRead()).toHaveLength(1);
  });

  test('validateUpdatePreferences returns 6 chains', () => {
    expect(validateUpdatePreferences()).toHaveLength(6);
  });

  test('validateSendNotification returns 7 chains', () => {
    expect(validateSendNotification()).toHaveLength(7);
  });
});

// =============================================================================
// ROUTES
// =============================================================================

describe('@nugen/notification-engine — Routes', () => {
  test('createNotificationRoutes is a function', () => {
    expect(typeof createNotificationRoutes).toBe('function');
  });
});

// =============================================================================
// CROSS-INVARIANT CHECKS
// =============================================================================

describe('@nugen/notification-engine — Invariant Summary', () => {
  test('NTF-INV-02: push and sms are NOT in quiet hours exempt list', () => {
    expect(QUIET_HOURS_EXEMPT_CHANNELS).not.toContain('push');
    expect(QUIET_HOURS_EXEMPT_CHANNELS).not.toContain('sms');
    expect(QUIET_HOURS_EXEMPT_CHANNELS).not.toContain('slack');
  });

  test('NTF-INV-04: all common merge tags have defined fallbacks', () => {
    const expectedTags = [
      'firstName',
      'lastName',
      'orderNumber',
      'staffName',
      'companyName',
      'deadlineDate',
      'amount',
    ];
    for (const tag of expectedTags) {
      expect(MERGE_TAG_FALLBACKS).toHaveProperty(tag);
    }
  });

  test('NTF-INV-05: dedup TTL matches 5-minute window', () => {
    expect(DEDUP_TTL_SECONDS).toBe(5 * 60);
  });

  test('all notification types are unique', () => {
    const unique = new Set(NOTIFICATION_TYPES);
    expect(unique.size).toBe(NOTIFICATION_TYPES.length);
  });

  test('all notification channels are unique', () => {
    const unique = new Set(NOTIFICATION_CHANNELS);
    expect(unique.size).toBe(NOTIFICATION_CHANNELS.length);
  });

  test('retention days is a positive integer', () => {
    expect(Number.isInteger(DEFAULT_RETENTION_DAYS)).toBe(true);
    expect(DEFAULT_RETENTION_DAYS).toBeGreaterThan(0);
  });
});
