import type { TableModel } from '../../types';

/** Convert TableModel to backend API payload format. Only fields backend expects — no legacy duplicates. */
export function tableToApiPayload(t: TableModel, index: number): Record<string, unknown> {
  return {
    id: t.id || `tbl-${Date.now()}-${index}`,
    number: typeof t.number === 'number' ? t.number : index + 1,
    centerX: t.centerXPercent,
    centerY: t.centerYPercent,
    widthPercent: t.widthPercent,
    heightPercent: t.shape === 'circle' ? t.widthPercent : t.heightPercent,
    rotationDeg: t.rotationDeg,
    seatsTotal: t.seatsCount,
    ticketCategoryId: t.categoryId || null,
    isAvailable: t.isActive,
    shape: t.shape,
  };
}
