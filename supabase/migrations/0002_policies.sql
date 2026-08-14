-- Supabase migration: Row Level Security (RLS) policies

-- Enable RLS on tables
alter table public.shipments enable row level security;
alter table public.tracking_events enable row level security;
alter table public.admin_profiles enable row level security;

-- Policy: allow full access to admins (checks public.is_admin())
create policy shipments_admin_full on public.shipments
  for all
  using ( public.is_admin() )
  with check ( public.is_admin() );

create policy tracking_events_admin_full on public.tracking_events
  for all
  using ( public.is_admin() )
  with check ( public.is_admin() );

create policy admin_profiles_admin_manage on public.admin_profiles
  for insert, update, delete
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- Notes:
-- The public-facing tracking endpoint should use the RPC "public.get_public_tracking"
-- which is created as SECURITY DEFINER and therefore can bypass RLS to return
-- controlled tracking information. Do NOT grant open SELECT access to the
-- shipments or tracking_events tables.
