/**
 * Supabase client — future production storage.
 * Initialized from env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Not used for reads/writes yet; data.json remains the source of truth.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const supabase: SupabaseClient | null =
  url && serviceRoleKey
    ? createClient(url, serviceRoleKey, { auth: { persistSession: false } })
    : null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && serviceRoleKey);
}
