/**
 * The table/venue-object model boundary.
 *
 * One number about a table used to live under four names: `center_x` and `x` in the
 * database, `centerX` and `x` on the backend model, `centerXPercent` on the frontend —
 * and the old mapper emitted the canonical name *and* a legacy alias side by side.
 * Every writer then had to remember to update both, and whoever forgot got a table
 * that sat in one place in the editor and another place for the guest.
 *
 * These two functions are the only places allowed to know the wire names.
 * Everything else works with `TableModel` from types.ts, where each field has
 * exactly one name.
 */
import type { ObjectType, TableModel } from '../../types';

export const DEFAULT_SIZE_PERCENT = 6;
const DEFAULT_SEATS = 4;

/** Finite number or null. `Number(x) || fallback` turns a legitimate 0 into the fallback. */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNum(...values: unknown[]): number | null {
  for (const v of values) {
    const n = num(v);
    if (n !== null) return n;
  }
  return null;
}

/**
 * Rows written before `shape` was mandatory can carry NULL. Falling back to
 * 'circle' turned every such object into a circle regardless of its dimensions —
 * a 40×8 stage included. Read the geometry instead.
 */
function resolveShape(raw: Record<string, any>): TableModel['shape'] {
  if (raw.shape === 'rect' || raw.shape === 'circle') return raw.shape;
  const w = firstNum(raw.widthPercent, raw.width_percent);
  const h = firstNum(raw.heightPercent, raw.height_percent);
  if (w !== null && h !== null && Math.abs(w - h) > 0.01) return 'rect';
  return 'circle';
}

/**
 * API/DB row → canonical model. The single reader of legacy field aliases.
 */
export function tableFromApi(raw: unknown): TableModel {
  const r = (raw ?? {}) as Record<string, any>;

  const shape = resolveShape(r);

  // size_percent is the legacy single dimension for circles; width/height came later.
  const size = firstNum(r.widthPercent, r.width_percent, r.sizePercent, r.size_percent);
  const width = size ?? DEFAULT_SIZE_PERCENT;
  const height = shape === 'circle'
    ? width
    : (firstNum(r.heightPercent, r.height_percent) ?? width);

  const seatsCount = Math.max(
    0,
    firstNum(r.seatsCount, r.seats_count, r.seatsTotal, r.seats_total) ?? DEFAULT_SEATS
  );
  const seatsAvailable = firstNum(r.seatsAvailable, r.seats_available) ?? seatsCount;

  // is_active is the soft-delete flag; isAvailable is "on sale". Both default to shown.
  const isActive = r.is_active !== false && r.isActive !== false && r.isAvailable !== false;

  return {
    id: String(r.id ?? `tbl-${Date.now()}`),
    number: firstNum(r.number) ?? 1,
    centerXPercent: firstNum(r.centerXPercent, r.centerX, r.center_x, r.x) ?? 50,
    centerYPercent: firstNum(r.centerYPercent, r.centerY, r.center_y, r.y) ?? 50,
    shape,
    widthPercent: width,
    heightPercent: height,
    rotationDeg: firstNum(r.rotationDeg, r.rotation_deg, r.rotation) ?? 0,
    seatsCount,
    seatsAvailable: Math.max(0, Math.min(seatsAvailable, seatsCount)),
    categoryId: String(r.categoryId ?? r.ticketCategoryId ?? r.ticket_category_id ?? ''),
    isActive,
    objectType: (r.objectType ?? r.object_type ?? 'table') as ObjectType,
    label: r.label ?? undefined,
    labelFontSize: firstNum(r.labelFontSize, r.label_font_size) ?? undefined,
    limitedView: r.limitedView === true || r.limited_view === true,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Canonical model → API payload. The single writer of wire field names.
 * A circle is square by definition, so height and size_percent follow width.
 */
export function tableToApi(t: TableModel, index: number): Record<string, unknown> {
  const isCircle = t.shape === 'circle';
  const payload: Record<string, unknown> = {
    number: typeof t.number === 'number' ? t.number : index + 1,
    centerX: t.centerXPercent,
    centerY: t.centerYPercent,
    widthPercent: t.widthPercent,
    heightPercent: isCircle ? t.widthPercent : t.heightPercent,
    sizePercent: isCircle ? t.widthPercent : undefined,
    rotationDeg: t.rotationDeg,
    seatsTotal: t.seatsCount,
    ticketCategoryId: t.categoryId || null,
    isAvailable: t.isActive,
    shape: t.shape,
    objectType: t.objectType ?? 'table',
    label: t.label ?? null,
    labelFontSize: t.labelFontSize ?? null,
    limitedView: t.limitedView === true,
  };
  // Backend generates ids for new objects; only send one it can match.
  if (t.id && isUuid(t.id)) payload.id = t.id;
  return payload;
}
