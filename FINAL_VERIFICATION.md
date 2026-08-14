# Final Verification Checklist

## Supabase deployment
- [ ] Run `supabase login` and confirm authentication succeeds.
- [ ] Run `supabase db push` from the repo root and verify migrations succeed.
- [ ] Confirm `supabase/migrations/0001_init.sql`, `0002_policies.sql`, `0003_triggers.sql`, and `0004_admin_profile_select.sql` are applied.

## Admin application verification
- [ ] Log in at `admin/login.html` with a Supabase Auth admin user.
- [ ] Confirm `admin/dashboard.html` loads after login.
- [ ] Create a new shipment from `admin/create.html` and verify it appears in the dashboard.
- [ ] Edit shipment details and add a history entry from `admin/edit.html`.
- [ ] Delete a shipment and confirm it is removed from the admin dashboard.
- [ ] Confirm admin user access is only allowed when `public.admin_profiles` contains their `auth.users.id`.

## Customer application verification
- [ ] Visit `customer/index.html` and enter a valid tracking ID.
- [ ] Confirm tracking results are returned from `customer/js/track.js` via `public.get_public_tracking`.
- [ ] Confirm invalid tracking IDs return a user-friendly error.
- [ ] Confirm public customer pages do not require login.

## Security verification
- [ ] Confirm no Firebase JS is present in the active customer/admin apps.
- [ ] Confirm no service-role key is stored in frontend code.
- [ ] Confirm RLS is enabled on `public.shipments` and `public.tracking_events`.
- [ ] Confirm `admin_profiles` write policies require `public.is_admin()` and select policy is limited to `user_id = auth.uid()`.

## Documentation
- [ ] Update `supabase/README.md` with any deployment-specific notes.
- [ ] Confirm `MIGRATION_PLAN.md` and `FINAL_VERIFICATION.md` reflect the current app structure.
