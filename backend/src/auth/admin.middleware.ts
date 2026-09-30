import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { getOrganizerEventIds } from '../db-postgres';

/**
 * Middleware factory: allows admins OR organizers assigned to the event in question.
 * `getEventId` extracts the event ID from the request (params, query, body).
 */
export function organizerForEvent(getEventId: (req: AuthRequest) => string | undefined) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const telegramAdmins = (process.env.ADMINS_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const vkAdmins = (process.env.VK_ADMINS_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const adminIds = [...telegramAdmins, ...vkAdmins];
    const userId = String(req.user?.id ?? '');

    if (adminIds.includes(userId)) return next();
    if ((req.user as any)?.role === 'admin') return next();

    const eventId = getEventId(req);
    const orgIds: string[] = (req.user as any)?.organizerEventIds ?? [];
    if (eventId && orgIds.includes(eventId)) return next();

    return res.status(403).json({ error: 'Forbidden' });
  };
}

/**
 * Allows full admins OR any authenticated user who is an organizer for at least one event.
 * Used on endpoints that organizers need to access (event list, bookings, etc.).
 * Falls back to a DB check when the JWT is stale (user was assigned organizer after last login).
 */
export function adminOrOrganizer(
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

  if (adminIds.includes(userId)) return next();
  if ((req.user as any)?.role === 'admin') return next();

  // Fast path: organizerEventIds already in JWT
  const orgIds: string[] = (req.user as any)?.organizerEventIds ?? [];
  if (orgIds.length > 0) return next();

  // Slow path: JWT may be stale (organizer assigned after last login) — check DB
  if (!userId) return res.status(403).json({ error: 'Forbidden' });
  getOrganizerEventIds(userId)
    .then((ids) => {
      if (ids.length > 0) return next();
      return res.status(403).json({ error: 'Forbidden' });
    })
    .catch(() => res.status(403).json({ error: 'Forbidden' }));
}

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
  // Also allow JWT with explicit role='admin' (e.g. web admin login)
  const isAdminByRole = (req.user as any)?.role === 'admin';

  if (!isAdminByList && !isAdminByRole) {
    return res.status(403).json({ error: 'Admin only' });
  }

  next();
}

/**
 * Что этому человеку вообще позволено видеть.
 *
 * Здесь была дыра по смыслу, а не по коду: adminOrOrganizer пропускает любого,
 * кто организатор хотя бы одного события, и дальше ручки отдавали всё подряд.
 * То есть организатор одного концерта видел брони и телефоны гостей всех
 * остальных и мог подтвердить чужую оплату. Пока организаторов двое и оба свои,
 * это не стреляло; с первым же приглашённым со стороны выстрелит.
 *
 * Полный администратор видит всё — у него eventIds пустой и isAdmin = true.
 * Организатор видит только свои события.
 */
export type AdminScope = { isAdmin: boolean; eventIds: string[] };

export async function scopeOf(req: AuthRequest): Promise<AdminScope> {
  const telegramAdmins = (process.env.ADMINS_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const vkAdmins = (process.env.VK_ADMINS_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const userId = String(req.user?.id ?? '');

  if ([...telegramAdmins, ...vkAdmins].includes(userId)) return { isAdmin: true, eventIds: [] };
  if ((req.user as { role?: string })?.role === 'admin') return { isAdmin: true, eventIds: [] };

  // Список из токена может отстать: организатора могли назначить после входа.
  const fromToken: string[] = (req.user as { organizerEventIds?: string[] })?.organizerEventIds ?? [];
  if (fromToken.length > 0) return { isAdmin: false, eventIds: fromToken.map(String) };
  if (!userId) return { isAdmin: false, eventIds: [] };
  const fromDb = await getOrganizerEventIds(userId).catch(() => [] as string[]);
  return { isAdmin: false, eventIds: fromDb.map(String) };
}

/** Можно ли этому человеку трогать именно это событие. */
export function mayTouchEvent(scope: AdminScope, eventId: string | null | undefined): boolean {
  if (scope.isAdmin) return true;
  return Boolean(eventId) && scope.eventIds.includes(String(eventId));
}
