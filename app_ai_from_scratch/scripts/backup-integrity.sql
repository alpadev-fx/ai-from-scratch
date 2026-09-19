-- Fail closed: a restore that cannot find the canary account and its grant
-- is not a restore. psql -v ON_ERROR_STOP=1 turns these into a non-zero exit.
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'users table missing after restore';
  END IF;
  IF to_regclass('public.entitlement_events') IS NULL THEN
    RAISE EXCEPTION 'entitlement_events table missing after restore';
  END IF;
  IF (SELECT count(*) FROM users WHERE email = 'canary@restore.test' AND paid = 1) <> 1 THEN
    RAISE EXCEPTION 'canary account missing after restore';
  END IF;
  IF (SELECT count(*) FROM entitlement_events WHERE event_key = 'canary-grant' AND active) <> 1 THEN
    RAISE EXCEPTION 'canary entitlement missing after restore';
  END IF;
END $$;

SELECT email, paid FROM users WHERE email = 'canary@restore.test';
SELECT event_key, active, source FROM entitlement_events WHERE event_key = 'canary-grant';
