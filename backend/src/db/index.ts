/**
 * Storage: Supabase Postgres only.
 */
import * as postgresDb from '../db-postgres';

console.log('[Storage] Using Supabase Postgres');

export const db = postgresDb;
