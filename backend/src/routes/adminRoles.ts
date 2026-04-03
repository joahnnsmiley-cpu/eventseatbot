import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import {
  getAppUsers,
  getOrganizers,
  addOrganizer,
  removeOrganizer,
} from '../db-postgres';

const router = Router();
router.use(authMiddleware, adminOnly);

// GET /admin/app-users — list all known users (for picker UI)
router.get('/app-users', async (req, res) => {
  const platform = typeof req.query.platform === 'string' ? req.query.platform : undefined;
  try {
    const users = await getAppUsers(platform);
    res.json(users);
  } catch (err) {
    console.error('[adminRoles] getAppUsers error:', err);
    res.status(500).json({ error: 'Failed to load app users' });
  }
});

// GET /admin/organizers — list all organizer assignments
router.get('/organizers', async (_req, res) => {
  try {
    const organizers = await getOrganizers();
    res.json(organizers);
  } catch (err) {
    console.error('[adminRoles] getOrganizers error:', err);
    res.status(500).json({ error: 'Failed to load organizers' });
  }
});

// POST /admin/organizers — assign a user as organizer for an event
// Body: { userId: number, eventId: string, platform?: string, label?: string }
router.post('/organizers', async (req, res) => {
  const { userId, eventId, platform = 'telegram', label } = req.body;
  if (!userId || !eventId) {
    return res.status(400).json({ error: 'userId and eventId are required' });
  }
  if (!Number.isFinite(Number(userId))) {
    return res.status(400).json({ error: 'userId must be numeric' });
  }
  try {
    await addOrganizer(Number(userId), String(eventId), String(platform), label ?? undefined);
    res.status(201).json({ ok: true });
  } catch (err: any) {
    console.error('[adminRoles] addOrganizer error:', err);
    res.status(500).json({ error: err?.message ?? 'Failed to add organizer' });
  }
});

// DELETE /admin/organizers/:userId/:eventId/:platform — remove organizer assignment
router.delete('/organizers/:userId/:eventId/:platform', async (req, res) => {
  const { userId, eventId, platform } = req.params;
  if (!userId || !eventId || !platform) {
    return res.status(400).json({ error: 'userId, eventId, platform are required' });
  }
  try {
    await removeOrganizer(Number(userId), eventId, platform);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[adminRoles] removeOrganizer error:', err);
    res.status(500).json({ error: err?.message ?? 'Failed to remove organizer' });
  }
});

export default router;
