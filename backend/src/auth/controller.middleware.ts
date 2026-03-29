import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

/**
 * controllerOrAdmin — allows users who are either:
 * - an admin (in ADMINS_IDS / VK_ADMINS_IDS or role='admin' in JWT)
 * - or a controller (isController=true in JWT)
 */
export function controllerOrAdmin(
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

  const isAdminByList = adminIds.length > 0
    ? adminIds.includes(userId)
    : req.user?.role === 'admin';

  const isControllerByToken = (req.user as any)?.isController === true;

  if (!isAdminByList && !isControllerByToken) {
    return res.status(403).json({ error: 'Controller or admin access required' });
  }

  next();
}
