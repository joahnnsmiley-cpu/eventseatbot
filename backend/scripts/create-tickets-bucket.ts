/**
 * Create Supabase storage bucket "tickets" if it does not exist.
 * - Public read access for ticket images
 *
 * Run from backend: npx ts-node scripts/create-tickets-bucket.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'tickets';

const url = process.env.SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function main() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error('[Storage] Error listing buckets:', listError.message);
    process.exit(1);
  }

  const exists = (buckets ?? []).some((b) => b.name === BUCKET_NAME);

  if (exists) {
    console.log(`[Storage] Bucket "${BUCKET_NAME}" already exists.`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });

  if (createError) {
    console.error('[Storage] Failed to create bucket:', createError.message);
    process.exit(1);
  }

  console.log(`[Storage] Bucket "${BUCKET_NAME}" created with public read access.`);
}

main();
