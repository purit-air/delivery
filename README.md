# Delivio Delivery Tracking App

[![Smoke Tests](https://github.com/<OWNER>/<REPO>/actions/workflows/smoke_test.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/smoke_test.yml)

This repository contains a migrated delivery tracking application that has been converted from Firebase to Supabase.

## Project structure
- `customer/` — public package tracking app
- `admin/` — admin shipment management app
- `supabase/` — database migrations and Supabase CLI configuration
- `FINAL_VERIFICATION.md` — final migration verification checklist
- `MIGRATION_PLAN.md` — migration summary, architecture, and phase notes
- `DELIVERY_SUMMARY.md` — final delivery report

## Supabase architecture
- `customer/js/supabase.js` uses the Supabase anon key for read-only access.
- `customer/js/track.js` calls `public.get_public_tracking` to load shipment status and timeline.
- `admin/js/supabase.js` uses the Supabase anon key; admin auth and RLS enforce access.
- `admin/js/auth.js` handles admin login and sign-out via Supabase Auth.
- `admin/js/dashboard.js` uses RPCs for create/update/delete operations and admin session validation.
- Database schema is defined in `supabase/migrations` with RLS and admin profile mapping.

## Deployment
1. Authenticate the Supabase CLI:
   ```bash
   supabase login
   ```
2. Link or verify the project ref:
   ```bash
   supabase link --project-ref <project-ref>
   ```
3. Push the database migrations from the repo root:
   ```bash
   supabase db push
   ```
4. Deploy the static `customer/` and `admin/` folders to your hosting provider.

## Verification
- Run the checklist in `FINAL_VERIFICATION.md`.
- Confirm admin users are created in Supabase Auth and have entries in `public.admin_profiles`.
- Confirm the customer app only uses `public.get_public_tracking` and never exposes a service role key.

## Notes
- `admin/` and `customer/` are separate static frontends for security and separation of concerns.
- No custom backend is included in this repo; the app uses Supabase Auth, RPCs, and RLS directly from the browser.
