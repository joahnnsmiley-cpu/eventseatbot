-- venues was created without row level security, so the anon key could read
-- and change saved halls. The backend uses the service role, which bypasses RLS.
alter table public.venues enable row level security;
