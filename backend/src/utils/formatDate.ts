/**
 * Date/time formatting using event's timezone offset (minutes ahead of UTC).
 * Offset is set by admin via "current time" reference in event card.
 */

/** Parse event_date + event_time in event timezone → UTC timestamp (ms) */
export function parseEventToUtc(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
  offsetMinutes: number = 180
): number | null {
  if (!dateStr || !timeStr) return null;
  const parts = String(timeStr).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!parts || !parts[1] || !parts[2]) return null;
  const hh = parseInt(parts[1], 10);
  const mm = parseInt(parts[2], 10);
  const ss = parseInt(parts[3] ?? '0', 10);
  const dateParts = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateParts || !dateParts[1] || !dateParts[2] || !dateParts[3]) return null;
  const y = parseInt(dateParts[1], 10);
  const m = parseInt(dateParts[2], 10) - 1;
  const d = parseInt(dateParts[3], 10);
  const localMinutes = hh * 60 + mm + ss / 60;
  const utcMinutes = localMinutes - offsetMinutes;
  const utcMs = Date.UTC(y, m, d, 0, 0, 0) + utcMinutes * 60 * 1000;
  return utcMs;
}

export function parseEventToIso(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
  offsetMinutes: number = 180
): string | null {
  const ts = parseEventToUtc(dateStr, timeStr, offsetMinutes);
  return ts != null ? new Date(ts).toISOString() : null;
}

/** Format event_date + event_time as "15 марта 2026 г." in event timezone */
export function formatEventDateRu(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
  offsetMinutes: number = 180
): string {
  const ts = parseEventToUtc(dateStr, timeStr || '00:00:00', offsetMinutes);
  if (ts == null) return '';
  const localMs = ts + offsetMinutes * 60 * 1000;
  const local = new Date(localMs);
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const day = local.getUTCDate();
  const month = months[local.getUTCMonth()];
  const year = local.getUTCFullYear();
  return `${day} ${month} ${year} г.`;
}

/** Format date for notifications (DD.MM.YYYY HH:mm) in event timezone */
export function formatDateForNotification(
  date: string | number | Date | null | undefined,
  offsetMinutes: number = 180
): string {
  if (date == null) return '';
  const d = typeof date === 'number' ? new Date(date) : typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const utcMs = d.getTime();
  const localMs = utcMs + offsetMinutes * 60 * 1000;
  const local = new Date(localMs);
  const day = String(local.getUTCDate()).padStart(2, '0');
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const year = local.getUTCFullYear();
  const hours = String(local.getUTCHours()).padStart(2, '0');
  const minutes = String(local.getUTCMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}
