ALTER TABLE users ADD COLUMN disabled_at timestamptz;
ALTER TABLE account_tokens ADD COLUMN new_email text;
ALTER TABLE teams ADD COLUMN captain_active boolean NOT NULL DEFAULT true;
ALTER TABLE teams DROP CONSTRAINT teams_status_check;
ALTER TABLE teams ADD CONSTRAINT teams_status_check CHECK(status IN ('draft','pending','correction','approved','rejected','withdrawn'));
ALTER TABLE members ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE members ADD COLUMN original boolean NOT NULL DEFAULT true;
ALTER TABLE members DROP CONSTRAINT members_season_user_id_key;
CREATE UNIQUE INDEX active_season_member ON members(season,user_id) WHERE active;
CREATE TABLE seasons (
  id text PRIMARY KEY,
  retention_at timestamptz NOT NULL,
  retired_at timestamptz
);
INSERT INTO seasons(id,retention_at) VALUES('2027','2028-01-15T00:00:00+01:00');
CREATE TABLE league_events (
  id text PRIMARY KEY,
  season text NOT NULL REFERENCES seasons(id),
  name text NOT NULL,
  ordinal integer NOT NULL,
  voucher_limit integer NOT NULL,
  closed boolean NOT NULL DEFAULT false,
  UNIQUE(season,ordinal)
);
INSERT INTO league_events(id,season,name,ordinal,voucher_limit) VALUES
  ('negocio','2027','Negocio',1,5),('datos','2027','Datos',2,5),
  ('cloud','2027','Cloud',3,5),('seguridad','2027','Seguridad',4,5),
  ('hackathon','2027','Hackathon final',5,10);
ALTER TABLE invitations ADD COLUMN event_id text REFERENCES league_events(id);
ALTER TABLE invitations ADD COLUMN original_id uuid REFERENCES users(id);
ALTER TABLE invitations ADD CONSTRAINT invitation_kind CHECK (
  (event_id IS NULL AND original_id IS NULL) OR (event_id IS NOT NULL AND original_id IS NOT NULL)
);
CREATE UNIQUE INDEX pending_substitution ON invitations(team_id,event_id)
  WHERE status='pending' AND event_id IS NOT NULL;
CREATE TABLE substitutions (
  team_id uuid NOT NULL REFERENCES teams(id),
  event_id text NOT NULL REFERENCES league_events(id),
  original_id uuid NOT NULL REFERENCES users(id),
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(team_id,event_id),
  UNIQUE(event_id,user_id)
);
CREATE TABLE attendance (
  team_id uuid NOT NULL REFERENCES teams(id),
  event_id text NOT NULL REFERENCES league_events(id),
  user_id uuid NOT NULL REFERENCES users(id),
  luma boolean NOT NULL DEFAULT false,
  present boolean NOT NULL DEFAULT false,
  at_end boolean NOT NULL DEFAULT false,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(team_id,event_id,user_id),
  UNIQUE(event_id,user_id),
  CHECK (NOT present OR luma),
  CHECK (NOT at_end OR present)
);
CREATE TABLE captain_changes (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(id),
  previous_id uuid NOT NULL REFERENCES users(id),
  next_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','activation','approved','rejected')),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pending_captain_change ON captain_changes(team_id) WHERE status IN ('pending','activation');
CREATE TABLE membership_changes (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(id),
  previous_id uuid NOT NULL REFERENCES users(id),
  next_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE challenges (
  event_id text PRIMARY KEY REFERENCES league_events(id),
  title text NOT NULL,
  instructions text NOT NULL,
  deadline timestamptz,
  status text NOT NULL CHECK(status IN ('draft','published','closed')),
  version integer NOT NULL DEFAULT 1
);
CREATE TABLE submissions (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(id),
  event_id text NOT NULL REFERENCES league_events(id),
  kind text NOT NULL CHECK(kind IN ('challenge','photo')),
  url text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  challenge_version integer,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','correction','rejected')),
  reason text,
  reviewer_id uuid REFERENCES users(id),
  current boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX current_submission ON submissions(team_id,event_id,kind) WHERE current;
CREATE TABLE score_entries (
  team_id uuid NOT NULL REFERENCES teams(id),
  event_id text NOT NULL REFERENCES league_events(id),
  concept text NOT NULL CHECK(concept IN ('attendance','photo','challenge','bonus')),
  points integer NOT NULL CHECK(points IN (0,50,75,100)),
  PRIMARY KEY(team_id,event_id,concept)
);
CREATE TABLE tie_decisions (
  scope text NOT NULL,
  fingerprint text NOT NULL,
  team_order jsonb NOT NULL,
  reason text NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope,fingerprint)
);
CREATE TABLE publications (
  id uuid PRIMARY KEY,
  scope text NOT NULL,
  ranking jsonb NOT NULL,
  current boolean NOT NULL DEFAULT true,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX current_publication ON publications(scope) WHERE current;
CREATE TABLE awards (
  id uuid PRIMARY KEY,
  event_id text REFERENCES league_events(id),
  user_id uuid REFERENCES users(id),
  team_id uuid REFERENCES teams(id),
  kind text NOT NULL CHECK(kind IN ('voucher','prize')),
  description text NOT NULL,
  reason text NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  CHECK ((kind='voucher' AND event_id IS NOT NULL AND user_id IS NOT NULL AND team_id IS NULL)
    OR (kind='prize' AND team_id IS NOT NULL AND user_id IS NULL))
);
CREATE UNIQUE INDEX one_voucher ON awards(event_id,user_id) WHERE kind='voucher';
CREATE UNIQUE INDEX one_global_prize ON awards(team_id) WHERE kind='prize' AND event_id IS NULL;
CREATE UNIQUE INDEX one_event_prize ON awards(event_id,team_id) WHERE kind='prize' AND event_id IS NOT NULL;
CREATE TABLE staff_communities (
  name text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO staff_communities(name) SELECT DISTINCT community FROM users WHERE community IS NOT NULL;
CREATE TABLE staff_memberships (
  user_id uuid NOT NULL REFERENCES users(id),
  community text NOT NULL REFERENCES staff_communities(name),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(user_id,community)
);
INSERT INTO staff_memberships(user_id,community)
  SELECT id,community FROM users WHERE staff_status='approved' AND community IS NOT NULL;
CREATE TABLE withdrawal_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','rejected')),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pending_withdrawal ON withdrawal_requests(user_id) WHERE status='pending';
CREATE TABLE contributions (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  destination text NOT NULL,
  amount_cents integer NOT NULL CHECK(amount_cents>=0),
  resource_url text,
  authorized boolean NOT NULL DEFAULT false,
  reviewer_id uuid NOT NULL REFERENCES users(id)
);
