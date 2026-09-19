-- One-time links that add a person to the team (controller or organizer).
-- Read and written only by the backend with the service role; RLS is on with
-- no policies, so the anon key sees nothing.
create table if not exists public.team_invites (
  token       text primary key,
  role        text not null check (role in ('controller', 'organizer')),
  event_id    text references public.events(id) on delete cascade,
  label       text,
  created_by  bigint,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     bigint,
  constraint organizer_needs_event check (role <> 'organizer' or event_id is not null)
);
alter table public.team_invites enable row level security;
comment on table public.team_invites is 'One-time team invite links: t.me/<bot>?start=inv_<token>';
