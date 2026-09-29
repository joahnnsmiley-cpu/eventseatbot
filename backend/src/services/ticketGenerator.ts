import sharp from 'sharp';
import QRCode from 'qrcode';
import { supabase } from '../supabaseClient';
import { generateTicketToken } from './ticketToken';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

/**
 * The template is the same image for every ticket of an event, and fetching it
 * again per ticket was the single slowest step. One event's template is ~1.5 MB;
 * keeping a few in memory costs little and removes a network round-trip from
 * the path between "paid" and "ticket in hand".
 */
const TEMPLATE_TTL_MS = 60 * 60 * 1000;
const TEMPLATE_CACHE_MAX = 4;
const templateCache = new Map<string, { buffer: Buffer; at: number }>();

async function fetchTemplate(url: string): Promise<Buffer | null> {
  const hit = templateCache.get(url);
  if (hit && Date.now() - hit.at < TEMPLATE_TTL_MS) return hit.buffer;

  const response = await fetch(url);
  if (!response.ok) {
    console.error('[ticketGenerator] Failed to fetch template:', response.status, response.statusText);
    return null;
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  // Меняется шаблон редко, так что вытесняем самый старый — этого достаточно.
  if (templateCache.size >= TEMPLATE_CACHE_MAX) {
    const oldest = [...templateCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) templateCache.delete(oldest[0]);
  }
  templateCache.set(url, { buffer, at: Date.now() });
  return buffer;
}

/** Забыть шаблон события: вызывается, когда админ загрузил новый. */
export function forgetTemplate(url: string): void {
  templateCache.delete(url);
}

/**
 * JPEG, а не PNG. Раньше билет весил 1,2 МБ: на маленьком инстансе кодирование
 * PNG такого размера — самая дорогая операция во всей выдаче, и этот же вес
 * потом качает Телеграм, прежде чем показать картинку гостю. JPEG даёт ~0,2 МБ.
 * Субсэмплинг выключен: он размывает границы, а по этим границам читается QR.
 */
const TICKET_EXT = 'jpg';
const TICKET_MIME = 'image/jpeg';

/** Уже готовый билет: его мог отрисовать предпрогрев, пока гость вводил карту. */
export async function findExistingTicket(bookingId: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage
      .from('tickets')
      .list('tickets', { search: bookingId, limit: 5 });
    if (error || !data) return null;
    const hit = data.find((f) => f.name.startsWith(`${bookingId}.`));
    if (!hit) return null;
    return supabase.storage.from('tickets').getPublicUrl(`tickets/${hit.name}`).data.publicUrl;
  } catch {
    return null;
  }
}

export interface GenerateTicketParams {
  templateUrl: string;
  bookingId: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  tableNumber: number | string;
  seats: number | string;
}

/**
 * Generate ticket PNG from template: resize to 1200px width (keep aspect ratio),
 * composite text + QR overlay via sharp.composite.
 * Returns public URL of the ticket image.
 */
export async function generateTicket(params: GenerateTicketParams): Promise<string | null> {
  const { templateUrl, bookingId, eventId, eventTitle, eventDate, tableNumber, seats } = params;

  if (!supabase) {
    console.error('[ticketGenerator] Supabase not configured');
    return null;
  }

  // Засечки по этапам: когда билет приходит медленно, первый вопрос — что
  // именно тормозит, сеть или процессор. Без них это гадание.
  const started = Date.now();
  const marks: Record<string, number> = {};
  let last = started;
  const mark = (name: string) => { marks[name] = Date.now() - last; last = Date.now(); };

  try {
    let baseBuffer: Buffer;
    let width: number;
    let height: number;

    if (templateUrl) {
      const cached = templateCache.has(templateUrl);
      const templateBuffer = await fetchTemplate(templateUrl);
      if (!templateBuffer) return null;
      mark(cached ? 'template_cached' : 'template_fetch');
      baseBuffer = await sharp(templateBuffer)
        .resize({ width: 1200 })
        .toBuffer();

      const metadata = await sharp(baseBuffer).metadata();
      width = metadata.width ?? 1200;
      height = metadata.height ?? 600;
      mark('resize');
    } else {
      width = 1200;
      height = 800;
      baseBuffer = await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 26, g: 26, b: 46 },
        },
      })
        .png()
        .toBuffer();
    }

    // Relative coordinates for text (scale with image, match template dotted lines)
    const lineCenterX = width * 0.8;
    const tableY = height * 0.72;
    const seatsY = height * 0.78;
    const fontSize = Math.round(width * 0.04);

    // QR position and size — large enough to scan reliably from a phone
    const qrSize = Math.round(Math.min(width, height) * 0.32); // ~32% of shorter side
    const qrLeft = Math.round(width * 0.04);
    const qrTop = Math.round(height * 0.62);

    const textSvg = `
<svg width="${width}" height="${height}">
  <text
    x="${lineCenterX}"
    y="${tableY}"
    font-size="${fontSize}"
    fill="white"
    font-weight="bold"
    text-anchor="middle">
    Стол ${tableNumber}
  </text>

  <text
    x="${lineCenterX}"
    y="${seatsY}"
    font-size="${fontSize}"
    fill="white"
    font-weight="bold"
    text-anchor="middle">
    Места ${seats}
  </text>
</svg>
`;

    let qrUrl: string;
    try {
      const token = generateTicketToken({
        bookingId,
        eventId,
        tableNumber,
        seats,
        iat: Date.now(),
      });
      qrUrl = `${BASE_URL}/verify-ticket/${token}`;
    } catch (err) {
      console.error('[ticketGenerator] TICKET_SECRET not set, cannot generate signed QR');
      return null;
    }

    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      width: qrSize,
      errorCorrectionLevel: 'H', // highest: survives 30% damage, best for printing
      margin: 2,
    });

    mark('qr');

    const finalBuffer = await sharp(baseBuffer)
      .composite([
        { input: Buffer.from(textSvg), top: 0, left: 0 },
        { input: qrBuffer, top: Math.round(qrTop), left: Math.round(qrLeft) },
      ])
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toBuffer();
    mark('encode');

    const filePath = `tickets/${bookingId}.${TICKET_EXT}`;

    const { error: uploadErr } = await supabase.storage
      .from('tickets')
      .upload(filePath, finalBuffer, {
        contentType: TICKET_MIME,
        upsert: true,
      });
    mark('upload');

    if (uploadErr) {
      console.error('[ticketGenerator] Upload failed:', uploadErr);
      return null;
    }

    console.log(JSON.stringify({
      action: 'ticket_generated',
      bookingId,
      totalMs: Date.now() - started,
      sizeKb: Math.round(finalBuffer.length / 1024),
      ...marks,
    }));

    const { data } = supabase.storage.from('tickets').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.error('[ticketGenerator] Error:', err);
    return null;
  }
}
