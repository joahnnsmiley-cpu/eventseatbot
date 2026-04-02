import crypto from 'crypto';

export interface TicketPayload {
  bookingId: string;
  eventId: string;
  tableNumber: number | string;
  seats: number | string;
  iat: number;
}

export function generateTicketToken(payload: TicketPayload): string {
  const secret = process.env.TICKET_SECRET;
  if (!secret) {
    throw new Error('TICKET_SECRET is not set');
  }

  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(base64)
    .digest('base64url');

  return `${base64}.${signature}`;
}

export function verifyTicketToken(token: string): TicketPayload | null {
  const secret = process.env.TICKET_SECRET;
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const base64 = parts[0];
  const signature = parts[1];
  if (!base64 || !signature) return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(base64)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const json = Buffer.from(base64, 'base64url').toString();
    const payload = JSON.parse(json) as TicketPayload;
    // Reject tokens older than 24 hours
    const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - payload.iat > TOKEN_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
