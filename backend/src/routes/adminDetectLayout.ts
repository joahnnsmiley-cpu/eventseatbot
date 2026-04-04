import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
});

export type DetectedObject = {
  type: 'table' | 'stage' | 'bar' | 'wall' | 'passage' | 'other';
  label?: string;
  centerX: number;
  centerY: number;
  widthPercent: number;
  heightPercent: number;
  rotation?: number;
  shape?: 'circle' | 'rect';
  seatsTotal?: number;
};

const DETECT_PROMPT = `You are analyzing a venue seating chart image. Your task is to detect ALL objects visible in the image and return their positions as percentages of the image dimensions.

COORDINATE SYSTEM:
- centerX=0 means left edge, centerX=100 means right edge
- centerY=0 means top edge, centerY=100 means bottom edge
- widthPercent and heightPercent are sizes relative to image dimensions
- Be precise: look carefully at each object's actual position

OBJECT TYPES:
- "table": a table where guests sit (usually circle or rectangle). Count approximate seats.
- "stage": stage, podium, performance area
- "bar": bar, buffet, counter
- "wall": wall, partition, room boundary
- "passage": aisle, corridor, exit
- "other": any other element

RULES:
- Detect EVERY object, including all individual tables
- For each table: estimate center position very carefully
- shape: "circle" for round objects, "rect" for rectangular ones
- Return ONLY valid JSON, no markdown, no explanation

JSON format:
{"objects":[{"type":"table","centerX":25,"centerY":30,"widthPercent":8,"heightPercent":8,"shape":"circle","seatsTotal":4},{"type":"stage","label":"Stage","centerX":50,"centerY":10,"widthPercent":60,"heightPercent":15,"shape":"rect"}]}`;

/** Extract first valid JSON object from text (handles markdown fences and extra text) */
function extractJson(text: string): string {
  // Remove markdown fences
  let t = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  // Find first { and last }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return t;
  return t.slice(start, end + 1);
}

const router = Router();
router.use(authMiddleware, adminOnly);

router.post('/detect-layout', upload.single('file'), async (req: Request, res: Response) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GROQ_API_KEY not configured' });
  }

  const file = (req as any).file;
  if (!file || !file.buffer) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return res.status(400).json({ error: 'Invalid file type. Use PNG, JPG or WebP.' });
  }

  const base64Image = file.buffer.toString('base64');
  const mimeType = file.mimetype;

  const body = {
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
          { type: 'text', text: DETECT_PROMPT },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.05,
  };

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('[detect-layout] Groq API error', groqRes.status, errText);
      return res.status(502).json({ error: 'Groq API error', details: errText });
    }

    const groqData = await groqRes.json() as any;
    const rawText: string = groqData?.choices?.[0]?.message?.content ?? '';
    console.log('[detect-layout] raw response:', rawText.slice(0, 300));

    const jsonText = extractJson(rawText);

    let parsed: { objects: DetectedObject[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error('[detect-layout] Failed to parse response:', rawText);
      return res.status(502).json({ error: 'Failed to parse response', raw: rawText.slice(0, 500) });
    }

    if (!Array.isArray(parsed.objects)) {
      return res.status(502).json({ error: 'Invalid response structure', raw: rawText.slice(0, 500) });
    }

    const VALID_TYPES = ['table', 'stage', 'bar', 'wall', 'passage', 'other'];
    const objects: DetectedObject[] = parsed.objects.map((obj: any) => {
      const type: DetectedObject['type'] = VALID_TYPES.includes(obj.type)
        ? (obj.type as DetectedObject['type'])
        : 'other';
      const result: DetectedObject = {
        type,
        centerX: Math.max(1, Math.min(99, Number(obj.centerX) || 50)),
        centerY: Math.max(1, Math.min(99, Number(obj.centerY) || 50)),
        widthPercent: Math.max(2, Math.min(60, Number(obj.widthPercent) || 8)),
        heightPercent: Math.max(2, Math.min(60, Number(obj.heightPercent) || 8)),
        rotation: Number(obj.rotation) || 0,
        shape: obj.shape === 'rect' ? 'rect' : 'circle',
      };
      if (typeof obj.label === 'string' && obj.label) result.label = obj.label;
      if (type === 'table') result.seatsTotal = Math.max(1, Math.min(20, Number(obj.seatsTotal) || 4));
      return result;
    });

    console.log('[detect-layout] detected objects:', objects.length);
    return res.json({ objects });
  } catch (e) {
    console.error('[detect-layout]', e);
    return res.status(500).json({ error: 'Detection failed' });
  }
});

export default router;
