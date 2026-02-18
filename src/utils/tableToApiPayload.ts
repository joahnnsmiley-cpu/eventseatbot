import type { TableModel } from '../../types';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Convert TableModel to backend API payload format. Only fields backend expects — no legacy duplicates. */
export function tableToApiPayload(t: TableModel, index: number): Record<string, unknown> {
  const payload: Record<string, unknown> = {
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
  if (t.id && isUuid(t.id)) {
    payload.id = t.id;
  }
  return payload;
}
