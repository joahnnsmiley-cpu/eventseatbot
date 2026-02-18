import type { TableModel } from '../../types';

/** Convert TableModel to API/backend payload format. Uses centerX/centerY if present (legacy sync). */
export function tableToApiPayload(t: TableModel & { centerX?: number; centerY?: number }, index: number): Record<string, unknown> {
  const x = t.centerX ?? t.centerXPercent;
  const y = t.centerY ?? t.centerYPercent;
  return {
    id: t.id || `tbl-${Date.now()}-${index}`,
    number: typeof t.number === 'number' ? t.number : index + 1,
    centerX: x,
    centerY: y,
    x,
    y,
    seatsTotal: t.seatsCount,
    seatsAvailable: t.seatsCount,
    widthPercent: t.widthPercent,
    heightPercent: t.shape === 'circle' ? t.widthPercent : t.heightPercent,
    sizePercent: t.shape === 'circle' ? t.widthPercent : undefined,
    rotationDeg: t.rotationDeg,
    shape: t.shape,
    ticketCategoryId: t.categoryId || null,
    isAvailable: t.isActive,
    is_active: t.isActive,
  };
}
