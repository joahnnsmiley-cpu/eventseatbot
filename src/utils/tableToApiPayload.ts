import type { TableModel } from '../../types';

/** Convert TableModel to API/backend payload format. */
export function tableToApiPayload(t: TableModel, index: number): Record<string, unknown> {
  return {
    id: t.id || `tbl-${Date.now()}-${index}`,
    number: typeof t.number === 'number' ? t.number : index + 1,
    centerX: t.centerXPercent,
    centerY: t.centerYPercent,
    x: t.centerXPercent,
    y: t.centerYPercent,
    seatsTotal: t.seatsCount,
    seatsAvailable: t.seatsCount,
    widthPercent: t.widthPercent,
    heightPercent: t.heightPercent,
    sizePercent: t.shape === 'circle' ? t.widthPercent : undefined,
    rotationDeg: t.rotationDeg,
    shape: t.shape,
    ticketCategoryId: t.categoryId || null,
    isAvailable: t.isActive,
    is_active: t.isActive,
  };
}
