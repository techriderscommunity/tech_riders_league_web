CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(trim(email))),
  first_name text NOT NULL,
  last_name text NOT NULL,
  password_hash text NOT NULL,
  verified_at timestamptz,
  staff_status text NOT NULL DEFAULT 'none' CHECK (staff_status IN ('none','pending','approved','removed')),
  community text,
  is_owner boolean NOT NULL DEFAULT false,
  terms_version text NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX single_owner ON users (is_owner) WHERE is_owner;

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL
);

CREATE TABLE teams (
  id uuid PRIMARY KEY,
  season text NOT NULL DEFAULT '2027',
  name text NOT NULL,
  name_key text NOT NULL,
  captain_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','correction','approved','rejected')),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, name_key)
);
CREATE TABLE members (
  team_id uuid NOT NULL REFERENCES teams(id),
  user_id uuid NOT NULL REFERENCES users(id),
  season text NOT NULL DEFAULT '2027',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id,user_id),
  UNIQUE (season,user_id)
);
CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(id),
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pending_invitation ON invitations(team_id,email) WHERE status='pending';

CREATE TABLE account_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE mail_outbox (
  id uuid PRIMARY KEY,
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  window_start timestamptz NOT NULL
);
