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
 * overlay centered text + QR code, upload to Supabase storage.
 * Returns public URL of the ticket image.
 */
export async function generateTicket(params: GenerateTicketParams): Promise<string | null> {
  const { templateUrl, bookingId, eventId, eventTitle, eventDate, tableNumber, seats } = params;

  if (!supabase) {
    console.error('[ticketGenerator] Supabase not configured');
    return null;
  }

  try {
    let templateBase64: string;
    let width: number;
    let height: number;

    if (templateUrl) {
      // 1. Download template
      const response = await fetch(templateUrl);
      if (!response.ok) {
        console.error('[ticketGenerator] Failed to fetch template:', response.status, response.statusText);
        return null;
      }
      const templateBuffer = Buffer.from(await response.arrayBuffer());

      // 2. Resize template to 1200px width, keep aspect ratio
      const resized = await sharp(templateBuffer)
        .resize({ width: 1200 })
        .toBuffer();

      const meta = await sharp(resized).metadata();
      width = meta.width ?? 1200;
      height = meta.height ?? 600;
      templateBase64 = resized.toString('base64');
    } else {
      // Fallback: solid background
      width = 1200;
      height = 800;
      const fallbackBuffer = await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 26, g: 26, b: 46 },
        },
      })
        .png()
        .toBuffer();
      templateBase64 = fallbackBuffer.toString('base64');
    }

    // 3. Generate signed token and QR code
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
    const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 200 });
    const qrBase64 = qrBuffer.toString('base64');

    // Coordinates (tune if needed)
    const centerX = 950;
    const tableY = 470;
    const seatsY = 520;

    const svg = `
      <svg width="${width}" height="${height}">
        <image href="data:image/png;base64,${templateBase64}" width="${width}" height="${height}"/>
        
        <text x="${centerX}" y="${tableY}"
          font-size="48"
          fill="white"
          font-weight="bold"
          text-anchor="middle"
        >
          Стол ${tableNumber}
        </text>

        <text x="${centerX}" y="${seatsY}"
          font-size="48"
          fill="white"
          font-weight="bold"
          text-anchor="middle"
        >
          Места ${seats}
        </text>

        <image href="data:image/png;base64,${qrBase64}"
          x="${centerX - 90}"
          y="${height - 200}"
          width="180"
          height="180"
        />
      </svg>
    `;

    const finalBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    // 4. Upload to Supabase
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
