/**
 * Current user from Telegram WebApp and auth.
 * Role: organizer = user can manage events; guest = regular user.
 * - Admin (ADMINS_IDS in env) → always organizer, can access any event.
 * - Event organizer (organizer_id in DB) → organizer for that event.
 */

export type CurrentUser = {
  id: number | null;
  role: 'guest' | 'organizer' | null;
};

type TgUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

/**
 * Resolve current user from Telegram initData and auth state.
 * @param tgUser - From window.Telegram?.WebApp?.initDataUnsafe?.user
 * @param isAdmin - From JWT payload (user in admins list)
 * @param event - Optional event for per-event organizer check (when event.organizerId exists)
 */
export function getCurrentUser(
  tgUser: TgUser | null,
  isAdmin: boolean,
  event?: { organizerId?: string | number | null } | null
): CurrentUser {
  const id = typeof tgUser?.id === 'number' ? tgUser.id : null;

  // Admin (ADMINS_IDS) → always organizer, can manage any event
  if (isAdmin) return { id, role: 'organizer' };

  // Per-event: user is organizer if their id matches event.organizer_id
  const organizerId = event?.organizerId;
  if (id != null && organizerId != null) {
    const match = String(id) === String(organizerId);
    return { id, role: match ? 'organizer' : 'guest' };
  }

  return { id, role: 'guest' };
}
