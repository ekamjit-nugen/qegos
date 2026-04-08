import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const AU_TIMEZONE = 'Australia/Sydney';

/** Convert integer cents to AUD display string: 15000 → "$150.00" */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100);
}

/** Format UTC date to Australian timezone display */
export function formatDate(date: string | Date | undefined, format = 'DD/MM/YYYY'): string {
  if (!date) { return '-'; }
  return dayjs.utc(date).tz(AU_TIMEZONE).format(format);
}

/** Format UTC date with time */
export function formatDateTime(date: string | Date | undefined): string {
  return formatDate(date, 'DD/MM/YYYY h:mm A');
}

/** Format relative time: "2 hours ago", "3 days ago" */
export function formatRelative(date: string | Date | undefined): string {
  if (!date) { return '-'; }
  const d = dayjs.utc(date);
  const now = dayjs();
  const diffMinutes = now.diff(d, 'minute');
  if (diffMinutes < 1) { return 'just now'; }
  if (diffMinutes < 60) { return `${diffMinutes}m ago`; }
  const diffHours = now.diff(d, 'hour');
  if (diffHours < 24) { return `${diffHours}h ago`; }
  const diffDays = now.diff(d, 'day');
  if (diffDays < 30) { return `${diffDays}d ago`; }
  return formatDate(date);
}

/** Format E.164 phone to display: +61412345678 → 0412 345 678 */
export function formatPhone(phone: string | undefined): string {
  if (!phone) { return '-'; }
  if (phone.startsWith('+61') && phone.length === 12) {
    const local = '0' + phone.slice(3);
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return phone;
}

/** Full name from first + last */
export function fullName(firstName?: string, lastName?: string): string {
  return [firstName, lastName].filter(Boolean).join(' ') || '-';
}
