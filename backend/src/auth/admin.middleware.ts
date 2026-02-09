import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export function adminOnly(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const adminIds = (process.env.ADMINS_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const userId = typeof req.user?.id === 'string' || typeof req.user?.id === 'number'
    ? String(req.user?.id)
    : '';

  const isAdminByList = adminIds.length > 0
    ? adminIds.includes(userId)
    : req.user?.role === 'admin';

  if (!isAdminByList) {
    return res.status(403).json({ error: 'Admin only' });
  }

  next();
}
