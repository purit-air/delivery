# Customer App

This application is a public static site that allows customers to look up shipment status by tracking number.

## Architecture
- `customer/index.html` — landing page with quick tracking input
- `customer/track.html` — shipment lookup page
- `customer/css/style.css` — shared UI styling
- `customer/js/supabase.js` — Supabase anon client setup
- `customer/js/track.js` — tracking lookup logic

## Supabase
- Uses the Supabase anon key only.
- Calls the PostgreSQL RPC `get_public_tracking` to fetch shipment data.
- Does not insert, update, or delete shipment or event data.
- Does not access admin pages or admin-only endpoints.

## Deployment
- Deploy this folder as a static site.
- Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `customer/js/supabase.js` before deployment.
- Do not expose any Supabase service-role key.
