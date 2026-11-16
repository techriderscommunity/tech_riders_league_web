CREATE TABLE communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  eligible_for_staff_request boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO communities(name,active,eligible_for_staff_request)
  SELECT name,active,active FROM staff_communities;

CREATE TABLE community_worlds (
  community_id uuid NOT NULL REFERENCES communities(id),
  world_id text NOT NULL REFERENCES league_events(id),
  active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(community_id,world_id)
);

CREATE TABLE league_admins (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
INSERT INTO league_admins(user_id,active)
  SELECT id,true FROM users WHERE is_owner;

CREATE TABLE staff_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  community_id uuid NOT NULL REFERENCES communities(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled','revoked')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  internal_note text,
  public_reason text,
  version integer NOT NULL DEFAULT 1
);
INSERT INTO staff_requests(id,user_id,community_id,status,requested_at)
  SELECT gen_random_uuid(),u.id,c.id,'pending',u.created_at
  FROM users u JOIN communities c ON c.name=u.community
  WHERE u.staff_status='pending';

CREATE TABLE staff_world_assignments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  community_id uuid NOT NULL,
  world_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (community_id,world_id) REFERENCES community_worlds(community_id,world_id)
);
CREATE UNIQUE INDEX one_active_staff_world_assignment
  ON staff_world_assignments(user_id,community_id,world_id) WHERE active;

CREATE TABLE season_rules (
  season text PRIMARY KEY REFERENCES seasons(id),
  min_team_size integer NOT NULL CHECK(min_team_size>0),
  max_team_size integer NOT NULL CHECK(max_team_size>=min_team_size),
  max_event_attendees integer NOT NULL CHECK(max_event_attendees>0),
  minimum_originals_for_final integer NOT NULL CHECK(minimum_originals_for_final>0),
  minimum_worlds_for_final integer NOT NULL CHECK(minimum_worlds_for_final>0),
  logo_max_bytes integer NOT NULL DEFAULT 2097152 CHECK(logo_max_bytes>0),
  logo_max_width integer NOT NULL DEFAULT 1024 CHECK(logo_max_width>0),
  logo_max_height integer NOT NULL DEFAULT 1024 CHECK(logo_max_height>0),
  logo_allowed_media_types text[] NOT NULL DEFAULT ARRAY['image/png','image/jpeg','image/webp'],
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO season_rules(
  season,min_team_size,max_team_size,max_event_attendees,
  minimum_originals_for_final,minimum_worlds_for_final
) VALUES ('2027',4,4,4,3,3);

CREATE TABLE team_logo_assets (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(id),
  media_type text NOT NULL,
  contents bytea NOT NULL,
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  width integer NOT NULL CHECK(width>0),
  height integer NOT NULL CHECK(height>0),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE teams ADD COLUMN logo_asset_id uuid REFERENCES team_logo_assets(id);
CREATE FUNCTION prevent_team_logo_asset_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE'
    AND current_setting('app.team_logo_override',true) IS DISTINCT FROM 'season-retirement'
  THEN
    RAISE EXCEPTION 'TEAM_LOGO_ASSET_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'TEAM_LOGO_ASSET_IMMUTABLE' USING ERRCODE='23514'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER immutable_team_logo_asset
  BEFORE UPDATE OR DELETE ON team_logo_assets
  FOR EACH ROW EXECUTE FUNCTION prevent_team_logo_asset_mutation();

CREATE TABLE point_ledger (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(id),
  event_id text NOT NULL REFERENCES league_events(id),
  concept text NOT NULL CHECK(concept IN ('attendance','photo','challenge','bonus')),
  points integer NOT NULL CHECK(points IN (-100,-75,-50,50,75,100)),
  reason text NOT NULL,
  submission_id uuid REFERENCES submissions(id) ON DELETE SET NULL,
  reversal_of_entry_id uuid REFERENCES point_ledger(id),
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewer_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE score_entries ADD COLUMN ledger_entry_id uuid REFERENCES point_ledger(id);
INSERT INTO point_ledger(id,team_id,event_id,concept,points,reason,idempotency_key)
  SELECT gen_random_uuid(),team_id,event_id,concept,points,'Imported prior score',
    'legacy:'||team_id||':'||event_id||':'||concept
  FROM score_entries WHERE points<>0;
UPDATE score_entries s SET ledger_entry_id=l.id
  FROM point_ledger l WHERE l.idempotency_key='legacy:'||s.team_id||':'||s.event_id||':'||s.concept;
CREATE FUNCTION prevent_point_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.retire_submission_links',true) = 'true'
    AND OLD.submission_id IS NOT NULL
    AND NEW.submission_id IS NULL
    AND (to_jsonb(NEW) - 'submission_id') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'submission_id')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'POINT_LEDGER_IMMUTABLE' USING ERRCODE='23514';
END $$;
CREATE TRIGGER immutable_point_ledger
  BEFORE UPDATE OR DELETE ON point_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_point_ledger_mutation();

ALTER TABLE point_ledger DROP CONSTRAINT point_ledger_points_check;
ALTER TABLE point_ledger ADD CONSTRAINT point_ledger_points_check CHECK(points<>0);
ALTER TABLE score_entries DROP CONSTRAINT score_entries_points_check;
ALTER TABLE score_entries ADD CONSTRAINT score_entries_points_check CHECK(points>=0);

CREATE TABLE evaluation_rubrics (
  id uuid PRIMARY KEY,
  event_id text NOT NULL REFERENCES league_events(id),
  version integer NOT NULL CHECK(version>0),
  status text NOT NULL CHECK(status IN ('draft','published','locked','archived')),
  max_score integer NOT NULL CHECK(max_score>0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(event_id,version),
  UNIQUE(id,event_id)
);
CREATE UNIQUE INDEX one_draft_rubric_per_event ON evaluation_rubrics(event_id) WHERE status='draft';
CREATE UNIQUE INDEX one_published_rubric_per_event ON evaluation_rubrics(event_id) WHERE status='published';
CREATE FUNCTION validate_rubric_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE criteria_count integer; criteria_total integer;
BEGIN
  IF NEW.status='published' AND OLD.status='draft' THEN
    SELECT count(*)::int,COALESCE(sum(max_points),0)::int INTO criteria_count,criteria_total
      FROM evaluation_criteria WHERE rubric_id=NEW.id;
    IF criteria_count=0 OR criteria_total<>NEW.max_score OR NEW.published_at IS NULL THEN
      RAISE EXCEPTION 'INVALID_RUBRIC_PUBLICATION' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_rubric_state
  BEFORE UPDATE ON evaluation_rubrics
  FOR EACH ROW EXECUTE FUNCTION validate_rubric_publication();
CREATE TABLE evaluation_criteria (
  id uuid PRIMARY KEY,
  rubric_id uuid NOT NULL REFERENCES evaluation_rubrics(id),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  max_points integer NOT NULL CHECK(max_points>0),
  position integer NOT NULL CHECK(position>0),
  UNIQUE(rubric_id,position),
  UNIQUE(rubric_id,name),
  UNIQUE(rubric_id,id)
);
ALTER TABLE challenges ADD COLUMN rubric_id uuid REFERENCES evaluation_rubrics(id);
ALTER TABLE challenges ADD COLUMN slug text NOT NULL DEFAULT '';
ALTER TABLE challenges ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE challenges ADD COLUMN objective text NOT NULL DEFAULT '';
ALTER TABLE challenges ADD COLUMN requirements text[] NOT NULL DEFAULT '{}';
ALTER TABLE challenges ADD COLUMN resources text[] NOT NULL DEFAULT '{}';
ALTER TABLE challenges ADD COLUMN rules text[] NOT NULL DEFAULT '{}';
ALTER TABLE challenges ADD COLUMN deliverables text[] NOT NULL DEFAULT '{}';
ALTER TABLE challenges ADD COLUMN opens_at timestamptz;
ALTER TABLE challenges ADD COLUMN timezone text NOT NULL DEFAULT '';
ALTER TABLE challenges ADD COLUMN max_score integer CHECK(max_score>0);
ALTER TABLE challenges ADD COLUMN created_by uuid REFERENCES users(id);
ALTER TABLE challenges ADD COLUMN published_at timestamptz;
ALTER TABLE challenges ADD COLUMN closed_at timestamptz;
ALTER TABLE submissions ADD COLUMN rubric_id uuid REFERENCES evaluation_rubrics(id);
CREATE OR REPLACE FUNCTION protect_github_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.commit_sha IS NOT NULL AND
    (NEW.team_id,NEW.event_id,NEW.github_repository_id,NEW.github_full_name,
     NEW.github_installation_id,NEW.commit_sha,NEW.branch,NEW.submitted_at,
     NEW.submitted_by,NEW.snapshot,NEW.snapshot_digest,NEW.snapshot_manifest,NEW.url,NEW.challenge_version,NEW.rubric_id)
    IS DISTINCT FROM
    (OLD.team_id,OLD.event_id,OLD.github_repository_id,OLD.github_full_name,
     OLD.github_installation_id,OLD.commit_sha,OLD.branch,OLD.submitted_at,
     OLD.submitted_by,OLD.snapshot,OLD.snapshot_digest,OLD.snapshot_manifest,OLD.url,OLD.challenge_version,OLD.rubric_id)
  THEN RAISE EXCEPTION 'GitHub submission identity and snapshot are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TABLE challenge_revisions (
  event_id text NOT NULL REFERENCES league_events(id),
  version integer NOT NULL CHECK(version>0),
  title text NOT NULL,
  instructions text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL,
  objective text NOT NULL,
  requirements text[] NOT NULL,
  resources text[] NOT NULL,
  rules text[] NOT NULL,
  deliverables text[] NOT NULL,
  opens_at timestamptz,
  deadline timestamptz,
  timezone text NOT NULL,
  max_score integer,
  status text NOT NULL CHECK(status IN ('draft','published','closed')),
  allow_resubmission boolean NOT NULL,
  rubric_id uuid REFERENCES evaluation_rubrics(id),
  created_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id,version)
);
CREATE FUNCTION prevent_challenge_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CHALLENGE_REVISION_IMMUTABLE' USING ERRCODE='23514';
END $$;
CREATE TRIGGER immutable_challenge_revisions
  BEFORE UPDATE OR DELETE ON challenge_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_challenge_revision_mutation();
CREATE FUNCTION validate_challenge_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rubric_status text; rubric_max_score integer;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.status='draft' AND NEW.status='closed'
      OR OLD.status='published' AND NEW.status='draft'
      OR OLD.status='closed' AND NEW.status='draft'
    THEN
      RAISE EXCEPTION 'INVALID_CHALLENGE_TRANSITION' USING ERRCODE='23514';
    END IF;
    IF OLD.status='closed' AND NEW.status='published'
      AND (current_setting('app.challenge_reopen_reason',true) IS DISTINCT FROM 'provided')
    THEN
      RAISE EXCEPTION 'CHALLENGE_REOPEN_REASON_REQUIRED' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='published' THEN
    SELECT status,max_score INTO rubric_status,rubric_max_score FROM evaluation_rubrics WHERE id=NEW.rubric_id;
    IF NEW.deadline IS NULL OR NEW.max_score IS NULL OR NEW.max_score<=0
      OR NEW.rubric_id IS NULL OR rubric_status NOT IN ('published','locked')
      OR NEW.max_score IS DISTINCT FROM rubric_max_score
      OR NEW.created_by IS NULL OR NEW.published_at IS NULL
      OR NEW.timezone=''
      OR (NEW.opens_at IS NOT NULL AND NEW.opens_at>=NEW.deadline)
    THEN
      RAISE EXCEPTION 'INVALID_CHALLENGE_PUBLICATION' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='closed' AND (NEW.closed_at IS NULL OR NEW.published_at IS NULL) THEN
    RAISE EXCEPTION 'INVALID_CHALLENGE_CLOSE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_challenge_state
  BEFORE INSERT OR UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION validate_challenge_publication();

CREATE TABLE submission_evaluations (
  id uuid PRIMARY KEY,
  submission_id uuid REFERENCES submissions(id) ON DELETE SET NULL,
  rubric_id uuid NOT NULL REFERENCES evaluation_rubrics(id),
  revision integer NOT NULL CHECK(revision>0),
  status text NOT NULL CHECK(status IN ('draft','in_review','final')),
  evaluator_id uuid NOT NULL REFERENCES users(id),
  commit_sha text NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40}$'),
  supersedes_evaluation_id uuid REFERENCES submission_evaluations(id),
  revision_reason text NOT NULL DEFAULT '',
  final_score integer CHECK(final_score>=0),
  feedback_private text NOT NULL DEFAULT '',
  feedback_public text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE(submission_id,revision),
  UNIQUE(id,rubric_id),
  CHECK((status='final')=(finalized_at IS NOT NULL)),
  CHECK((status='final')=(final_score IS NOT NULL))
);
CREATE UNIQUE INDEX one_open_evaluation_per_submission
  ON submission_evaluations(submission_id) WHERE status IN ('draft','in_review');
CREATE TABLE evaluation_scores (
  evaluation_id uuid NOT NULL REFERENCES submission_evaluations(id),
  rubric_id uuid NOT NULL,
  criterion_id uuid NOT NULL,
  score integer NOT NULL CHECK(score>=0),
  comment text NOT NULL DEFAULT '',
  PRIMARY KEY(evaluation_id,criterion_id),
  FOREIGN KEY(evaluation_id,rubric_id) REFERENCES submission_evaluations(id,rubric_id),
  FOREIGN KEY(rubric_id,criterion_id) REFERENCES evaluation_criteria(rubric_id,id)
);
CREATE FUNCTION validate_evaluation_score() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE criterion_max integer;
BEGIN
  SELECT max_points INTO criterion_max FROM evaluation_criteria
    WHERE rubric_id=NEW.rubric_id AND id=NEW.criterion_id;
  IF criterion_max IS NULL OR NEW.score>criterion_max THEN
    RAISE EXCEPTION 'EVALUATION_SCORE_OUT_OF_RANGE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_evaluation_score_range
  BEFORE INSERT OR UPDATE ON evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION validate_evaluation_score();
ALTER TABLE point_ledger ADD COLUMN evaluation_id uuid REFERENCES submission_evaluations(id);
ALTER TABLE score_entries ADD COLUMN evaluation_id uuid REFERENCES submission_evaluations(id);

CREATE FUNCTION prevent_published_rubric_criteria_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_status text; new_status text;
BEGIN
  IF TG_OP<>'INSERT' THEN
    SELECT status INTO old_status FROM evaluation_rubrics WHERE id=OLD.rubric_id;
  END IF;
  IF TG_OP<>'DELETE' THEN
    SELECT status INTO new_status FROM evaluation_rubrics WHERE id=NEW.rubric_id;
  END IF;
  IF old_status IS DISTINCT FROM 'draft' AND old_status IS NOT NULL
    OR new_status IS DISTINCT FROM 'draft' AND new_status IS NOT NULL
  THEN
    RAISE EXCEPTION 'PUBLISHED_RUBRIC_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_published_rubric_criteria
  BEFORE INSERT OR UPDATE OR DELETE ON evaluation_criteria
  FOR EACH ROW EXECUTE FUNCTION prevent_published_rubric_criteria_mutation();

CREATE FUNCTION prevent_published_rubric_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='draft' THEN
    IF TG_OP='UPDATE'
      AND (NEW.event_id,NEW.version,NEW.max_score,NEW.created_by,NEW.created_at)
        IS DISTINCT FROM (OLD.event_id,OLD.version,OLD.max_score,OLD.created_by,OLD.created_at)
    THEN
      RAISE EXCEPTION 'RUBRIC_VERSION_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE'
    AND OLD.status='published'
    AND NEW.status IN ('locked','archived')
    AND (to_jsonb(NEW) - 'status' - 'published_at') IS NOT DISTINCT FROM
        (to_jsonb(OLD) - 'status' - 'published_at')
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE'
    AND OLD.status='locked'
    AND NEW.status='archived'
    AND (to_jsonb(NEW) - 'status') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'status')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'PUBLISHED_RUBRIC_IMMUTABLE' USING ERRCODE='23514';
END $$;
CREATE TRIGGER immutable_published_rubric
  BEFORE UPDATE OR DELETE ON evaluation_rubrics
  FOR EACH ROW EXECUTE FUNCTION prevent_published_rubric_mutation();

CREATE FUNCTION prevent_final_evaluation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE evaluation_status text; evaluation_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN evaluation_id := OLD.evaluation_id;
  ELSE evaluation_id := NEW.evaluation_id; END IF;
  SELECT status INTO evaluation_status FROM submission_evaluations WHERE id=evaluation_id;
  IF evaluation_status='final' THEN
    IF current_setting('app.retire_submission_links',true)='true'
      AND TG_OP='UPDATE'
      AND NEW.evaluation_id=OLD.evaluation_id
      AND NEW.rubric_id=OLD.rubric_id
      AND NEW.criterion_id=OLD.criterion_id
      AND NEW.score=OLD.score
      AND NEW.comment=''
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'FINAL_EVALUATION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_final_evaluation_scores
  BEFORE INSERT OR UPDATE OR DELETE ON evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION prevent_final_evaluation_mutation();

CREATE FUNCTION prevent_final_evaluation_record_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE submission_sha text; submission_current boolean; submission_status text;
  criterion_count integer; score_count integer; score_total integer; maximum_score integer;
BEGIN
  IF OLD.status='final' THEN
    IF current_setting('app.retire_submission_links',true)='true'
      AND TG_OP='UPDATE'
      AND NEW.id=OLD.id
      AND NEW.submission_id IS NULL
      AND NEW.rubric_id=OLD.rubric_id
      AND NEW.revision=OLD.revision
      AND NEW.status=OLD.status
      AND NEW.evaluator_id=OLD.evaluator_id
      AND NEW.commit_sha=OLD.commit_sha
      AND NEW.supersedes_evaluation_id IS NOT DISTINCT FROM OLD.supersedes_evaluation_id
      AND NEW.revision_reason='Datos retirados'
      AND NEW.final_score=OLD.final_score
      AND NEW.feedback_private=''
      AND NEW.feedback_public=''
      AND NEW.finalized_at=OLD.finalized_at
      AND NEW.created_at=OLD.created_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'FINAL_EVALUATION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF NEW.status='final' AND OLD.status<>'final' THEN
    SELECT commit_sha,current,status INTO submission_sha,submission_current,submission_status
      FROM submissions WHERE id=NEW.submission_id;
    SELECT r.max_score,count(c.id)::int,count(es.criterion_id)::int,COALESCE(sum(es.score),0)::int
      INTO maximum_score,criterion_count,score_count,score_total
      FROM evaluation_rubrics r
      JOIN evaluation_criteria c ON c.rubric_id=r.id
      LEFT JOIN evaluation_scores es ON es.rubric_id=c.rubric_id AND es.criterion_id=c.id AND es.evaluation_id=NEW.id
      WHERE r.id=NEW.rubric_id
      GROUP BY r.max_score;
    IF NEW.submission_id IS NULL OR NOT submission_current OR submission_status<>'approved'
      OR submission_sha IS DISTINCT FROM NEW.commit_sha
      OR criterion_count=0 OR criterion_count<>score_count OR score_total>maximum_score
      OR NEW.final_score IS DISTINCT FROM score_total
    THEN
      RAISE EXCEPTION 'INVALID_FINAL_EVALUATION' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_final_evaluation_record
  BEFORE UPDATE OR DELETE ON submission_evaluations
  FOR EACH ROW EXECUTE FUNCTION prevent_final_evaluation_record_mutation();

CREATE FUNCTION prevent_team_rename() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
    AND current_setting('app.team_name_override',true) IS DISTINCT FROM 'season-retirement'
  THEN
    RAISE EXCEPTION 'TEAM_NAME_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_team_name BEFORE UPDATE OF name ON teams
  FOR EACH ROW EXECUTE FUNCTION prevent_team_rename();
