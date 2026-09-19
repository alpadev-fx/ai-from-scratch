-- Minimal account + entitlement shape for the restore drill.
-- Not the production schema. Enough to prove a dump round-trips the two
-- tables a recovery has to get back: who the user is, and whether they paid.
CREATE TABLE users (
  id integer PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  pass_hash text NOT NULL,
  paid smallint NOT NULL DEFAULT 0
);

CREATE TABLE entitlement_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text UNIQUE NOT NULL,
  user_id integer NOT NULL REFERENCES users (id),
  active boolean NOT NULL,
  source text NOT NULL,
  external_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (id, email, name, pass_hash, paid)
VALUES (1, 'canary@restore.test', 'Canary', 'x', 1);

INSERT INTO entitlement_events (event_key, user_id, active, source, external_id)
VALUES ('canary-grant', 1, true, 'admin', 'drill');
