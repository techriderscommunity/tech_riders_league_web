UPDATE communities SET eligible_for_staff_request=false;

INSERT INTO staff_communities(name,active) VALUES
  ('Tech Riders',true),
  ('Sirviendo Codigo',true),
  ('Guarandinga Tech',true),
  ('SQL Server Español',true)
ON CONFLICT(name) DO UPDATE SET active=true;

INSERT INTO communities(name,active,eligible_for_staff_request,role) VALUES
  ('Tech Riders',true,true,'admin_league'),
  ('Sirviendo Codigo',true,true,'staff'),
  ('Guarandinga Tech',true,true,'staff'),
  ('SQL Server Español',true,true,'staff')
ON CONFLICT(name) DO UPDATE SET
  active=true,
  eligible_for_staff_request=true,
  role=CASE WHEN EXCLUDED.name='Tech Riders' THEN 'admin_league' ELSE communities.role END;
