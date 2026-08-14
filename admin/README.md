# Admin App

This folder contains the admin interface for the Delivio delivery tracking app.

## Pages
- `admin/login.html` — Supabase Auth login page for admin users.
- `admin/dashboard.html` — Shipment list and management dashboard.
- `admin/create.html` — Create a new shipment.
- `admin/edit.html` — Edit existing shipment details and add history.

## Supabase
- `admin/js/supabase.js` initializes the Supabase client with the anon key.
- `admin/js/auth.js` signs in admin users and redirects to the dashboard.
- `admin/js/dashboard.js` validates admin membership, loads shipments, and performs create/update/delete operations through RPCs.

## Security
- Admin access is enforced by `public.admin_profiles` and RLS policies.
- Admin RPCs are defined as `SECURITY DEFINER` in `supabase/migrations/0001_init.sql`.
- Admin users must exist in Supabase Auth and have a matching `public.admin_profiles.user_id` entry.

## Deployment
- Deploy `admin/` as a static site.
- Ensure `admin/js/supabase.js` contains the correct Supabase project URL and anon key.
- Do not use a service-role key in frontend code.
