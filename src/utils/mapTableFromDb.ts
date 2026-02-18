import type { TableModel } from '../../types';

const DEFAULT_SIZE = 6;

/** Convert backend/API table format to unified TableModel. */
export function mapTableFromDb(raw: any): TableModel {
  const centerX = raw.centerX ?? raw.center_x ?? raw.x ?? 50;
  const centerY = raw.centerY ?? raw.center_y ?? raw.y ?? 50;
  const rotationDeg = raw.rotationDeg ?? raw.rotation_deg ?? raw.rotation ?? 0;
  const seatsCount = raw.seatsCount ?? raw.seats_count ?? raw.seatsTotal ?? 4;
  const categoryId = raw.categoryId ?? raw.ticketCategoryId ?? raw.ticket_category_id ?? '';

  const sizeFromBackend = raw.sizePercent ?? raw.size_percent ?? raw.widthPercent ?? raw.width_percent ?? raw.heightPercent ?? raw.height_percent ?? DEFAULT_SIZE;
  const widthFromBackend = raw.widthPercent ?? raw.width_percent;
  const heightFromBackend = raw.heightPercent ?? raw.height_percent;

  const isRect = raw.shape === 'rect' || (typeof widthFromBackend === 'number' && typeof heightFromBackend === 'number');
  const widthPercent = isRect ? (widthFromBackend ?? sizeFromBackend) : sizeFromBackend;
  const heightPercent = isRect ? (heightFromBackend ?? sizeFromBackend) : sizeFromBackend;

  return {
    id: String(raw.id ?? `tbl-${Date.now()}`),
    number: typeof raw.number === 'number' ? raw.number : 1,
    centerXPercent: Number(centerX) || 50,
    centerYPercent: Number(centerY) || 50,
    shape: raw.shape === 'rect' ? 'rect' : 'circle',
    widthPercent: Number(widthPercent) || DEFAULT_SIZE,
    heightPercent: Number(heightPercent) || DEFAULT_SIZE,
    rotationDeg: Number(rotationDeg) || 0,
    seatsCount: Math.max(0, Number(seatsCount) || 4),
    categoryId: String(categoryId || ''),
    isActive: raw.is_active !== false && raw.isAvailable !== false,
  };
}
