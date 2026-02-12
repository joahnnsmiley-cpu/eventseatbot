import { Router, Request, Response } from 'express';
import multer from 'multer';
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

router.use(authMiddleware, adminOnly);

router.post('/upload-layout', upload.single('file'), async (req: Request, res: Response) => {
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
      .select('id, layout_image_path, layout_image_version')
      .eq('id', eventId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[admin.uploadLayout] fetch event', fetchErr);
      return res.status(500).json({ error: 'Failed to fetch event' });
    }

    if (!eventRow) return res.status(404).json({ error: 'Event not found' });

    const currentPath = eventRow.layout_image_path ?? null;
    const prevVersion = Number(eventRow.layout_image_version) || 0;

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
      })
      .eq('id', eventId);

    if (updateErr) {
      console.error('[admin.uploadLayout] update event', updateErr);
      return res.status(500).json({ error: 'Failed to update event' });
    }

    return res.json({ url: publicUrl, version: newVersion });
  } catch (e) {
    console.error('[admin.uploadLayout]', e);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
