const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Australia/Sydney',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Australia/Sydney',
});

/** Convert integer cents to AUD display string: 15000 -> "$150.00" */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100);
}

/** Format UTC date string to Australian timezone display (DD/MM/YYYY) */
export function formatDate(date: string | Date | undefined): string {
  if (!date) {
    return '-';
  }
  return dateFormatter.format(new Date(date));
}

/** Format UTC date with time in Australian timezone */
export function formatDateTime(date: string | Date | undefined): string {
  if (!date) {
    return '-';
  }
  return dateTimeFormatter.format(new Date(date));
}

/** Format relative time: "2h ago", "3d ago" */
export function formatRelative(date: string | Date | undefined): string {
  if (!date) {
    return '-';
  }
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  return formatDate(date);
}

/** Format E.164 phone to display: +61412345678 -> 0412 345 678 */
export function formatPhone(phone: string | undefined): string {
  if (!phone) {
    return '-';
  }
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
