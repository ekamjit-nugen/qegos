import type { Model } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type {
  ITaxDeadlineDocument,
  IDeadlineReminderDocument,
  AustralianState,
} from './taxCalendar.types';
import { FEDERAL_HOLIDAYS_FIXED } from './taxCalendar.types';

// ─── Module State ───────────────────────────────────────────────────────────

let TaxDeadlineModel: Model<ITaxDeadlineDocument>;
let DeadlineReminderModel: Model<IDeadlineReminderDocument>;
let OrderModel: Model<any>;
let UserModel: Model<any>;

export function initCalendarService(deps: {
  TaxDeadlineModel: Model<ITaxDeadlineDocument>;
  DeadlineReminderModel: Model<IDeadlineReminderDocument>;
  OrderModel: Model<any>;
  UserModel: Model<any>;
}): void {
  TaxDeadlineModel = deps.TaxDeadlineModel;
  DeadlineReminderModel = deps.DeadlineReminderModel;
  OrderModel = deps.OrderModel;
  UserModel = deps.UserModel;
}

// ─── Upcoming Deadlines (Client) ────────────────────────────────────────────

export async function getUpcomingDeadlines(
  userId: string,
  userType?: string,
): Promise<ITaxDeadlineDocument[]> {
  const now = new Date();

  const applicableFilter: string[] = ['all_clients'];
  if (userType) applicableFilter.push(userType);

  // Pull a larger-than-needed window so we can drop already-filed FYs and
  // still return `limit` items. Tax deadlines are org-wide, but once the
  // client has filed for the relevant financial year (order status >= 7)
  // the deadline is no longer "upcoming" for them personally.
  const candidates = (await TaxDeadlineModel.find({
    isActive: true,
    deadlineDate: { $gte: now },
    applicableTo: { $in: applicableFilter },
  })
    .sort({ deadlineDate: 1 })
    .limit(10)
    .lean()) as unknown as ITaxDeadlineDocument[];

  if (candidates.length === 0) return [];

  const financialYears = Array.from(
    new Set(candidates.map((d) => d.financialYear).filter(Boolean)),
  );
  const filedOrders = await OrderModel.find({
    userId,
    status: { $gte: 7 },
    financialYear: { $in: financialYears },
  })
    .select('financialYear')
    .lean<Array<{ financialYear?: string }>>();

  const filedFys = new Set(
    filedOrders.map((o) => o.financialYear).filter(Boolean) as string[],
  );

  return candidates
    .filter((d) => !filedFys.has(d.financialYear))
    .slice(0, 3);
}

// ─── List Deadlines ─────────────────────────────────────────────────────────

export interface ListDeadlinesParams {
  financialYear?: string;
  type?: string;
  applicableTo?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export async function listDeadlines(
  params: ListDeadlinesParams,
): Promise<{ deadlines: ITaxDeadlineDocument[]; total: number }> {
  const { financialYear, type, applicableTo, isActive, page = 1, limit = 20 } = params;

  const filter: Record<string, unknown> = {};
  if (financialYear) filter.financialYear = financialYear;
  if (type) filter.type = type;
  if (applicableTo) filter.applicableTo = applicableTo;
  if (isActive !== undefined) filter.isActive = isActive;

  const skip = (page - 1) * limit;

  const [deadlines, total] = await Promise.all([
    TaxDeadlineModel.find(filter)
      .sort({ deadlineDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TaxDeadlineModel.countDocuments(filter),
  ]);

  return { deadlines: deadlines as unknown as ITaxDeadlineDocument[], total };
}

// ─── Create Deadline (Admin) ────────────────────────────────────────────────

export async function createDeadline(
  data: Partial<ITaxDeadlineDocument>,
): Promise<ITaxDeadlineDocument> {
  return TaxDeadlineModel.create(data);
}

// ─── Update Deadline (Admin) ────────────────────────────────────────────────

export async function updateDeadline(
  id: string,
  data: Partial<ITaxDeadlineDocument>,
): Promise<ITaxDeadlineDocument> {
  const deadline = await TaxDeadlineModel.findByIdAndUpdate(id, data, { new: true });
  if (!deadline) throw AppError.notFound('Tax deadline');
  return deadline;
}

// ─── Process Reminders (Cron) ───────────────────────────────────────────────

export async function processReminders(): Promise<number> {
  const now = new Date();
  let sentCount = 0;

  const deadlines = await TaxDeadlineModel.find({
    isActive: true,
    deadlineDate: { $gte: now },
  }).lean();

  for (const deadline of deadlines) {
    let deadlineSent = 0;
    for (const schedule of deadline.reminderSchedule) {
      // UTC throughout: deadlineDate is stored as UTC, getNextBusinessDay
      // uses getUTCDay / getUTC*, so the arithmetic and the "is it today?"
      // comparison must also be UTC or a server in e.g. UTC+10 will skew
      // the reminder by a calendar day.
      const reminderDate = new Date(deadline.deadlineDate);
      reminderDate.setUTCDate(reminderDate.getUTCDate() - schedule.daysBefore);

      // CAL-INV-02: Shift to next business day if weekend/holiday
      const adjustedDate = getNextBusinessDay(reminderDate);

      // Only process if today (UTC) matches the adjusted reminder date (UTC)
      if (
        adjustedDate.getUTCFullYear() !== now.getUTCFullYear() ||
        adjustedDate.getUTCMonth() !== now.getUTCMonth() ||
        adjustedDate.getUTCDate() !== now.getUTCDate()
      ) {
        continue;
      }

      // Find applicable users
      const userFilter: Record<string, unknown> = {};
      if (deadline.applicableTo !== 'all_clients') {
        userFilter.clientType = deadline.applicableTo;
      }

      const users = await UserModel.find(userFilter).select('_id').lean();

      for (const user of users) {
        const userId = user._id;

        // CAL-INV-01: Skip if client already filed (order status >= 7)
        const filedOrder = await OrderModel.findOne({
          userId,
          status: { $gte: 7 },
          financialYear: deadline.financialYear,
        }).lean();

        if (filedOrder) continue;

        // CAL-INV-03: Dedup via unique index
        try {
          await DeadlineReminderModel.create({
            userId,
            deadlineId: deadline._id,
            daysBefore: schedule.daysBefore,
            channel: schedule.channel,
          });
          sentCount++;
          deadlineSent++;
          // In production: emit notification event here
        } catch (err: unknown) {
          // Duplicate key error (E11000) = already sent, skip
          if ((err as { code?: number }).code === 11000) continue;
          throw err;
        }
      }
    }

    // Keep the per-deadline counter honest so admin dashboards can surface
    // actual send volume without reaggregating from DeadlineReminder.
    if (deadlineSent > 0) {
      await TaxDeadlineModel.updateOne(
        { _id: deadline._id },
        { $inc: { notificationsSent: deadlineSent } },
      );
    }
  }

  return sentCount;
}

// ─── Business Day Helpers ───────────────────────────────────────────────────

/**
 * CAL-INV-02: If date falls on weekend or AU public holiday, shift to next business day.
 */
export function getNextBusinessDay(date: Date, state?: AustralianState): Date {
  const result = new Date(date);
  while (isWeekend(result) || isAustralianPublicHoliday(result, state)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Check if a date is an Australian public holiday.
 * Covers fixed federal holidays. Easter and variable holidays
 * are computed algorithmically.
 */
export function isAustralianPublicHoliday(date: Date, _state?: AustralianState): boolean {
  const month = date.getUTCMonth() + 1; // 1-indexed
  const day = date.getUTCDate();

  // Check fixed federal holidays
  for (const holiday of FEDERAL_HOLIDAYS_FIXED) {
    if (holiday.month === month && holiday.day === day) return true;
  }

  // Easter calculation (Anonymous Gregorian algorithm)
  const year = date.getUTCFullYear();
  const easter = computeEasterDate(year);

  // Good Friday (Easter - 2 days)
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);

  // Easter Saturday
  const easterSaturday = new Date(easter);
  easterSaturday.setUTCDate(easterSaturday.getUTCDate() - 1);

  // Easter Monday (Easter + 1 day)
  const easterMonday = new Date(easter);
  easterMonday.setUTCDate(easterMonday.getUTCDate() + 1);

  const easterDates = [goodFriday, easterSaturday, easter, easterMonday];
  for (const ed of easterDates) {
    if (
      ed.getUTCMonth() === date.getUTCMonth() &&
      ed.getUTCDate() === date.getUTCDate()
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Compute Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 */
function computeEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day));
}
