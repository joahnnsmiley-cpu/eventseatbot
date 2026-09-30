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

  // Длины сравниваем сами: timingSafeEqual бросает исключение на разной длине,
  // и подпись не того размера роняла проверку в 500 вместо честного отказа.
  const received = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (received.length !== want.length) return null;
  if (!crypto.timingSafeEqual(received, want)) return null;

  try {
    const json = Buffer.from(base64, 'base64url').toString();
    const payload = JSON.parse(json) as TicketPayload;

    /**
     * Срок жизни токена — год, а не сутки.
     *
     * Здесь стояли 24 часа, и это ломало саму суть предпродажи: билет
     * выпускается в момент оплаты, а концерт бывает через месяц. Проверено на
     * настоящем оплаченном билете — через сутки после выпуска он уже отвечал
     * «недействителен», то есть на входе не прошёл бы никто, кто купил заранее.
     *
     * Ограничивает билет не этот срок, а проверка при сканировании: она
     * пропускает только оплаченную и непогашенную бронь и только в окрестности
     * даты своего концерта. Год здесь — просто верхняя граница здравого смысла.
     */
    const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
    const age = Date.now() - payload.iat;
    if (!Number.isFinite(age) || age > TOKEN_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
