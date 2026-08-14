-- Allow users to read their own admin_profiles row (so they can verify admin role)

-- Revoke broad policy if exists? We'll add a specific SELECT policy.
create policy admin_profiles_select_own on public.admin_profiles
  for select
  using ( user_id = auth.uid() );

-- Note: Admin maintenance (creating admin_profiles) should be performed by a supabase project admin
-- through the dashboard or via a separate migration script. This policy allows a logged-in user to
-- read their own profile row so frontend can detect admin membership.
