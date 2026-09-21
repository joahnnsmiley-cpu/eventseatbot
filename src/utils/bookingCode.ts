/**
 * Short code for a booking, derived from its id.
 *
 * A transfer by SBP carries a short message, and nobody retypes a 36-character
 * UUID into it. Four characters of the id are enough for an organiser to match
 * a payment to a booking within one evening, and they need no new column: the
 * same code comes out of the same booking everywhere it is shown.
 */
export function bookingCode(id: string | null | undefined): string {
  const clean = String(id ?? '').replace(/[^a-z0-9]/gi, '');
  return clean ? clean.slice(0, 4).toUpperCase() : '—';
}
