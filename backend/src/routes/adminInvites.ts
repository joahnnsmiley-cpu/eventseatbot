/**
 * Team invites.
 *
 * Adding a controller used to mean finding their numeric Telegram ID and typing
 * it in. Now an admin makes a one-time link, sends it, and the person taps it:
 * the bot opens with /start inv_<token> and adds them (see claimTeamInvite in
 * bot.ts). A link works once and for 24 hours.
 */
import { Router, Response } from 'express';
import { randomBytes } from 'crypto';
import { authMiddleware, AuthRequest } from '../auth/auth.middleware';
import { adminOnly } from '../auth/admin.middleware';
import { supabase } from '../supabaseClient';
import { db } from '../db';

const router = Router();
router.use(authMiddleware, adminOnly);

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const INVITE_PREFIX = 'inv_';

export type InviteRole = 'controller' | 'organizer';

export type TeamInviteRow = {
  token: string;
  role: InviteRole;
  event_id: string | null;
  label: string | null;
  created_by: number | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: number | null;
};

let botUsername: string | null = process.env.BOT_USERNAME || null;

/** The bot's @username, asked from Telegram once and remembered. */
async function getBotUsername(): Promise<string | null> {
  if (botUsername) return botUsername;
  try {
    // Imported lazily: bot.ts pulls in the whole bot, routes should not need it at load.
    const { bot } = await import('../bot');
    if (!bot) return null;
    const me = await bot.telegram.getMe();
    botUsername = me.username ?? null;
  } catch (e) {
    console.error('[invites] getMe failed', e);
  }
  return botUsername;
}

function toApi(row: TeamInviteRow, username: string | null) {
  return {
    token: row.token,
    role: row.role,
    eventId: row.event_id,
    label: row.label,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    link: username ? `https://t.me/${username}?start=${INVITE_PREFIX}${row.token}` : null,
  };
}

// POST /admin/invites — { role: 'controller' | 'organizer', eventId?, label? }
router.post('/invites', async (req: AuthRequest, res: Response) => {
  if (!supabase) return res.status(503).json({ error: 'Database is not configured' });
  const role = req.body?.role;
  if (role !== 'controller' && role !== 'organizer') {
    return res.status(400).json({ error: 'role must be controller or organizer' });
  }
  const eventId = typeof req.body?.eventId === 'string' && req.body.eventId.trim() ? req.body.eventId.trim() : null;
  if (role === 'organizer') {
    // An organizer is always an organizer of some event.
    if (!eventId) return res.status(400).json({ error: 'eventId is required for an organizer invite' });
    const ev = await db.findEventById(eventId);
    if (!ev) return res.status(404).json({ error: 'Event not found' });
  }
  const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim().slice(0, 80) : null;
  const createdBy = Number(req.user?.id);

  const username = await getBotUsername();
  if (!username) return res.status(503).json({ error: 'Bot is not available' });

  const row = {
    // 16 url-safe characters: fits Telegram's 64-char /start limit with room to spare.
    token: randomBytes(12).toString('base64url'),
    role,
    event_id: eventId,
    label,
    created_by: Number.isFinite(createdBy) ? createdBy : null,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  };
  const { data, error } = await supabase.from('team_invites').insert(row).select('*').single();
  if (error) {
    console.error('[invites] insert failed', error);
    return res.status(500).json({ error: 'Failed to create invite' });
  }
  return res.status(201).json(toApi(data as TeamInviteRow, username));
});

// GET /admin/invites — links not used and not expired yet
router.get('/invites', async (_req: AuthRequest, res: Response) => {
  if (!supabase) return res.json([]);
  const { data, error } = await supabase
    .from('team_invites')
    .select('*')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Failed to load invites' });
  const username = await getBotUsername();
  return res.json((data ?? []).map((r) => toApi(r as TeamInviteRow, username)));
});

// DELETE /admin/invites/:token — withdraw a link before anyone used it
router.delete('/invites/:token', async (req: AuthRequest, res: Response) => {
  if (!supabase) return res.status(503).json({ error: 'Database is not configured' });
  const { error } = await supabase.from('team_invites').delete().eq('token', req.params.token).is('used_at', null);
  if (error) return res.status(500).json({ error: 'Failed to revoke invite' });
  return res.json({ ok: true });
});

export default router;
