DO $$
BEGIN
  IF to_regclass('public.payments') IS NULL THEN
    RAISE EXCEPTION 'payments table missing after restore';
  END IF;
  IF to_regclass('public.entitlement_deliveries') IS NULL THEN
    RAISE EXCEPTION 'entitlement_deliveries table missing after restore';
  END IF;
END $$;

SELECT count(*) AS payments FROM payments;
SELECT count(*) AS deliveries FROM entitlement_deliveries;
