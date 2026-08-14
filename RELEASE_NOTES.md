# Release Notes — Supabase Migration

Release date: 2026-08-12

## Overview
This release migrates the Delivio delivery tracking app from Firebase to Supabase. It separates the public customer app from the admin app, introduces a normalized Postgres schema, and enforces access control with RLS and RPCs.

## Highlights
- Added `shipments`, `tracking_events`, and `admin_profiles` tables.
- Implemented RLS policies and admin-only RPCs for create/update/delete.
- Customer app uses `public.get_public_tracking` RPC for read-only access.
- Admin app uses Supabase Auth and checks `public.admin_profiles` for role verification.
- Legacy Firebase client files removed from active app code.
- Automated smoke test and CI workflow added to validate `get_public_tracking` RPC.

## Notes for operators
- Execute `supabase db push` to apply migrations.
- Add admin users in Supabase Auth and insert matching rows in `public.admin_profiles`.
- Configure CI secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## Contact
For follow-up changes or rollbacks, contact the maintainer or open an issue in the repository.
