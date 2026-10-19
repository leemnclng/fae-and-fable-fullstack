-- Extra admin accounts, added from the admin page. The main account stays in ADMIN_EMAIL/ADMIN_PASSWORD so it can never be locked out.
CREATE TABLE $s.admins (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE, -- stored lowercased
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
