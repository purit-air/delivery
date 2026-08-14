BEGIN;

-- Phase 1: align the shipment contract with the approved delivery platform model.
-- Preserve existing data by normalizing legacy values deterministically before enforcing constraints.

UPDATE public.shipments
SET tracking_number = upper(trim(tracking_number))
WHERE tracking_number IS NOT NULL;

UPDATE public.shipments
SET status = CASE
  WHEN lower(trim(status)) IN ('shipment created', 'shipment_created') THEN 'shipment_created'
  WHEN lower(trim(status)) IN ('picked up', 'picked_up') THEN 'picked_up'
  WHEN lower(trim(status)) IN ('in transit', 'in_transit') THEN 'in_transit'
  WHEN lower(trim(status)) IN ('out for delivery', 'out_for_delivery') THEN 'out_for_delivery'
  WHEN lower(trim(status)) IN ('delivered', 'delivery complete') THEN 'delivered'
  WHEN lower(trim(status)) IN ('exception', 'exceptions') THEN 'exception'
  WHEN lower(trim(status)) IN ('cancelled', 'canceled', 'cancelled shipment') THEN 'cancelled'
  WHEN lower(trim(status)) = 'pending' THEN 'shipment_created'
  ELSE 'exception'
END
WHERE status IS NOT NULL;

-- Add the shipment fields required for the approved delivery-platform contract.
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS shipment_date timestamptz,
  ADD COLUMN IF NOT EXISTS actual_delivery timestamptz,
  ADD COLUMN IF NOT EXISTS sender_company text,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS sender_phone text,
  ADD COLUMN IF NOT EXISTS sender_address_line_1 text,
  ADD COLUMN IF NOT EXISTS sender_address_line_2 text,
  ADD COLUMN IF NOT EXISTS sender_city text,
  ADD COLUMN IF NOT EXISTS sender_state text,
  ADD COLUMN IF NOT EXISTS sender_postal_code text,
  ADD COLUMN IF NOT EXISTS sender_country text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_company text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS recipient_address_line_1 text,
  ADD COLUMN IF NOT EXISTS recipient_address_line_2 text,
  ADD COLUMN IF NOT EXISTS recipient_city text,
  ADD COLUMN IF NOT EXISTS recipient_state text,
  ADD COLUMN IF NOT EXISTS recipient_postal_code text,
  ADD COLUMN IF NOT EXISTS recipient_country text,
  ADD COLUMN IF NOT EXISTS package_type text,
  ADD COLUMN IF NOT EXISTS package_description text,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(10,3),
  ADD COLUMN IF NOT EXISTS length_cm numeric(10,2),
  ADD COLUMN IF NOT EXISTS width_cm numeric(10,2),
  ADD COLUMN IF NOT EXISTS height_cm numeric(10,2),
  ADD COLUMN IF NOT EXISTS declared_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS special_instructions text;

-- Backfill the normalized recipient field without dropping the legacy field used by the current app.
UPDATE public.shipments
SET recipient_name = receiver_name
WHERE recipient_name IS NULL AND receiver_name IS NOT NULL;

-- Tracking number: canonical format TRE-YYYY-NNNN-NNNN.
ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_tracking_number_format_chk
  CHECK (tracking_number ~ '^[A-Z]{3}-[0-9]{4}-[0-9]{4}-[0-9]{4}$');

-- Canonical shipment status values.
ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_status_allowed
  CHECK (status IN (
    'shipment_created',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'exception',
    'cancelled'
  ));

-- Additional safety constraints for delivery data quality.
ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_delivery_dates_order
  CHECK (shipment_date IS NULL OR actual_delivery IS NULL OR actual_delivery >= shipment_date),
  ADD CONSTRAINT shipments_weight_nonnegative
  CHECK (weight_kg IS NULL OR weight_kg >= 0),
  ADD CONSTRAINT shipments_declared_value_nonnegative
  CHECK (declared_value IS NULL OR declared_value >= 0),
  ADD CONSTRAINT shipments_quantity_nonnegative
  CHECK (quantity IS NULL OR quantity >= 0);

-- Added indexes for common admin and tracking queries.
CREATE INDEX IF NOT EXISTS shipments_status_idx ON public.shipments (status);
CREATE INDEX IF NOT EXISTS shipments_carrier_idx ON public.shipments (carrier);
CREATE INDEX IF NOT EXISTS shipments_service_idx ON public.shipments (service);
CREATE INDEX IF NOT EXISTS shipments_shipment_date_idx ON public.shipments (shipment_date);
CREATE INDEX IF NOT EXISTS shipments_actual_delivery_idx ON public.shipments (actual_delivery);
CREATE INDEX IF NOT EXISTS shipments_sender_email_idx ON public.shipments (sender_email);
CREATE INDEX IF NOT EXISTS shipments_recipient_email_idx ON public.shipments (recipient_email);
CREATE INDEX IF NOT EXISTS shipments_sender_name_idx ON public.shipments (sender_name);
CREATE INDEX IF NOT EXISTS shipments_recipient_name_idx ON public.shipments (recipient_name);
CREATE INDEX IF NOT EXISTS shipments_origin_idx ON public.shipments (origin);
CREATE INDEX IF NOT EXISTS shipments_destination_idx ON public.shipments (destination);

COMMIT;
