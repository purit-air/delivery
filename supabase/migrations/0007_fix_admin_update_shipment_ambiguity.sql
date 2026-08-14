BEGIN;

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
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.admin_update_shipment_internal(
    shipment_id := shipment_id,
    p_sender_name := sender_name,
    p_receiver_name := receiver_name,
    p_origin := origin,
    p_destination := destination,
    p_status := status,
    p_estimated_delivery := estimated_delivery,
    p_event_status := event_status,
    p_event_location := event_location,
    p_event_description := event_description,
    p_event_time := event_time,
    p_sender_company := sender_company,
    p_sender_email := sender_email,
    p_sender_phone := sender_phone,
    p_sender_address_line_1 := sender_address_line_1,
    p_sender_address_line_2 := sender_address_line_2,
    p_sender_city := sender_city,
    p_sender_state := sender_state,
    p_sender_postal_code := sender_postal_code,
    p_sender_country := sender_country,
    p_recipient_name := recipient_name,
    p_recipient_company := recipient_company,
    p_recipient_email := recipient_email,
    p_recipient_phone := recipient_phone,
    p_recipient_address_line_1 := recipient_address_line_1,
    p_recipient_address_line_2 := recipient_address_line_2,
    p_recipient_city := recipient_city,
    p_recipient_state := recipient_state,
    p_recipient_postal_code := recipient_postal_code,
    p_recipient_country := recipient_country,
    p_package_type := package_type,
    p_package_description := package_description,
    p_quantity := quantity,
    p_weight_kg := weight_kg,
    p_length_cm := length_cm,
    p_width_cm := width_cm,
    p_height_cm := height_cm,
    p_declared_value := declared_value,
    p_special_instructions := special_instructions,
    p_carrier := carrier,
    p_service := service,
    p_shipment_date := shipment_date,
    p_actual_delivery := actual_delivery
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_shipment_internal(
  shipment_id uuid,
  p_sender_name text DEFAULT NULL,
  p_receiver_name text DEFAULT NULL,
  p_origin text DEFAULT NULL,
  p_destination text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_estimated_delivery timestamptz DEFAULT NULL,
  p_event_status text DEFAULT NULL,
  p_event_location text DEFAULT NULL,
  p_event_description text DEFAULT NULL,
  p_event_time timestamptz DEFAULT now(),
  p_sender_company text DEFAULT NULL,
  p_sender_email text DEFAULT NULL,
  p_sender_phone text DEFAULT NULL,
  p_sender_address_line_1 text DEFAULT NULL,
  p_sender_address_line_2 text DEFAULT NULL,
  p_sender_city text DEFAULT NULL,
  p_sender_state text DEFAULT NULL,
  p_sender_postal_code text DEFAULT NULL,
  p_sender_country text DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_recipient_company text DEFAULT NULL,
  p_recipient_email text DEFAULT NULL,
  p_recipient_phone text DEFAULT NULL,
  p_recipient_address_line_1 text DEFAULT NULL,
  p_recipient_address_line_2 text DEFAULT NULL,
  p_recipient_city text DEFAULT NULL,
  p_recipient_state text DEFAULT NULL,
  p_recipient_postal_code text DEFAULT NULL,
  p_recipient_country text DEFAULT NULL,
  p_package_type text DEFAULT NULL,
  p_package_description text DEFAULT NULL,
  p_quantity integer DEFAULT NULL,
  p_weight_kg numeric DEFAULT NULL,
  p_length_cm numeric DEFAULT NULL,
  p_width_cm numeric DEFAULT NULL,
  p_height_cm numeric DEFAULT NULL,
  p_declared_value numeric DEFAULT NULL,
  p_special_instructions text DEFAULT NULL,
  p_carrier text DEFAULT NULL,
  p_service text DEFAULT NULL,
  p_shipment_date timestamptz DEFAULT NULL,
  p_actual_delivery timestamptz DEFAULT NULL
)
RETURNS public.shipments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_record public.shipments%ROWTYPE;
  normalized_status text;
  normalized_event_status text;
  resolved_recipient_name text;
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

  IF p_status IS NOT NULL THEN
    normalized_status := public.normalize_shipment_status(p_status);
    IF NOT public.is_valid_shipment_status(normalized_status) THEN
      RAISE EXCEPTION 'invalid shipment status';
    END IF;
  END IF;

  IF p_event_status IS NOT NULL THEN
    normalized_event_status := public.normalize_shipment_status(p_event_status);
    IF NOT public.is_valid_shipment_status(normalized_event_status) THEN
      RAISE EXCEPTION 'invalid tracking event status';
    END IF;
  END IF;

  IF p_actual_delivery IS NOT NULL AND p_shipment_date IS NOT NULL AND p_actual_delivery < p_shipment_date THEN
    RAISE EXCEPTION 'actual_delivery cannot be earlier than shipment_date';
  END IF;

  resolved_recipient_name := coalesce(p_recipient_name, p_receiver_name, current_record.recipient_name, current_record.receiver_name);

  UPDATE public.shipments AS s
  SET
    sender_name = coalesce(p_sender_name, current_record.sender_name),
    receiver_name = coalesce(p_receiver_name, current_record.receiver_name),
    recipient_name = coalesce(resolved_recipient_name, current_record.recipient_name),
    origin = coalesce(p_origin, current_record.origin),
    destination = coalesce(p_destination, current_record.destination),
    status = coalesce(normalized_status, current_record.status),
    estimated_delivery = coalesce(p_estimated_delivery, current_record.estimated_delivery),
    carrier = coalesce(p_carrier, current_record.carrier),
    service = coalesce(p_service, current_record.service),
    shipment_date = coalesce(p_shipment_date, current_record.shipment_date),
    actual_delivery = coalesce(p_actual_delivery, current_record.actual_delivery),
    sender_company = coalesce(p_sender_company, current_record.sender_company),
    sender_email = coalesce(p_sender_email, current_record.sender_email),
    sender_phone = coalesce(p_sender_phone, current_record.sender_phone),
    sender_address_line_1 = coalesce(p_sender_address_line_1, current_record.sender_address_line_1),
    sender_address_line_2 = coalesce(p_sender_address_line_2, current_record.sender_address_line_2),
    sender_city = coalesce(p_sender_city, current_record.sender_city),
    sender_state = coalesce(p_sender_state, current_record.sender_state),
    sender_postal_code = coalesce(p_sender_postal_code, current_record.sender_postal_code),
    sender_country = coalesce(p_sender_country, current_record.sender_country),
    recipient_company = coalesce(p_recipient_company, current_record.recipient_company),
    recipient_email = coalesce(p_recipient_email, current_record.recipient_email),
    recipient_phone = coalesce(p_recipient_phone, current_record.recipient_phone),
    recipient_address_line_1 = coalesce(p_recipient_address_line_1, current_record.recipient_address_line_1),
    recipient_address_line_2 = coalesce(p_recipient_address_line_2, current_record.recipient_address_line_2),
    recipient_city = coalesce(p_recipient_city, current_record.recipient_city),
    recipient_state = coalesce(p_recipient_state, current_record.recipient_state),
    recipient_postal_code = coalesce(p_recipient_postal_code, current_record.recipient_postal_code),
    recipient_country = coalesce(p_recipient_country, current_record.recipient_country),
    package_type = coalesce(p_package_type, current_record.package_type),
    package_description = coalesce(p_package_description, current_record.package_description),
    quantity = coalesce(p_quantity, current_record.quantity),
    weight_kg = coalesce(p_weight_kg, current_record.weight_kg),
    length_cm = coalesce(p_length_cm, current_record.length_cm),
    width_cm = coalesce(p_width_cm, current_record.width_cm),
    height_cm = coalesce(p_height_cm, current_record.height_cm),
    declared_value = coalesce(p_declared_value, current_record.declared_value),
    special_instructions = coalesce(p_special_instructions, current_record.special_instructions),
    updated_at = now()
  WHERE s.id = shipment_id
  RETURNING * INTO shipment;

  IF p_event_status IS NOT NULL THEN
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
      p_event_location,
      coalesce(p_event_description, normalized_event_status),
      coalesce(p_event_time, now()),
      now()
    );
  END IF;

  RETURN shipment;
END;
$$;

COMMIT;
