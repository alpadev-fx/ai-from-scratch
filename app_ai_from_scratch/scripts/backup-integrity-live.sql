-- Integrity for a restore of a real course-db dump. No canary row: production
-- data is whoever is in the dump. Fail closed if the two tables a recovery
-- has to get back are missing.
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'users table missing after restore';
  END IF;
  IF to_regclass('public.entitlement_events') IS NULL THEN
    RAISE EXCEPTION 'entitlement_events table missing after restore';
  END IF;
END $$;

SELECT count(*) AS users FROM users;
SELECT count(*) AS grants FROM entitlement_events;
SELECT count(*) AS paid_users FROM users WHERE paid = 1;
