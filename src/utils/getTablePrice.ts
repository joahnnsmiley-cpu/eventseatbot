import type { EventData, Table } from '../types';

/**
 * Get price for a seat at the given table.
 * Prioritizes ticket category price; falls back to seat.price (0 if not available).
 */
export function getPriceForTable(
  event: EventData | null | undefined,
  table: Table | null | undefined,
  seatPriceFallback: number = 0
): number {
  if (!event || !table) return seatPriceFallback || 0;
  const category = event.ticketCategories?.find((c) => c.id === table.ticketCategoryId);
  if (category?.price != null) {
    return category.price;
  }
  return seatPriceFallback || 0;
}
