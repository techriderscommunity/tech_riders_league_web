CREATE TABLE github_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  github_id bigint NOT NULL UNIQUE,
  login text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE github_repositories (
  team_id uuid PRIMARY KEY REFERENCES teams(id),
  repository_id bigint NOT NULL UNIQUE,
  full_name text NOT NULL,
  installation_id bigint NOT NULL,
  captain_id uuid NOT NULL REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE github_oauth_states (
  state_hash text PRIMARY KEY,
  session_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  repository text,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
ALTER TABLE league_events ADD COLUMN evaluation_closed boolean NOT NULL DEFAULT false;
ALTER TABLE challenges ADD COLUMN allow_resubmission boolean NOT NULL DEFAULT true;
ALTER TABLE submissions ADD COLUMN github_repository_id bigint;
ALTER TABLE submissions ADD COLUMN github_full_name text;
ALTER TABLE submissions ADD COLUMN github_installation_id bigint;
ALTER TABLE submissions ADD COLUMN commit_sha text;
ALTER TABLE submissions ADD COLUMN branch text;
ALTER TABLE submissions ADD COLUMN submitted_by uuid REFERENCES users(id);
ALTER TABLE submissions ADD COLUMN snapshot bytea;
ALTER TABLE submissions ADD COLUMN snapshot_digest text;
ALTER TABLE submissions ADD COLUMN snapshot_manifest jsonb;
ALTER TABLE submissions ADD CONSTRAINT github_submission_shape CHECK (
  commit_sha IS NULL OR (kind='challenge' AND commit_sha ~ '^[a-f0-9]{40}$'
    AND github_repository_id IS NOT NULL AND github_full_name IS NOT NULL
    AND github_installation_id IS NOT NULL AND submitted_by IS NOT NULL
    AND snapshot IS NOT NULL AND snapshot_digest IS NOT NULL AND snapshot_manifest IS NOT NULL)
);
CREATE FUNCTION protect_github_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.commit_sha IS NOT NULL AND
    (NEW.team_id,NEW.event_id,NEW.github_repository_id,NEW.github_full_name,
     NEW.github_installation_id,NEW.commit_sha,NEW.branch,NEW.submitted_at,
     NEW.submitted_by,NEW.snapshot,NEW.snapshot_digest,NEW.snapshot_manifest,NEW.url,NEW.challenge_version)
    IS DISTINCT FROM
    (OLD.team_id,OLD.event_id,OLD.github_repository_id,OLD.github_full_name,
     OLD.github_installation_id,OLD.commit_sha,OLD.branch,OLD.submitted_at,
     OLD.submitted_by,OLD.snapshot,OLD.snapshot_digest,OLD.snapshot_manifest,OLD.url,OLD.challenge_version)
  THEN RAISE EXCEPTION 'GitHub submission identity and snapshot are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_github_submission BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION protect_github_submission();
CREATE TABLE solution_publications (
  id uuid PRIMARY KEY,
  submission_id uuid REFERENCES submissions(id) ON DELETE SET NULL,
  publication_id uuid NOT NULL REFERENCES publications(id),
  event_id text NOT NULL REFERENCES league_events(id),
  position integer NOT NULL CHECK(position BETWEEN 1 AND 3),
  source_folder text NOT NULL,
  manifest jsonb NOT NULL,
  manifest_digest text NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','creating','failed','pr','merged','cancelled')),
  reason text NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  pr_number integer,
  pr_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX active_solution_publication ON solution_publications(submission_id)
  WHERE status<>'cancelled';
