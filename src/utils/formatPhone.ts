/**
 * A payment phone people can read and check digit by digit before sending money.
 * Stored as 79831771601; shown as +7 983 177-16-01. Anything that does not look
 * like a Russian number is returned untouched.
 */
export function formatPhone(raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length !== 11 || !/^[78]/.test(digits)) return String(raw ?? '');
  const d = digits.slice(1);
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}
