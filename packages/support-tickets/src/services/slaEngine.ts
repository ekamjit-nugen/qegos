import type { SupportTicketsConfig, TicketPriority } from '../types';
import { SLA_BY_PRIORITY } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let config: Required<SupportTicketsConfig>;

export function initSlaEngine(userConfig?: SupportTicketsConfig): void {
  config = {
    businessHoursStart: userConfig?.businessHoursStart ?? 9,
    businessHoursEnd: userConfig?.businessHoursEnd ?? 17,
    taxSeasonStart: userConfig?.taxSeasonStart ?? 8,
    taxSeasonEnd: userConfig?.taxSeasonEnd ?? 20,
    taxSeasonMonths: userConfig?.taxSeasonMonths ?? [6, 7, 8, 9], // Jul-Oct (0-indexed)
  };
}

// ─── Business Hours Check ───────────────────────────────────────────────────

/**
 * Check if a given date/time is within business hours (AEST).
 * Standard: Mon-Fri 9am-5pm
 * Tax Season (Jul-Oct): Mon-Sat 8am-8pm
 */
export function isBusinessHour(date: Date): boolean {
  // Convert to AEST (UTC+10)
  const aest = new Date(date.getTime() + 10 * 60 * 60 * 1000);
  const day = aest.getUTCDay(); // 0=Sun, 6=Sat
  const hour = aest.getUTCHours();
  const month = aest.getUTCMonth(); // 0-indexed

  const isTaxSeason = config.taxSeasonMonths.includes(month);

  if (isTaxSeason) {
    // Mon-Sat (1-6), extended hours
    if (day === 0) {
      return false;
    } // Sunday
    return hour >= config.taxSeasonStart && hour < config.taxSeasonEnd;
  }

  // Standard: Mon-Fri (1-5)
  if (day === 0 || day === 6) {
    return false;
  }
  return hour >= config.businessHoursStart && hour < config.businessHoursEnd;
}

// ─── SLA Deadline Calculator (TKT-INV-01) ───────────────────────────────────

/**
 * Calculate SLA deadline by adding business minutes to a start time.
 * Skips non-business hours and weekends.
 */
export function calculateSlaDeadline(startTime: Date, priority: TicketPriority): Date {
  const sla = SLA_BY_PRIORITY[priority];
  let remainingMinutes = sla.resolutionMinutes;

  const current = new Date(startTime.getTime());

  while (remainingMinutes > 0) {
    if (isBusinessHour(current)) {
      remainingMinutes--;
    }
    current.setTime(current.getTime() + 60_000); // advance 1 minute
  }

  return current;
}

/**
 * Calculate first response deadline.
 */
export function calculateFirstResponseDeadline(startTime: Date, priority: TicketPriority): Date {
  const sla = SLA_BY_PRIORITY[priority];
  let remainingMinutes = sla.firstResponseMinutes;

  const current = new Date(startTime.getTime());

  while (remainingMinutes > 0) {
    if (isBusinessHour(current)) {
      remainingMinutes--;
    }
    current.setTime(current.getTime() + 60_000);
  }

  return current;
}

/**
 * Check if SLA is at 80% elapsed (imminent breach warning).
 */
export function isSlaImminent(createdAt: Date, slaDeadline: Date, now: Date = new Date()): boolean {
  const total = slaDeadline.getTime() - createdAt.getTime();
  const elapsed = now.getTime() - createdAt.getTime();
  return elapsed >= total * 0.8 && elapsed < total;
}

/**
 * Check if SLA has been breached.
 */
export function isSlaBreached(slaDeadline: Date, now: Date = new Date()): boolean {
  return now.getTime() > slaDeadline.getTime();
}

/**
 * Get escalation trigger time for unassigned tickets.
 */
export function getEscalationTriggerTime(createdAt: Date, priority: TicketPriority): Date {
  const sla = SLA_BY_PRIORITY[priority];
  return new Date(createdAt.getTime() + sla.escalationTriggerMinutes * 60_000);
}
