/**
 * Accept a team invite from /start inv_<token>.
 *
 * The link is marked used in the same UPDATE that checks it is still unused and
 * not expired, so two taps on one link cannot both get in.
 */
import { supabase } from '../../supabaseClient';
import { db } from '../../db';
import { addOrganizer } from '../../db-postgres';
import type { TeamInviteRow } from '../../routes/adminInvites';

export type ClaimResult =
  | { ok: true; role: TeamInviteRow['role']; eventTitle: string | null; createdBy: number | null }
  | { ok: false; reason: 'invalid' | 'error' };

export async function claimTeamInvite(
  token: string,
  user: { id: number; platform: 'telegram' | 'vk'; name: string },
): Promise<ClaimResult> {
  if (!supabase || !/^[A-Za-z0-9_-]{8,64}$/.test(token)) return { ok: false, reason: 'invalid' };

  const { data, error } = await supabase
    .from('team_invites')
    .update({ used_at: new Date().toISOString(), used_by: user.id })
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('*')
    .maybeSingle();
  if (error) {
    console.error('[invites] claim failed', error);
    return { ok: false, reason: 'error' };
  }
  if (!data) return { ok: false, reason: 'invalid' };
  const invite = data as TeamInviteRow;
  const label = invite.label || user.name;

  try {
    if (invite.role === 'controller') {
      try {
        await db.addController(user.id, user.platform, label);
      } catch (e: any) {
        // Already a controller: the invite still did what it promised.
        if (e?.code !== '23505') throw e;
      }
    } else {
      if (!invite.event_id) throw new Error('organizer invite without event');
      await addOrganizer(user.id, invite.event_id, user.platform, label);
    }
  } catch (e) {
    console.error('[invites] granting role failed', e);
    // Give the link back so it can be tried again.
    await supabase.from('team_invites').update({ used_at: null, used_by: null }).eq('token', token);
    return { ok: false, reason: 'error' };
  }

  let eventTitle: string | null = null;
  if (invite.event_id) {
    const ev = await db.findEventById(invite.event_id);
    eventTitle = ev?.title ?? null;
  }
  return { ok: true, role: invite.role, eventTitle, createdBy: invite.created_by };
}
