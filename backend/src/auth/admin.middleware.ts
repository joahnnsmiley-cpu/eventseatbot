import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export function adminOnly(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const telegramAdmins = (process.env.ADMINS_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const vkAdmins = (process.env.VK_ADMINS_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const adminIds = [...telegramAdmins, ...vkAdmins];

  const userId = typeof req.user?.id === 'string' || typeof req.user?.id === 'number'
    ? String(req.user?.id)
    : '';

  if (adminIds.length === 0) {
    return res.status(403).json({ error: 'Forbidden: no admin list configured' });
  }
  const isAdminByList = adminIds.includes(userId);

  if (!isAdminByList) {
    return res.status(403).json({ error: 'Admin only' });
  }

  next();
}
