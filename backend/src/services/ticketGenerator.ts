import sharp from 'sharp';
import QRCode from 'qrcode';
import { supabase } from '../supabaseClient';
import { generateTicketToken } from './ticketToken';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

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

  try {
    let baseBuffer: Buffer;
    let width: number;
    let height: number;

    if (templateUrl) {
      const response = await fetch(templateUrl);
      if (!response.ok) {
        console.error('[ticketGenerator] Failed to fetch template:', response.status, response.statusText);
        return null;
      }
      const templateBuffer = Buffer.from(await response.arrayBuffer());
      baseBuffer = await sharp(templateBuffer)
        .resize({ width: 1200 })
        .toBuffer();

      const metadata = await sharp(baseBuffer).metadata();
      width = metadata.width ?? 1200;
      height = metadata.height ?? 600;
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

    // QR position (avoid overlap with design)
    const qrLeft = width * 0.05;
    const qrTop = height * 0.7;

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

    const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 180 });

    const finalBuffer = await sharp(baseBuffer)
      .composite([
        { input: Buffer.from(textSvg), top: 0, left: 0 },
        { input: qrBuffer, top: Math.round(qrTop), left: Math.round(qrLeft) },
      ])
      .png()
      .toBuffer();

    const filePath = `tickets/${bookingId}.png`;

    const { error: uploadErr } = await supabase.storage
      .from('tickets')
      .upload(filePath, finalBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[ticketGenerator] Upload failed:', uploadErr);
      return null;
    }

    const { data } = supabase.storage.from('tickets').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.error('[ticketGenerator] Error:', err);
    return null;
  }
}
