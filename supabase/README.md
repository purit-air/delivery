Supabase migration instructions

This folder contains SQL migrations to initialize the PostgreSQL schema for the delivery app.

Prerequisites
- A Supabase project
- `supabase` CLI installed and authenticated (https://supabase.com/docs/guides/cli)

Applying migrations
1. Initialize a local supabase project or point to your project.

To run migrations against a Supabase project, you can use the Supabase CLI:

```bash
# login (if needed)
supabase login

# link project (optional) or set environment variables
supabase link --project-ref <project-ref>

# apply migrations (from repo root)
supabase db push
```

Alternatively, you can apply the SQL files manually in the Supabase SQL editor in the dashboard.

Important notes
- The RPC functions `public.get_public_tracking`, `public.admin_create_shipment`,
  `public.admin_update_shipment`, and `public.admin_delete_shipment` are created with
  `SECURITY DEFINER` in `0001_init.sql` and will run with the creation user's privileges.
  Ensure you manage who can call admin RPCs via Supabase Auth and RLS policies.
- Do not expose the Supabase service role key in frontend code. Use the anon key only.
- After applying migrations, create admin users in Supabase Auth and add entries
  to `public.admin_profiles` mapping `auth.users.id` to an admin role.
