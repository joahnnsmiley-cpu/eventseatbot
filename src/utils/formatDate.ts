/**
 * Date/time formatting using event's timezone offset (minutes ahead of UTC).
 * Offset is set by admin via "current time" reference in event card.
 */

const DEFAULT_OFFSET = 180; // UTC+3 (Moscow)

/** Parse event_date + event_time in event timezone → UTC timestamp (ms) */
export function parseEventToUtc(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
  offsetMinutes: number = DEFAULT_OFFSET
): number | null {
  if (!dateStr || !timeStr) return null;
  const parts = String(timeStr).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!parts) return null;
  const hh = parseInt(parts[1], 10);
  const mm = parseInt(parts[2], 10);
  const ss = parseInt(parts[3] ?? '0', 10);
  const dateParts = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateParts) return null;
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
  offsetMinutes: number = DEFAULT_OFFSET
): string | null {
  const ts = parseEventToUtc(dateStr, timeStr, offsetMinutes);
  return ts != null ? new Date(ts).toISOString() : null;
}

/** Format event_date + event_time as "11 февраля 2026 г. · 19:00" */
export function formatEventDateTime(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
  offsetMinutes: number = DEFAULT_OFFSET
): string {
  const ts = parseEventToUtc(dateStr, timeStr, offsetMinutes);
  if (ts == null) return '';
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const localMs = ts + offsetMinutes * 60 * 1000;
  const local = new Date(localMs);
  const day = local.getUTCDate();
  const month = months[local.getUTCMonth()];
  const year = local.getUTCFullYear();
  const datePart = `${day} ${month} ${year} г.`;
  const timePart = timeStr ? String(timeStr).slice(0, 5) : '';
  return timePart ? `${datePart} · ${timePart}` : datePart;
}

/** Format date only (YYYY-MM-DD) as "11 февраля 2026 г." */
export function formatEventDate(dateStr: string | null | undefined, offsetMinutes: number = DEFAULT_OFFSET): string {
  if (!dateStr) return '';
  const ts = parseEventToUtc(dateStr, '12:00:00', offsetMinutes);
  if (ts == null) return '';
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const localMs = ts + offsetMinutes * 60 * 1000;
  const local = new Date(localMs);
  return `${local.getUTCDate()} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()} г.`;
}

/** Parts for event display: { day, date, time } */
export function getEventDisplayParts(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
  offsetMinutes: number = DEFAULT_OFFSET
): { day: number; date: string; time: string } | null {
  if (!dateStr) return null;
  const ts = parseEventToUtc(dateStr, timeStr || '00:00:00', offsetMinutes);
  if (ts == null) return null;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const localMs = ts + offsetMinutes * 60 * 1000;
  const local = new Date(localMs);
  const day = local.getUTCDate();
  const date = `${day} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()} г.`;
  const time = timeStr ? String(timeStr).slice(0, 5) : '';
  return { day, date, time };
}

/** Parts for ISO date string (e.g. from event.date) — uses offset for display */
export function getEventDisplayPartsFromIso(
  iso: string | null | undefined,
  offsetMinutes: number = DEFAULT_OFFSET
): { day: number; date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const localMs = d.getTime() + offsetMinutes * 60 * 1000;
  const local = new Date(localMs);
  const day = local.getUTCDate();
  const date = `${day} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()} г.`;
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  const hasTime = h !== 0 || m !== 0;
  const time = hasTime ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : '';
  return { day, date, time };
}

/** Format date+time for display (UTC timestamp → local in offset) */
export function formatDateTimeRu(
  date: Date | number | string,
  offsetMinutes: number = DEFAULT_OFFSET
): string {
  const d = typeof date === 'number' ? new Date(date) : typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const localMs = d.getTime() + offsetMinutes * 60 * 1000;
  const local = new Date(localMs);
  const day = local.getUTCDate();
  const month = months[local.getUTCMonth()];
  const year = local.getUTCFullYear();
  const h = String(local.getUTCHours()).padStart(2, '0');
  const m = String(local.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${h}:${m}`;
}
