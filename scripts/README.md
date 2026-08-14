Smoke test for Supabase RPC

Requirements:
- Node 18+ (fetch available globally) or run with a fetch polyfill

Usage:

```bash
# quick run using embedded anon key (not recommended for production)
node scripts/smoke_test.js

# recommended: provide env vars
SUPABASE_URL=https://<project>.supabase.co SUPABASE_ANON_KEY=<anon_key> TRACKING_NUMBER=TRE-2026-0001-0001 node scripts/smoke_test.js
```

Expected result:
- HTTP 200 and a JSON payload with `shipment` and `events` keys (or 200 + null shipment when not found)
- Non-2xx responses indicate misconfigured RLS or wrong anon key

CI integration
---------------

This repository includes a GitHub Actions workflow that runs the smoke test on push and pull requests.
The workflow expects two repository secrets to be set:

- `SUPABASE_URL` — your Supabase project URL (e.g. `https://<project>.supabase.co`)
- `SUPABASE_ANON_KEY` — the Supabase anon/public API key

To enable CI:

1. Go to your GitHub repo Settings → Secrets → Actions and add the two secrets above.
2. Push a change to `main`/`master` or open a PR — the workflow `.github/workflows/smoke_test.yml` will run automatically.

The CI job runs `node scripts/smoke_test.js` and will fail if the RPC returns a non-2xx response.
