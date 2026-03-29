import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import { db } from '../db';

const router = Router();
router.use(authMiddleware, adminOnly);

// GET /admin/controllers — list all controllers
router.get('/controllers', async (_req, res) => {
  try {
    const controllers = await db.getControllers();
    res.json(controllers);
  } catch (err) {
    console.error('[adminControllers] getControllers error:', err);
    res.status(500).json({ error: 'Failed to load controllers' });
  }
});

// POST /admin/controllers — add a controller
// Body: { id: number, platform?: 'telegram' | 'vk', label?: string }
router.post('/controllers', async (req, res) => {
  const { id, platform = 'telegram', label } = req.body;
  if (!id || !Number.isFinite(Number(id))) {
    return res.status(400).json({ error: 'id (numeric user ID) is required' });
  }
  try {
    await db.addController(Number(id), platform, label);
    res.status(201).json({ ok: true });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Controller already exists' });
    }
    console.error('[adminControllers] addController error:', err);
    res.status(500).json({ error: 'Failed to add controller' });
  }
});

// DELETE /admin/controllers/:id — remove a controller
router.delete('/controllers/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    await db.removeController(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[adminControllers] removeController error:', err);
    res.status(500).json({ error: 'Failed to remove controller' });
  }
});

export default router;
