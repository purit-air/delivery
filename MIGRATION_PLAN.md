# Migration Plan

## Current Application Overview

- Customer web: `customer/index.html`, `customer/track.html`, `customer/css/style.css`, `customer/js/track.js`
- Admin web: `admin/login.html`, `admin/dashboard.html`, `admin/create.html`, `admin/edit.html`, `admin/js/auth.js`, `admin/js/dashboard.js`
- Backend: None in repository. Uses Supabase Auth and Postgres directly from browser with no custom backend.
- Database model: normalized `shipments` and `tracking_events` tables, plus `admin_profiles` for admin role mapping.

## Legacy Firebase cleanup

- Removed legacy Firebase browser client files from the root app and admin folder.
- Root `index.html` now redirects to `customer/index.html`.
- Root `track.html` redirects to `customer/track.html`.

## Current data model mapping

### Firestore `PARCELS`
- trackingId -> `tracking_number`
- senderName -> `sender_name`
- receiverName -> `receiver_name`
- origin -> `origin`
- destination -> `destination`
- currentStatus -> `status`
- createdAt -> `created_at`
- updatedAt -> `updated_at`
- history[] -> `tracking_events`

### Tracking event model
- Free-form history entry with `status` and `timestamp`
- No explicit location or description
- Current status can diverge from history

## Migration architecture

### Customer web must become independent static app
- Public pages: `customer/index.html`, `customer/track.html`
- Only Supabase anon client usage
- No admin auth or write operations
- Query `get_public_shipment` RPC by tracking number
- Render shipment details and timeline

### Admin web must become independent static app
- Pages: `admin/index.html` (login), dashboard, create, edit
- Uses Supabase Auth and explicit admin role mapping
- CRUD operations against `shipments` and `tracking_events`
- Status updates via RPC to preserve consistency

## Proposed PostgreSQL schema

### shipments
- id uuid primary key default gen_random_uuid()
- tracking_number citext not null unique
- sender_name text not null
- receiver_name text not null
- origin text not null
- destination text not null
- status text not null
- estimated_delivery timestamptz null
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

### tracking_events
- id uuid primary key default gen_random_uuid()
- shipment_id uuid not null references shipments(id) on delete cascade
- status text not null
- location text null
- description text null
- event_time timestamptz not null default now()
- created_at timestamptz not null default now()

### admin_profiles
- id uuid primary key default gen_random_uuid()
- user_id uuid not null references auth.users(id) on delete cascade
- role text not null default 'admin'
- created_at timestamptz not null default now()
- unique (user_id)

## Supabase security design

- Enable RLS on shipments and tracking_events
- Admin policies based on `admin_profiles`
- Public tracking access through a controlled RPC `get_public_shipment`
- No public insert/update/delete on shipments or tracking_events
- No service_role exposure in frontend

## Next steps

1. Fix directory structure to separate customer and admin apps
2. Design migration SQL in `supabase/migrations`
3. Create Supabase client wrappers for customer and admin
4. Migrate customer frontend to Supabase find-by-tracking RPC
5. Migrate admin auth and shipment CRUD to Supabase
6. Add Supabase role checks and admin-specific functions
7. Fix dashboard search, validation, and error handling
8. Keep Firebase code until Supabase is verified

## Phase 15 — Final verification

- Confirm Supabase CLI auth and schema deployment from the project root (`supabase login`, `supabase db push`)
- Verify admin users exist in Supabase Auth and are mapped in `public.admin_profiles`
- Confirm the customer app uses `customer/track.html` with `public.get_public_tracking`
- Confirm the admin app authenticates via `admin/login.html`, creates shipments, updates status, and deletes shipments with RPCs
- Confirm public site never exposes service-role credentials or direct table access
- Add delivery and verification documentation in `README.md` and `FINAL_VERIFICATION.md`

## Phase 16 — Documentation and delivery

- Created top-level `README.md` with project overview, structure, Supabase deployment, and verification notes
- Added `admin/README.md` describing the admin app, auth flow, and Supabase RPC usage
- Confirmed customer and admin docs exist and the migration plan reflects final completion
