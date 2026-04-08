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

const DETECT_PROMPT = `You are analyzing a venue seating chart image. Detect ALL objects and return their positions as percentages.

IMPORTANT: Output ONLY the JSON object below. No explanation, no markdown, no text before or after. Start your response with { and end with }.

COORDINATE SYSTEM:
- centerX: 0=left edge, 100=right edge
- centerY: 0=top edge, 100=bottom edge
- widthPercent, heightPercent: size as % of image dimensions

OBJECT TYPES:
- "table": guest seating table (circle or rect). Estimate seatsTotal.
- "stage": stage, podium, performance area
- "bar": bar, buffet, counter
- "wall": wall, partition, boundary
- "passage": aisle, corridor, exit
- "other": any other element

OUTPUT FORMAT (JSON only, nothing else):
{"objects":[{"type":"table","centerX":25,"centerY":30,"widthPercent":8,"heightPercent":8,"shape":"circle","seatsTotal":4},{"type":"stage","label":"Stage","centerX":50,"centerY":10,"widthPercent":60,"heightPercent":15,"shape":"rect"}]}`;

/** Extract first valid JSON object from text (handles markdown fences and extra surrounding text) */
function extractJson(text: string): string {
  // Remove markdown fences
  let t = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // Find first opening brace
  const start = t.indexOf('{');
  if (start === -1) return t;

  // Use brace counter to find the matching closing brace (handles nested objects correctly)
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === '{') depth++;
    else if (t[i] === '}') {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }

  // Fallback: use last }
  const end = t.lastIndexOf('}');
  if (end < start) return t;
  return t.slice(start, end + 1);
}

const router = Router();

router.post('/detect-layout', authMiddleware, adminOnly, upload.single('file'), async (req: Request, res: Response) => {
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
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
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
    response_format: { type: 'json_object' },
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
      console.error('[detect-layout] Failed to parse JSON. Raw response:', rawText.slice(0, 800));
      return res.status(502).json({
        error: 'Не удалось распознать ответ модели. Попробуйте ещё раз или используйте другое изображение.',
      });
    }

    if (!Array.isArray(parsed.objects)) {
      console.error('[detect-layout] Missing objects array. Parsed:', JSON.stringify(parsed).slice(0, 300));
      return res.status(502).json({
        error: 'Модель не вернула список объектов. Попробуйте ещё раз.',
      });
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
