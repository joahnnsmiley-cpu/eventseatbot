/**
 * Identity for the /public booking routes.
 *
 * authMiddleware waves through everything under /public, which is right for
 * reading the poster and the hall, but wrong for anything about a person's own
 * booking. This one always verifies the token and answers the only question
 * those routes need: who is asking.
 */
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, UserPayload } from './auth.middleware';

export type Identity = {
  id: number;
  platform: 'telegram' | 'vk';
  telegramId: number | null;
  vkUserId: number | null;
};

export function requireUser(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const parts = typeof header === 'string' ? header.split(' ') : [];
  const token = parts.length === 2 && parts[0]?.toLowerCase() === 'bearer' ? parts[1] : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[AUTH] JWT_SECRET not configured');
    return res.status(500).json({ error: 'JWT_SECRET not configured' });
  }
  try {
    req.user = jwt.verify(token, secret) as UserPayload;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!identityOf(req)) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}

/** Who the caller is — from the signed token, never from the request body. */
export function identityOf(req: AuthRequest): Identity | null {
  const user = req.user;
  const id = Number(user?.id ?? user?.sub ?? user?.userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const platform = user?.platform === 'vk' ? 'vk' : 'telegram';
  return {
    id,
    platform,
    telegramId: platform === 'telegram' ? id : null,
    vkUserId: platform === 'vk' ? id : null,
  };
}

/** Does this booking belong to the caller? Admins may act on any booking. */
export function ownsBooking(req: AuthRequest, booking: { userTelegramId?: number | null; user_vk_id?: number | string | null; userVkId?: number | string | null }): boolean {
  const me = identityOf(req);
  if (!me) return false;
  if (req.user?.role === 'admin') return true;
  const vk = booking.user_vk_id ?? booking.userVkId ?? null;
  if (me.platform === 'vk') return vk != null && Number(vk) === me.id;
  return booking.userTelegramId != null && Number(booking.userTelegramId) === me.id;
}
