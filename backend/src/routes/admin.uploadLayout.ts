import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import { supabase } from '../supabaseClient';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
});

/** Extract filename from path (e.g. "events/ev1/v1-123.png" → "v1-123.png") */
function basename(path: string): string {
  if (!path || typeof path !== 'string') return 'layout';
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'layout';
}

const router = Router();

router.post('/upload-layout', authMiddleware, adminOnly, upload.single('file'), async (req: Request, res: Response) => {
  if (!supabase) return res.status(503).json({ error: 'Storage not configured' });

  const file = (req as any).file;
  if (!file || !file.buffer) return res.status(400).json({ error: 'No file uploaded' });

  const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : '';
  if (!eventId) return res.status(400).json({ error: 'eventId is required' });

  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return res.status(400).json({ error: 'Invalid file type. Use PNG, JPG, JPEG, or WebP.' });
  }

  const ext = file.mimetype === 'image/png' ? 'png'
    : file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg' ? 'jpg'
    : 'webp';

  try {
    const { data: eventRow, error: fetchErr } = await supabase
      .from('events')
      .select('id, layout_image_path, layout_image_version, layout_width, layout_height')
      .eq('id', eventId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[admin.uploadLayout] fetch event', fetchErr);
      return res.status(500).json({ error: 'Failed to fetch event' });
    }

    if (!eventRow) return res.status(404).json({ error: 'Event not found' });

    const currentPath = eventRow.layout_image_path ?? null;
    const prevVersion = Number(eventRow.layout_image_version) || 0;

    // Table coordinates are percentages of the layout image. Nothing used to
    // record which image they were measured against, so replacing a plan with
    // one of different proportions silently moved every table. Measure the new
    // one and compare with what the tables were drawn on.
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(file.buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch (e) {
      console.error('[admin.uploadLayout] could not read image size', e);
    }

    const prevWidth = Number(eventRow.layout_width) || null;
    const prevHeight = Number(eventRow.layout_height) || null;
    const prevRatio = prevWidth && prevHeight ? prevWidth / prevHeight : null;
    const nextRatio = width && height ? width / height : null;
    // 1% is below what anyone notices; beyond that tables visibly drift.
    const aspectChanged =
      prevRatio !== null && nextRatio !== null
        ? Math.abs(prevRatio - nextRatio) / prevRatio > 0.01
        : false;

    if (currentPath) {
      const { count, error: countErr } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('layout_image_path', currentPath)
        .neq('id', eventId);

      if (countErr) {
        console.error('[admin.uploadLayout] count shared', countErr);
        return res.status(500).json({ error: 'Failed to check shared layout' });
      }

      const otherCount = count ?? 0;
      if (otherCount === 0) {
        const archivePath = `archive/${Date.now()}-${basename(currentPath)}`;
        const { error: moveErr } = await supabase.storage
          .from('layouts')
          .move(currentPath, archivePath);

        if (moveErr) {
          console.error('[admin.uploadLayout] move to archive', moveErr);
        }
      }
    }

    const newVersion = prevVersion + 1;
    const timestamp = Date.now();
    const newPath = `events/${eventId}/v${newVersion}-${timestamp}.${ext}`;

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('layouts')
      .upload(newPath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadErr) {
      console.error('[admin.uploadLayout] upload', uploadErr);
      return res.status(500).json({ error: uploadErr.message });
    }

    const { data: urlData } = supabase.storage.from('layouts').getPublicUrl(uploadData.path);
    const publicUrl = urlData.publicUrl;

    const { error: updateErr } = await supabase
      .from('events')
      .update({
        layout_image_url: publicUrl,
        layout_image_path: newPath,
        layout_image_version: newVersion,
        layout_width: width,
        layout_height: height,
      })
      .eq('id', eventId);

    if (updateErr) {
      console.error('[admin.uploadLayout] update event', updateErr);
      return res.status(500).json({ error: 'Failed to update event' });
    }

    return res.json({
      url: publicUrl,
      version: newVersion,
      width,
      height,
      // The caller decides what to tell the admin; the tables are left alone
      // either way — silently moving someone's seating plan is worse than
      // asking them to look at it.
      aspectChanged,
      previousWidth: prevWidth,
      previousHeight: prevHeight,
    });
  } catch (e) {
    console.error('[admin.uploadLayout]', e);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
