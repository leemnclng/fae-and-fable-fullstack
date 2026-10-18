-- Fae&Fable schema. `$s` is replaced with the configured schema (DB_SCHEMA) by the migrate runner.

CREATE TABLE $s.settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- Catalog: draft is what the admin edits, published is what visitors see (NULL = never published)
CREATE TABLE $s.products (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sort integer NOT NULL DEFAULT 0,
  draft jsonb NOT NULL,
  published jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE $s.events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  event_date text NOT NULL, -- YYYY-MM-DD, kept as text so no time zone shifts it
  expires_at timestamptz NOT NULL,
  slug text NOT NULL UNIQUE,
  passcode text NOT NULL,
  client_token text NOT NULL UNIQUE,
  client_code text,
  is_public boolean NOT NULL DEFAULT false,
  design jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE $s.showcases (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  event_date text NOT NULL,
  location text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE $s.showcase_photos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  showcase_id integer NOT NULL REFERENCES $s.showcases (id) ON DELETE CASCADE,
  file text NOT NULL,
  sort integer NOT NULL DEFAULT 0
);
CREATE INDEX ON $s.showcase_photos (showcase_id);

CREATE TABLE $s.messages (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id integer NOT NULL REFERENCES $s.events (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON $s.messages (event_id);

CREATE TABLE $s.photos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id integer NOT NULL REFERENCES $s.events (id) ON DELETE CASCADE,
  file text NOT NULL,
  guest_name text,
  message_id integer REFERENCES $s.messages (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON $s.photos (event_id);
