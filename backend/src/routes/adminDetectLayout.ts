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
  centerX: number;  // 0-100 percent
  centerY: number;  // 0-100 percent
  widthPercent: number;
  heightPercent: number;
  rotation?: number;
  shape?: 'circle' | 'rect';
  seatsTotal?: number;
};

const DETECT_PROMPT = `Это схема зала для мероприятия. Твоя задача — определить ВСЕ объекты на схеме.

Типы объектов:
- table: стол, за которым сидят гости. Обычно круглый или прямоугольный. Укажи примерное число мест (seatsTotal).
- stage: сцена, подиум, площадка выступлений
- bar: бар, буфет, стойка
- wall: стена, перегородка, граница зала
- passage: проход, коридор, выход
- other: любой другой объект

Для каждого объекта верни:
- type: тип объекта (table | stage | bar | wall | passage | other)
- label: короткое описание (например "Сцена", "Бар") — необязательно для table
- centerX: горизонтальная позиция центра в процентах от ширины (0-100)
- centerY: вертикальная позиция центра в процентах от высоты (0-100)
- widthPercent: ширина объекта в процентах от ширины изображения (2-50)
- heightPercent: высота объекта в процентах от высоты изображения (2-50)
- rotation: угол поворота в градусах (0 если прямо)
- shape: "circle" для круглых объектов, "rect" для прямоугольных
- seatsTotal: для столов — примерное число мест (1-12)

Верни ТОЛЬКО валидный JSON объект (без markdown, без пояснений):
{"objects": [...]}`;

const router = Router();
router.use(authMiddleware, adminOnly);

router.post('/detect-layout', upload.single('file'), async (req: Request, res: Response) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
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
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: DETECT_PROMPT },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  };

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('[detect-layout] OpenAI API error', openaiRes.status, errText);
      return res.status(502).json({ error: 'OpenAI API error', details: errText });
    }

    const openaiData = await openaiRes.json() as any;
    const rawText: string = openaiData?.choices?.[0]?.message?.content ?? '';

    // Strip markdown code fences if present
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed: { objects: DetectedObject[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error('[detect-layout] Failed to parse OpenAI response', rawText);
      return res.status(502).json({ error: 'Failed to parse OpenAI response', raw: rawText });
    }

    const objects: DetectedObject[] = (parsed.objects ?? []).map((obj: any) => {
      const type: DetectedObject['type'] = ['table', 'stage', 'bar', 'wall', 'passage', 'other'].includes(obj.type)
        ? (obj.type as DetectedObject['type'])
        : 'other';
      const result: DetectedObject = {
        type,
        centerX: Math.max(0, Math.min(100, Number(obj.centerX) || 50)),
        centerY: Math.max(0, Math.min(100, Number(obj.centerY) || 50)),
        widthPercent: Math.max(2, Math.min(60, Number(obj.widthPercent) || 8)),
        heightPercent: Math.max(2, Math.min(60, Number(obj.heightPercent) || 8)),
        rotation: Number(obj.rotation) || 0,
        shape: obj.shape === 'rect' ? 'rect' : 'circle',
      };
      if (typeof obj.label === 'string' && obj.label) result.label = obj.label;
      if (type === 'table') result.seatsTotal = Math.max(1, Math.min(20, Number(obj.seatsTotal) || 4));
      return result;
    });

    return res.json({ objects });
  } catch (e) {
    console.error('[detect-layout]', e);
    return res.status(500).json({ error: 'Detection failed' });
  }
});

export default router;
