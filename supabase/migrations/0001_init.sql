-- Supabase migration: initial schema for delivery tracking app

create extension if not exists citext;
create extension if not exists pgcrypto;

-- Admin profile table to map Supabase Auth users to admin roles.
create table if not exists public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  constraint admin_profiles_user_id_unique unique (user_id),
  constraint admin_profiles_role_check check (role in ('admin'))
);

alter table public.admin_profiles
  add constraint admin_profiles_user_fk foreign key (user_id)
    references auth.users(id) on delete cascade;

-- Shipments table
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_number citext not null unique,
  sender_name text not null,
  receiver_name text not null,
  origin text not null,
  destination text not null,
  status text not null,
  estimated_delivery timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipments_tracking_number_not_empty check (trim(tracking_number) <> ''),
  constraint shipments_status_not_empty check (trim(status) <> '')
);

-- Tracking events table
create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  status text not null,
  location text,
  description text,
  event_time timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint tracking_events_status_not_empty check (trim(status) <> '')
);

alter table public.tracking_events
  add constraint tracking_events_shipment_fk foreign key (shipment_id)
    references public.shipments(id) on delete cascade;

create index if not exists shipments_tracking_number_idx on public.shipments(tracking_number);
create index if not exists tracking_events_shipment_id_idx on public.tracking_events(shipment_id);
create index if not exists tracking_events_event_time_idx on public.tracking_events(event_time desc);

-- Helper function to determine admin membership.
create or replace function public.is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid()
  );
$$;

-- Public tracking RPC returns shipment and event timeline as JSON.
create or replace function public.get_public_tracking(tracking_number text)
returns jsonb language sql stable security definer as $$
  select jsonb_build_object(
    'shipment', jsonb_build_object(
      'id', s.id,
      'tracking_number', s.tracking_number,
      'sender_name', s.sender_name,
      'receiver_name', s.receiver_name,
      'origin', s.origin,
      'destination', s.destination,
      'status', s.status,
      'estimated_delivery', s.estimated_delivery,
      'created_at', s.created_at,
      'updated_at', s.updated_at
    ),
    'events', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', te.id,
          'status', te.status,
          'location', te.location,
          'description', te.description,
          'event_time', te.event_time,
          'created_at', te.created_at
        ) order by te.event_time asc), '[]'::jsonb)
  )
  from public.shipments s
  left join public.tracking_events te on te.shipment_id = s.id
  where s.tracking_number = tracking_number
  group by s.id;
$$;

-- Admin RPC for creating a shipment with initial event.
create or replace function public.admin_create_shipment(
  tracking_number text,
  sender_name text,
  receiver_name text,
  origin text,
  destination text,
  status text,
  estimated_delivery timestamptz default null,
  event_location text default null,
  event_description text default null,
  event_time timestamptz default now()
) returns public.shipments language plpgsql security definer as $$
declare
  shipment public.shipments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'permission denied';
  end if;

  insert into public.shipments (
    tracking_number, sender_name, receiver_name, origin, destination, status, estimated_delivery, created_at, updated_at
  ) values (
    tracking_number, sender_name, receiver_name, origin, destination, status, estimated_delivery, now(), now()
  ) returning * into shipment;

  insert into public.tracking_events (
    shipment_id, status, location, description, event_time, created_at
  ) values (
    shipment.id, status, event_location, event_description, event_time, now()
  );

  return shipment;
end;
$$;

-- Admin RPC for updating a shipment and optionally appending a tracking event.
create or replace function public.admin_update_shipment(
  shipment_id uuid,
  sender_name text,
  receiver_name text,
  origin text,
  destination text,
  status text,
  estimated_delivery timestamptz default null,
  event_status text default null,
  event_location text default null,
  event_description text default null,
  event_time timestamptz default now()
) returns public.shipments language plpgsql security definer as $$
declare
  shipment public.shipments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'permission denied';
  end if;

  update public.shipments
    set sender_name = sender_name,
        receiver_name = receiver_name,
        origin = origin,
        destination = destination,
        status = status,
        estimated_delivery = estimated_delivery,
        updated_at = now()
   where id = shipment_id
   returning * into shipment;

  if not found then
    raise exception 'shipment not found';
  end if;

  if event_status is not null then
    insert into public.tracking_events (
      shipment_id, status, location, description, event_time, created_at
    ) values (
      shipment_id, event_status, event_location, event_description, event_time, now()
    );
  end if;

  return shipment;
end;
$$;

-- Admin RPC for deleting a shipment.
create or replace function public.admin_delete_shipment(shipment_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_admin() then
    raise exception 'permission denied';
  end if;

  delete from public.shipments where id = shipment_id;
end;
$$;
