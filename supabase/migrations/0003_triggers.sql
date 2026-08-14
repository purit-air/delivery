-- Supabase migration: triggers and helper functions

-- Trigger to keep updated_at current on shipments
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_shipments_updated_at
  before update on public.shipments
  for each row execute procedure public.set_updated_at();

-- Optionally, triggers could be added to propagate other invariants or audit logs.
