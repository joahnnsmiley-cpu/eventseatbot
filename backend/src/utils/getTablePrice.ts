/**
 * Get price for a seat at the given table.
 * Prioritizes ticket category price; falls back to seatPriceFallback (0 if not available).
 */
export function getPriceForTable(
  event: { ticketCategories?: unknown } | null | undefined,
  table: { ticketCategoryId?: string | null } | null | undefined,
  seatPriceFallback: number = 0
): number {
  if (!event || !table) return seatPriceFallback || 0;
  const cats = event.ticketCategories as Array<{ id?: string; price?: number }> | undefined;
  const category = Array.isArray(cats) ? cats.find((c) => c.id === table.ticketCategoryId) : undefined;
  if (category?.price != null) {
    return category.price;
  }
  return seatPriceFallback || 0;
}
