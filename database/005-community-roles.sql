ALTER TABLE communities
  ADD COLUMN role text NOT NULL DEFAULT 'staff'
  CHECK(role IN ('staff','admin_league'));

UPDATE communities
SET role='admin_league'
WHERE lower(trim(name))='tech riders';

INSERT INTO community_worlds(community_id,world_id,active)
SELECT c.id,e.id,true
FROM communities c
JOIN league_events e ON e.id='hackathon'
JOIN seasons s ON s.id=e.season AND s.retired_at IS NULL
ON CONFLICT(community_id,world_id) DO UPDATE SET active=true;

CREATE FUNCTION user_has_league_admin_privileges(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((SELECT u.is_owner FROM users u WHERE u.id=target_user_id),false)
    OR EXISTS(
      SELECT 1 FROM league_admins a
      WHERE a.user_id=target_user_id AND a.active
    )
    OR EXISTS(
      SELECT 1
      FROM staff_memberships m
      JOIN communities c ON c.name=m.community
      JOIN users u ON u.id=m.user_id
      WHERE m.user_id=target_user_id
        AND m.active
        AND c.active
        AND c.role='admin_league'
        AND u.staff_status='approved'
        AND u.verified_at IS NOT NULL
        AND u.disabled_at IS NULL
    );
$$;
