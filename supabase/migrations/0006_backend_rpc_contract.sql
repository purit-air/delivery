BEGIN;

-- Phase 2: secure, server-side RPC contract for tracking, shipment status, and admin CRUD.
-- Keep compatibility with existing frontend call shapes while enforcing the approved contract.

CREATE OR REPLACE FUNCTION public.normalize_tracking_number(input_tracking_number text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp AS $$
  SELECT upper(trim(input_tracking_number));
$$;

CREATE OR REPLACE FUNCTION public.is_valid_tracking_number(input_tracking_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp AS $$
  SELECT input_tracking_number IS NOT NULL
    AND trim(input_tracking_number) <> ''
    AND input_tracking_number ~ '^[A-Z]{3}-[0-9]{4}-[0-9]{4}-[0-9]{4}$';
$$;

CREATE OR REPLACE FUNCTION public.normalize_shipment_status(input_status text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN input_status IS NULL THEN NULL
    WHEN lower(trim(input_status)) IN ('shipment created', 'shipment_created') THEN 'shipment_created'
    WHEN lower(trim(input_status)) IN ('picked up', 'picked_up') THEN 'picked_up'
    WHEN lower(trim(input_status)) IN ('in transit', 'in_transit') THEN 'in_transit'
    WHEN lower(trim(input_status)) IN ('out for delivery', 'out_for_delivery') THEN 'out_for_delivery'
    WHEN lower(trim(input_status)) IN ('delivered', 'delivery complete') THEN 'delivered'
    WHEN lower(trim(input_status)) IN ('exception', 'exceptions') THEN 'exception'
    WHEN lower(trim(input_status)) IN ('cancelled', 'canceled', 'cancelled shipment') THEN 'cancelled'
    WHEN lower(trim(input_status)) = 'pending' THEN 'shipment_created'
    ELSE lower(replace(trim(input_status), ' ', '_'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_shipment_status(input_status text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp AS $$
  SELECT input_status IN (
    'shipment_created',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'exception',
    'cancelled'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_public_tracking(tracking_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  normalized_tracking text;
  result jsonb;
BEGIN
  normalized_tracking := public.normalize_tracking_number(tracking_number);

  IF normalized_tracking IS NULL OR normalized_tracking = '' OR NOT public.is_valid_tracking_number(normalized_tracking) THEN
    RETURN jsonb_build_object(
      'shipment', NULL,
      'events', '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
    'shipment', jsonb_build_object(
      'id', s.id,
      'tracking_number', s.tracking_number,
      'sender_name', s.sender_name,
      'receiver_name', coalesce(s.recipient_name, s.receiver_name),
      'origin', s.origin,
      'destination', s.destination,
      'status', s.status,
      'estimated_delivery', s.estimated_delivery,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'carrier', s.carrier,
      'service', s.service,
      'shipment_date', s.shipment_date,
      'actual_delivery', s.actual_delivery
    ),
    'events', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', te.id,
            'status', te.status,
            'location', te.location,
            'description', te.description,
            'event_time', te.event_time,
            'created_at', te.created_at
          ) ORDER BY te.event_time ASC
        )
        FROM public.tracking_events te
        WHERE te.shipment_id = s.id
      ), '[]'::jsonb)
  )
  INTO result
  FROM public.shipments s
  WHERE lower(s.tracking_number) = lower(normalized_tracking)
  LIMIT 1;

  IF result IS NULL THEN
    RETURN jsonb_build_object(
      'shipment', NULL,
      'events', '[]'::jsonb
    );
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_shipment(
  tracking_number text,
  sender_name text DEFAULT NULL,
  receiver_name text DEFAULT NULL,
  origin text DEFAULT NULL,
  destination text DEFAULT NULL,
  status text DEFAULT 'shipment_created',
  estimated_delivery timestamptz DEFAULT NULL,
  event_location text DEFAULT NULL,
  event_description text DEFAULT NULL,
  event_time timestamptz DEFAULT now(),
  sender_company text DEFAULT NULL,
  sender_email text DEFAULT NULL,
  sender_phone text DEFAULT NULL,
  sender_address_line_1 text DEFAULT NULL,
  sender_address_line_2 text DEFAULT NULL,
  sender_city text DEFAULT NULL,
  sender_state text DEFAULT NULL,
  sender_postal_code text DEFAULT NULL,
  sender_country text DEFAULT NULL,
  recipient_name text DEFAULT NULL,
  recipient_company text DEFAULT NULL,
  recipient_email text DEFAULT NULL,
  recipient_phone text DEFAULT NULL,
  recipient_address_line_1 text DEFAULT NULL,
  recipient_address_line_2 text DEFAULT NULL,
  recipient_city text DEFAULT NULL,
  recipient_state text DEFAULT NULL,
  recipient_postal_code text DEFAULT NULL,
  recipient_country text DEFAULT NULL,
  package_type text DEFAULT NULL,
  package_description text DEFAULT NULL,
  quantity integer DEFAULT NULL,
  weight_kg numeric DEFAULT NULL,
  length_cm numeric DEFAULT NULL,
  width_cm numeric DEFAULT NULL,
  height_cm numeric DEFAULT NULL,
  declared_value numeric DEFAULT NULL,
  special_instructions text DEFAULT NULL,
  carrier text DEFAULT NULL,
  service text DEFAULT NULL,
  shipment_date timestamptz DEFAULT NULL,
  actual_delivery timestamptz DEFAULT NULL
)
RETURNS public.shipments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  normalized_tracking text;
  normalized_status text;
  resolved_recipient_name text;
  resolved_event_description text;
  shipment public.shipments%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  normalized_tracking := public.normalize_tracking_number(tracking_number);
  IF normalized_tracking IS NULL OR normalized_tracking = '' OR NOT public.is_valid_tracking_number(normalized_tracking) THEN
    RAISE EXCEPTION 'invalid tracking number';
  END IF;

  normalized_status := public.normalize_shipment_status(status);
  IF normalized_status IS NULL OR NOT public.is_valid_shipment_status(normalized_status) THEN
    RAISE EXCEPTION 'invalid shipment status';
  END IF;

  IF sender_name IS NULL OR btrim(sender_name) = '' THEN
    RAISE EXCEPTION 'sender_name is required';
  END IF;

  resolved_recipient_name := coalesce(recipient_name, receiver_name);
  IF resolved_recipient_name IS NULL OR btrim(resolved_recipient_name) = '' THEN
    RAISE EXCEPTION 'recipient_name is required';
  END IF;

  IF origin IS NULL OR btrim(origin) = '' THEN
    RAISE EXCEPTION 'origin is required';
  END IF;

  IF destination IS NULL OR btrim(destination) = '' THEN
    RAISE EXCEPTION 'destination is required';
  END IF;

  IF actual_delivery IS NOT NULL AND shipment_date IS NOT NULL AND actual_delivery < shipment_date THEN
    RAISE EXCEPTION 'actual_delivery cannot be earlier than shipment_date';
  END IF;

  resolved_event_description := coalesce(event_description, 'Shipment Created');

  INSERT INTO public.shipments (
    tracking_number,
    sender_name,
    receiver_name,
    recipient_name,
    origin,
    destination,
    status,
    estimated_delivery,
    carrier,
    service,
    shipment_date,
    actual_delivery,
    sender_company,
    sender_email,
    sender_phone,
    sender_address_line_1,
    sender_address_line_2,
    sender_city,
    sender_state,
    sender_postal_code,
    sender_country,
    recipient_company,
    recipient_email,
    recipient_phone,
    recipient_address_line_1,
    recipient_address_line_2,
    recipient_city,
    recipient_state,
    recipient_postal_code,
    recipient_country,
    package_type,
    package_description,
    quantity,
    weight_kg,
    length_cm,
    width_cm,
    height_cm,
    declared_value,
    special_instructions,
    created_at,
    updated_at
  ) VALUES (
    normalized_tracking,
    sender_name,
    coalesce(receiver_name, resolved_recipient_name),
    resolved_recipient_name,
    origin,
    destination,
    normalized_status,
    estimated_delivery,
    carrier,
    service,
    shipment_date,
    actual_delivery,
    sender_company,
    sender_email,
    sender_phone,
    sender_address_line_1,
    sender_address_line_2,
    sender_city,
    sender_state,
    sender_postal_code,
    sender_country,
    recipient_company,
    recipient_email,
    recipient_phone,
    recipient_address_line_1,
    recipient_address_line_2,
    recipient_city,
    recipient_state,
    recipient_postal_code,
    recipient_country,
    package_type,
    package_description,
    quantity,
    weight_kg,
    length_cm,
    width_cm,
    height_cm,
    declared_value,
    special_instructions,
    now(),
    now()
  )
  RETURNING * INTO shipment;

  INSERT INTO public.tracking_events (
    shipment_id,
    status,
    location,
    description,
    event_time,
    created_at
  ) VALUES (
    shipment.id,
    normalized_status,
    event_location,
    resolved_event_description,
    coalesce(event_time, now()),
    now()
  );

  RETURN shipment;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_shipment(
  shipment_id uuid,
  sender_name text DEFAULT NULL,
  receiver_name text DEFAULT NULL,
  origin text DEFAULT NULL,
  destination text DEFAULT NULL,
  status text DEFAULT NULL,
  estimated_delivery timestamptz DEFAULT NULL,
  event_status text DEFAULT NULL,
  event_location text DEFAULT NULL,
  event_description text DEFAULT NULL,
  event_time timestamptz DEFAULT now(),
  sender_company text DEFAULT NULL,
  sender_email text DEFAULT NULL,
  sender_phone text DEFAULT NULL,
  sender_address_line_1 text DEFAULT NULL,
  sender_address_line_2 text DEFAULT NULL,
  sender_city text DEFAULT NULL,
  sender_state text DEFAULT NULL,
  sender_postal_code text DEFAULT NULL,
  sender_country text DEFAULT NULL,
  recipient_name text DEFAULT NULL,
  recipient_company text DEFAULT NULL,
  recipient_email text DEFAULT NULL,
  recipient_phone text DEFAULT NULL,
  recipient_address_line_1 text DEFAULT NULL,
  recipient_address_line_2 text DEFAULT NULL,
  recipient_city text DEFAULT NULL,
  recipient_state text DEFAULT NULL,
  recipient_postal_code text DEFAULT NULL,
  recipient_country text DEFAULT NULL,
  package_type text DEFAULT NULL,
  package_description text DEFAULT NULL,
  quantity integer DEFAULT NULL,
  weight_kg numeric DEFAULT NULL,
  length_cm numeric DEFAULT NULL,
  width_cm numeric DEFAULT NULL,
  height_cm numeric DEFAULT NULL,
  declared_value numeric DEFAULT NULL,
  special_instructions text DEFAULT NULL,
  carrier text DEFAULT NULL,
  service text DEFAULT NULL,
  shipment_date timestamptz DEFAULT NULL,
  actual_delivery timestamptz DEFAULT NULL
)
RETURNS public.shipments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  current_record public.shipments%ROWTYPE;
  normalized_status text;
  normalized_event_status text;
  resolved_recipient_name text;
  record_exists boolean;
  shipment public.shipments%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO current_record
  FROM public.shipments
  WHERE id = shipment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shipment not found';
  END IF;

  IF status IS NOT NULL THEN
    normalized_status := public.normalize_shipment_status(status);
    IF NOT public.is_valid_shipment_status(normalized_status) THEN
      RAISE EXCEPTION 'invalid shipment status';
    END IF;
  END IF;

  IF event_status IS NOT NULL THEN
    normalized_event_status := public.normalize_shipment_status(event_status);
    IF NOT public.is_valid_shipment_status(normalized_event_status) THEN
      RAISE EXCEPTION 'invalid tracking event status';
    END IF;
  END IF;

  IF actual_delivery IS NOT NULL AND shipment_date IS NOT NULL AND actual_delivery < shipment_date THEN
    RAISE EXCEPTION 'actual_delivery cannot be earlier than shipment_date';
  END IF;

  resolved_recipient_name := coalesce(recipient_name, receiver_name, current_record.recipient_name, current_record.receiver_name);

  UPDATE public.shipments
  SET
    sender_name = coalesce(sender_name, current_record.sender_name),
    receiver_name = coalesce(receiver_name, current_record.receiver_name),
    recipient_name = coalesce(resolved_recipient_name, current_record.recipient_name),
    origin = coalesce(origin, current_record.origin),
    destination = coalesce(destination, current_record.destination),
    status = coalesce(normalized_status, current_record.status),
    estimated_delivery = coalesce(estimated_delivery, current_record.estimated_delivery),
    carrier = coalesce(carrier, current_record.carrier),
    service = coalesce(service, current_record.service),
    shipment_date = coalesce(shipment_date, current_record.shipment_date),
    actual_delivery = coalesce(actual_delivery, current_record.actual_delivery),
    sender_company = coalesce(sender_company, current_record.sender_company),
    sender_email = coalesce(sender_email, current_record.sender_email),
    sender_phone = coalesce(sender_phone, current_record.sender_phone),
    sender_address_line_1 = coalesce(sender_address_line_1, current_record.sender_address_line_1),
    sender_address_line_2 = coalesce(sender_address_line_2, current_record.sender_address_line_2),
    sender_city = coalesce(sender_city, current_record.sender_city),
    sender_state = coalesce(sender_state, current_record.sender_state),
    sender_postal_code = coalesce(sender_postal_code, current_record.sender_postal_code),
    sender_country = coalesce(sender_country, current_record.sender_country),
    recipient_company = coalesce(recipient_company, current_record.recipient_company),
    recipient_email = coalesce(recipient_email, current_record.recipient_email),
    recipient_phone = coalesce(recipient_phone, current_record.recipient_phone),
    recipient_address_line_1 = coalesce(recipient_address_line_1, current_record.recipient_address_line_1),
    recipient_address_line_2 = coalesce(recipient_address_line_2, current_record.recipient_address_line_2),
    recipient_city = coalesce(recipient_city, current_record.recipient_city),
    recipient_state = coalesce(recipient_state, current_record.recipient_state),
    recipient_postal_code = coalesce(recipient_postal_code, current_record.recipient_postal_code),
    recipient_country = coalesce(recipient_country, current_record.recipient_country),
    package_type = coalesce(package_type, current_record.package_type),
    package_description = coalesce(package_description, current_record.package_description),
    quantity = coalesce(quantity, current_record.quantity),
    weight_kg = coalesce(weight_kg, current_record.weight_kg),
    length_cm = coalesce(length_cm, current_record.length_cm),
    width_cm = coalesce(width_cm, current_record.width_cm),
    height_cm = coalesce(height_cm, current_record.height_cm),
    declared_value = coalesce(declared_value, current_record.declared_value),
    special_instructions = coalesce(special_instructions, current_record.special_instructions),
    updated_at = now()
  WHERE id = shipment_id
  RETURNING * INTO shipment;

  IF event_status IS NOT NULL THEN
    INSERT INTO public.tracking_events (
      shipment_id,
      status,
      location,
      description,
      event_time,
      created_at
    ) VALUES (
      shipment_id,
      normalized_event_status,
      event_location,
      coalesce(event_description, normalized_event_status),
      coalesce(event_time, now()),
      now()
    );
  END IF;

  RETURN shipment;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_shipment(shipment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  DELETE FROM public.shipments WHERE id = shipment_id;
END;
$$;

COMMIT;
