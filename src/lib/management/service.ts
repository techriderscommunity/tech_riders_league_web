import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database, transaction } from "./db.ts";
import { digest, token, hashPassword, verifyPassword } from "./crypto.ts";
import { accountMail, appUrl, queueMail } from "./mail.ts";
import { email, password, text, teamName, uuid, TERMS_VERSION, ManagementError } from "./validation.ts";

export interface User {
  id: string; email: string; first_name: string; last_name: string;
  verified_at: Date | null; staff_status: "none" | "pending" | "approved" | "removed";
  is_owner: boolean; is_league_admin?: boolean;
}
type Input = Record<string, unknown>;
export interface Team {
  id: string; name: string; status: string; captain_id: string;
  is_captain: boolean; review_reason: string | null; captain_active: boolean; logo_asset_id?: string | null; created_at?: Date;
}
export interface Member { id: string; first_name: string; last_name: string; email: string; joined_at?: Date }
export interface Invitation { id: string; email: string; status: string; expires_at: Date }
interface StaffApplicant extends Member {
  user_id: string; community: string; community_id: string; staff_status: string; request_status: string;
  worlds: { id: string; name: string }[]; assigned_worlds: { id: string; name: string }[];
}
interface MailSummary { id: string; recipient: string; subject: string; status: string; last_error: string | null }
async function audit(client: PoolClient, actor: string | null, action: string, target: string, details: Input = {}) {
  await client.query("INSERT INTO audit_log(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)", [actor, action, target, JSON.stringify(details)]);
}
export function requireStaff(user: User) {
  if (!user.verified_at || (user.staff_status !== "approved" && !user.is_league_admin)) {
    throw new ManagementError("Acceso exclusivo de staff aprobado.", 403);
  }
}
export function requireLeagueAdmin(user: User) {
  if (!user.verified_at || (!user.is_owner && !user.is_league_admin)) {
    throw new ManagementError("Acceso exclusivo de Admin League.", 403);
  }
}
export function hasControlCenterAccess(user: User) {
  return Boolean(user.verified_at && (user.staff_status === "approved" || user.is_owner || user.is_league_admin));
}
export async function requireParticipant(client: PoolClient, id: string) {
  const found = await client.query<{ verified_at: Date | null; disabled_at: Date | null }>(
    "SELECT verified_at,disabled_at FROM users WHERE id=$1 FOR UPDATE", [id]);
  const person = found.rows[0];
  if (!person || !person.verified_at || person.disabled_at) {
    throw new ManagementError("La cuenta no puede participar en equipos.", 403);
  }
}
async function teamRules(client: PoolClient) {
  const found = await client.query<{ min_team_size: number; max_team_size: number }>(
    "SELECT min_team_size,max_team_size FROM season_rules WHERE season='2027'");
  if (!found.rows[0]) throw new ManagementError("Faltan reglas de equipo para la temporada.", 503);
  return found.rows[0];
}
export async function sessionUser(value: string | undefined): Promise<User | undefined> {
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return undefined;
  const result = await database().query<User>(
    `SELECT u.id,u.email,u.first_name,u.last_name,u.verified_at,u.staff_status,u.is_owner,
       user_has_league_admin_privileges(u.id) AS is_league_admin
     FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled_at IS NULL`, [digest(value)]);
  return result.rows[0];
}
export async function registrationCommunities() {
  if (!process.env.DATABASE_URL) return [];
  const result = await database().query<{ id: string; name: string }>(
    `SELECT c.id,c.name FROM communities c
     WHERE c.active AND c.eligible_for_staff_request
     ORDER BY CASE c.name
       WHEN 'Tech Riders' THEN 0
       WHEN 'Sirviendo Codigo' THEN 1
       WHEN 'Guarandinga Tech' THEN 2
       WHEN 'SQL Server Español' THEN 3
       ELSE 4
     END,c.name`);
  return result.rows;
}
async function currentAdmin(client: PoolClient, userId: string) {
  const found = await client.query<User>(
    `SELECT u.*,user_has_league_admin_privileges(u.id) AS is_league_admin
     FROM users u WHERE u.id=$1 AND u.disabled_at IS NULL FOR UPDATE`, [userId]);
  const actor = found.rows[0];
  if (!actor) throw new ManagementError("Cuenta no disponible.", 403);
  requireLeagueAdmin(actor);
  return actor;
}
export async function createCommunity(user: User, input: Input) {
  await transaction(async client => {
    const actor = await currentAdmin(client, user.id);
    const name = text(input.name, "Comunidad", 120);
    const eligible = input.eligible === true;
    const role = input.role === undefined ? "staff" : text(input.role, "Rol de comunidad", 20);
    if (!["staff", "admin_league"].includes(role)) throw new ManagementError("Rol de comunidad no válido.");
    if (role === "admin_league" && !actor.is_owner) throw new ManagementError("Solo el responsable puede asignar Admin League a una comunidad.", 403);
    const communityId = randomUUID();
    await client.query("INSERT INTO communities(id,name,eligible_for_staff_request,role) VALUES($1,$2,$3,$4)", [communityId, name, eligible, role]);
    await client.query("INSERT INTO staff_communities(name) VALUES($1) ON CONFLICT(name) DO NOTHING", [name]);
    await client.query(
      `INSERT INTO community_worlds(community_id,world_id,assigned_by)
       SELECT $1,'hackathon',$2 FROM league_events e JOIN seasons s ON s.id=e.season
       WHERE e.id='hackathon' AND s.retired_at IS NULL`,
      [communityId, actor.id]);
    await audit(client, actor.id, "community.created", communityId, { name, role });
  });
}
export async function setCommunityRole(user: User, input: Input) {
  await transaction(async client => {
    const actor = await currentAdmin(client, user.id);
    if (!actor.is_owner) throw new ManagementError("Solo el responsable puede cambiar roles de comunidad.", 403);
    const communityId = uuid(input.communityId);
    const role = text(input.role, "Rol de comunidad", 20);
    if (!["staff", "admin_league"].includes(role)) throw new ManagementError("Rol de comunidad no válido.");
    const reason = text(input.reason, "Motivo", 1000);
    const result = await client.query(
      "UPDATE communities SET role=$2 WHERE id=$1 AND role<>$2 RETURNING name", [communityId, role]);
    if (!result.rowCount) throw new ManagementError("Comunidad no disponible o el rol ya está asignado.");
    await audit(client, actor.id, "community.role_updated", communityId, { role, reason });
  });
}
export async function assignCommunityWorld(user: User, input: Input) {
  await transaction(async client => {
    const actor = await currentAdmin(client, user.id);
    const communityId = uuid(input.communityId), worldId = text(input.worldId, "Mundo", 30);
    const active = input.active === true, reason = text(input.reason, "Motivo", 1000);
    if (worldId === "hackathon" && !active) throw new ManagementError("El Hackathon debe permanecer compartido por todas las comunidades activas.");
    const valid = await client.query(
      `SELECT 1 FROM communities c JOIN league_events e ON e.id=$2
       JOIN seasons s ON s.id=e.season WHERE c.id=$1 AND c.active AND s.retired_at IS NULL`, [communityId, worldId]);
    if (!valid.rowCount) throw new ManagementError("Comunidad o mundo no disponible.");
    await client.query(
      `INSERT INTO community_worlds(community_id,world_id,active,assigned_by) VALUES($1,$2,$3,$4)
       ON CONFLICT(community_id,world_id) DO UPDATE SET active=$3,assigned_by=$4,created_at=now()`,
      [communityId, worldId, active, actor.id]);
    if (!active) {
      await client.query(
        "UPDATE staff_world_assignments SET active=false,revoked_at=now() WHERE community_id=$1 AND world_id=$2 AND active",
        [communityId, worldId]);
      await client.query(
        `UPDATE users u SET staff_status='removed' WHERE u.staff_status='approved'
         AND EXISTS(SELECT 1 FROM staff_requests r WHERE r.user_id=u.id AND r.community_id=$1)
         AND NOT EXISTS(SELECT 1 FROM staff_world_assignments a WHERE a.user_id=u.id AND a.active)`, [communityId]);
    }
    await audit(client, actor.id, "community.world_assigned", communityId, { worldId, active, reason });
  });
}
export async function updateStaffWorlds(user: User, input: Input) {
  await transaction(async client => {
    const actor = await currentAdmin(client, user.id);
    const requestId = uuid(input.requestId);
    const worldIds = Array.isArray(input.worldIds)
      ? [...new Set(input.worldIds.map(value => text(value, "Mundo", 30)))] : [];
    if (!worldIds.length) throw new ManagementError("Selecciona al menos un mundo o revoca el acceso Staff.");
    const request = await client.query<{ user_id: string; community_id: string }>(
      "SELECT user_id,community_id FROM staff_requests WHERE id=$1 AND status='approved' FOR UPDATE", [requestId]);
    if (!request.rows[0]) throw new ManagementError("La solicitud Staff ya no está aprobada.");
    const valid = await client.query<{ world_id: string }>(
      `SELECT world_id FROM community_worlds WHERE community_id=$1 AND active AND world_id=ANY($2::text[])`,
      [request.rows[0].community_id, worldIds]);
    if (valid.rowCount !== worldIds.length) throw new ManagementError("Uno o varios mundos no pertenecen a la comunidad del Staff.");
    await client.query(
      "UPDATE staff_world_assignments SET active=false,revoked_at=now() WHERE user_id=$1 AND active", [request.rows[0].user_id]);
    for (const worldId of worldIds) {
      await client.query(
        `INSERT INTO staff_world_assignments(id,user_id,community_id,world_id,assigned_by)
         VALUES($1,$2,$3,$4,$5)`,
        [randomUUID(), request.rows[0].user_id, request.rows[0].community_id, worldId, actor.id]);
    }
    await client.query("UPDATE users SET staff_status='approved' WHERE id=$1", [request.rows[0].user_id]);
    await audit(client, actor.id, "staff.worlds_updated", request.rows[0].user_id, { worldIds });
  });
}
export async function grantLeagueAdmin(user: User, input: Input) {
  await transaction(async client => {
    const actor = await currentAdmin(client, user.id);
    if (!actor.is_owner) throw new ManagementError("Solo el responsable puede conceder o retirar Admin League.", 403);
    const targetId = uuid(input.userId);
    const target = await client.query("SELECT 1 FROM users WHERE id=$1 AND verified_at IS NOT NULL AND disabled_at IS NULL", [targetId]);
    if (!target.rowCount) throw new ManagementError("La cuenta debe estar activa y verificada.");
    await client.query(
      `INSERT INTO league_admins(user_id,active,granted_by,granted_at,revoked_at)
       VALUES($1,true,$2,now(),NULL)
       ON CONFLICT(user_id) DO UPDATE SET active=true,granted_by=$2,granted_at=now(),revoked_at=NULL`,
      [targetId, actor.id]);
    await audit(client, actor.id, "league_admin.granted", targetId);
  });
}
export async function revokeLeagueAdmin(user: User, input: Input) {
  await transaction(async client => {
    const actor = await currentAdmin(client, user.id);
    if (!actor.is_owner) throw new ManagementError("Solo el responsable puede conceder o retirar Admin League.", 403);
    const targetId = uuid(input.userId);
    const result = await client.query(
      "UPDATE league_admins SET active=false,revoked_at=now() WHERE user_id=$1 AND active AND user_id<>$2 RETURNING user_id",
      [targetId, actor.id]);
    if (!result.rowCount) throw new ManagementError("Admin League no disponible o es el único responsable.");
    await audit(client, actor.id, "league_admin.revoked", targetId);
  });
}
export async function limit(key: string, maximum = 10) {
  const result = await database().query<{ count: number }>(
    `INSERT INTO rate_limits(key,count,window_start) VALUES($1,1,now())
     ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN rate_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE rate_limits.count+1 END,
       window_start=CASE WHEN rate_limits.window_start<now()-interval '15 minutes' THEN now() ELSE rate_limits.window_start END
     RETURNING count`, [digest(key)]);
  if (result.rows[0].count > maximum) throw new ManagementError("Demasiados intentos. Espera 15 minutos.", 429);
}
async function captainTeam(client: PoolClient, user: User, id: string) {
  await requireParticipant(client, user.id);
  const result = await client.query<{ id: string; name: string; status: string; captain_id: string; captain_active: boolean }>(
    "SELECT id,name,status,captain_id,captain_active FROM teams WHERE id=$1 FOR UPDATE", [uuid(id)]);
  const team = result.rows[0];
  if (!team || team.captain_id !== user.id || !team.captain_active) throw new ManagementError("No puedes gestionar este equipo.", 403);
  return team;
}

export async function register(input: Input) {
  if (process.env.REGISTRATION_ENABLED !== "true") throw new ManagementError("El registro todavía no está habilitado.", 503);
  const season = await database().query("SELECT 1 FROM seasons WHERE id='2027' AND retired_at IS NULL");
  if (!season.rowCount) throw new ManagementError("El registro de esta temporada está cerrado.", 503);
  const address = email(input.email);
  const first = text(input.firstName, "Nombre"), last = text(input.lastName, "Apellidos");
  if (input.accepted !== true || input.adult !== true) throw new ManagementError("Debes aceptar las condiciones y confirmar que eres mayor de edad.");
  const credential = await hashPassword(password(input.password));
  const communityId = input.staff === true ? uuid(input.community) : null;
  return transaction(async client => {
    const community = communityId ? await client.query<{ id: string; name: string }>(
      `SELECT id,name FROM communities
       WHERE id=$1 AND active AND eligible_for_staff_request LIMIT 1`, [communityId]) : { rows: [] };
    if (communityId && !community.rows[0]) throw new ManagementError("La comunidad no admite solicitudes Staff.");
    const id = randomUUID();
    await client.query(`INSERT INTO users(id,email,first_name,last_name,password_hash,staff_status,community,terms_version,accepted_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [id, address, first, last, credential, communityId ? "pending" : "none", community.rows[0]?.name ?? null, TERMS_VERSION]);
    if (communityId) await client.query("INSERT INTO staff_requests(id,user_id,community_id) VALUES($1,$2,$3)",
      [randomUUID(), id, communityId]);
    await accountMail(client, id, address, "verify");
    await audit(client, id, "account.registered", id);
  });
}

export async function login(input: Input) {
  const address = email(input.email);
  const supplied = password(input.password);
  const result = await database().query<User & { password_hash: string }>("SELECT * FROM users WHERE email=$1 AND disabled_at IS NULL", [address]);
  const user = result.rows[0];
  const valid = await verifyPassword(supplied, user?.password_hash ?? await hashPassword("dummy-password-never-used"));
  if (!user || !valid) throw new ManagementError("Correo o contraseña incorrectos.", 401);
  if (!user.verified_at) throw new ManagementError("Confirma tu correo antes de entrar.", 403);
  const value = token();
  await database().query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')", [digest(value), user.id]);
  return value;
}

export async function requestAccountMail(input: Input, purpose: "reset" | "verify") {
  const address = email(input.email);
  await transaction(async client => {
    const result = await client.query<User>("SELECT * FROM users WHERE email=$1 AND disabled_at IS NULL FOR UPDATE", [address]);
    const user = result.rows[0];
    if (user && (purpose === "reset" || !user.verified_at)) await accountMail(client, user.id, address, purpose);
  });
}

export async function redeem(input: Input) {
  const value = text(input.token, "Enlace", 64);
  if (!/^[a-f0-9]{64}$/.test(value)) throw new ManagementError("Enlace no válido.");
  const purpose = input.purpose;
  if (purpose !== "verify" && purpose !== "reset") throw new ManagementError("Tipo de enlace no válido.");
  const credential = purpose === "reset" ? await hashPassword(password(input.password)) : null;
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(742028)");
    const result = await client.query<{ user_id: string; new_email: string | null }>(
      "SELECT user_id,new_email FROM account_tokens WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE", [digest(value), purpose]);
    const row = result.rows[0];
    if (!row) throw new ManagementError("El enlace ha caducado o ya se ha utilizado.");
    const person = await client.query<{ accepted_at: Date | null }>("SELECT accepted_at FROM users WHERE id=$1 FOR UPDATE", [row.user_id]);
    if (!person.rows[0].accepted_at) {
      if (input.accepted !== true || input.adult !== true) throw new ManagementError("Debes aceptar tus condiciones y confirmar la mayoría de edad para activar tu cuenta.");
      await client.query("UPDATE users SET accepted_at=now(),terms_version=$2 WHERE id=$1", [row.user_id, TERMS_VERSION]);
    }
    await client.query("UPDATE account_tokens SET consumed_at=now() WHERE token_hash=$1", [digest(value)]);
    if (credential) {
      await client.query("UPDATE users SET password_hash=$2,verified_at=COALESCE(verified_at,now()) WHERE id=$1", [row.user_id, credential]);
      await client.query("DELETE FROM sessions WHERE user_id=$1", [row.user_id]);
      const activations = await client.query<{ id: string; team_id: string; previous_id: string }>(
        `SELECT c.id,c.team_id,c.previous_id FROM captain_changes c JOIN teams t ON t.id=c.team_id
         WHERE c.next_id=$1 AND c.status='activation' AND t.captain_id=c.previous_id AND t.captain_active
         FOR UPDATE OF c,t`, [row.user_id]);
      for (const change of activations.rows) {
        const transition = await client.query(
          "UPDATE teams SET captain_id=$2 WHERE id=$1 AND captain_id=$3 AND captain_active",
          [change.team_id, row.user_id, change.previous_id]);
        if (!transition.rowCount) throw new ManagementError("El cambio de capitán quedó obsoleto; contacta con organización.", 409);
        await client.query("UPDATE captain_changes SET status='approved' WHERE id=$1 AND status='activation'", [change.id]);
        await audit(client, row.user_id, "captain.activated", change.id, { teamId: change.team_id, previousId: change.previous_id });
      }
    } else {
      await client.query("UPDATE users SET verified_at=now(),email=COALESCE($2,email) WHERE id=$1", [row.user_id, row.new_email]);
      if (row.new_email) {
        await client.query("DELETE FROM sessions WHERE user_id=$1", [row.user_id]);
        await client.query("UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL", [row.user_id]);
      }
    }
    await audit(client, row.user_id, `account.${purpose}`, row.user_id);
  });
}

export async function createTeam(user: User, input: Input) {
  const name = teamName(input.name);
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(742028)");
    await requireParticipant(client, user.id);
    const season = await client.query("SELECT 1 FROM seasons WHERE id='2027' AND retired_at IS NULL");
    const current = await client.query("SELECT 1 FROM users WHERE id=$1 AND disabled_at IS NULL AND verified_at IS NOT NULL", [user.id]);
    if (!season.rowCount || !current.rowCount) throw new ManagementError("La cuenta o la temporada no están disponibles.", 403);
    const substitute = await client.query("SELECT 1 FROM substitutions WHERE user_id=$1", [user.id]);
    if (substitute.rowCount) throw new ManagementError("Ya estás vinculado como sustituto a un equipo.");
    const id = randomUUID();
    await client.query("INSERT INTO teams(id,name,name_key,captain_id) VALUES($1,$2,$3,$4)", [id, name.name, name.key, user.id]);
    await client.query("INSERT INTO members(team_id,user_id) VALUES($1,$2)", [id, user.id]);
    await audit(client, user.id, "team.created", id);
  });
}

export async function invite(user: User, input: Input) {
  const address = email(input.email);
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(742028)");
    const team = await captainTeam(client, user, text(input.teamId, "Equipo", 36));
    if (!["draft", "correction"].includes(team.status)) throw new ManagementError("Solo puedes invitar mientras el equipo está en borrador o corrección.");
    const rules = await teamRules(client);
    await client.query("UPDATE invitations SET status='cancelled' WHERE team_id=$1 AND status='pending' AND expires_at<=now()", [team.id]);
    const occupied = await client.query<{ count: string }>(
      `SELECT (SELECT count(*) FROM members WHERE team_id=$1 AND active)+
       (SELECT count(*) FROM invitations WHERE team_id=$1 AND status='pending' AND event_id IS NULL) AS count`, [team.id]);
    if (Number(occupied.rows[0].count) >= rules.max_team_size) throw new ManagementError("El equipo ya tiene todas sus plazas ocupadas o invitadas.");
    const existing = await client.query(`SELECT m.user_id FROM members m JOIN users u ON u.id=m.user_id WHERE u.email=$1 AND m.season='2027' AND m.active
      UNION ALL SELECT s.user_id FROM substitutions s JOIN users u ON u.id=s.user_id WHERE u.email=$1`, [address]);
    if (existing.rowCount) throw new ManagementError("La persona ya pertenece a un equipo.");
    const recipient = await client.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [address]);
    if (recipient.rows[0]) await requireParticipant(client, recipient.rows[0].id);
    const value = token();
    const id = randomUUID();
    await client.query("INSERT INTO invitations(id,team_id,email,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",
      [id, team.id, address, digest(value)]);
    await queueMail(client, address, "Invitación a un equipo de la League",
      `Te han invitado al equipo ${team.name}.\nRegístrate o entra con este correo y acepta personalmente: ${appUrl()}/mi-equipo?invitacion=${value}\nCaduca en siete días.`);
    await audit(client, user.id, "invitation.created", id);
  });
}

export async function acceptInvitation(user: User, input: Input) {
  const value = text(input.token, "Invitación", 64);
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(742028)");
    await requireParticipant(client, user.id);
    // Lock the team before its invitation, matching the captain's mutation order.
    const lookup = await client.query<{ team_id: string }>("SELECT team_id FROM invitations WHERE token_hash=$1", [digest(value)]);
    const found = lookup.rows[0];
    if (!found) throw new ManagementError("Invitación no válida.");
    const team = await client.query<{ status: string }>("SELECT status FROM teams WHERE id=$1 FOR UPDATE", [found.team_id]);
    const invitation = await client.query<{ id: string; email: string }>(
      "SELECT id,email FROM invitations WHERE token_hash=$1 AND status='pending' AND expires_at>now() AND event_id IS NULL FOR UPDATE", [digest(value)]);
    const row = invitation.rows[0];
    if (!row || row.email !== user.email) throw new ManagementError("Invitación caducada, utilizada o destinada a otro correo.");
    if (!["draft", "correction"].includes(team.rows[0].status)) throw new ManagementError("El equipo no admite incorporaciones ahora.");
    const rules = await teamRules(client);
    const count = await client.query<{ count: string }>("SELECT count(*) FROM members WHERE team_id=$1 AND active", [found.team_id]);
    if (Number(count.rows[0].count) >= rules.max_team_size) throw new ManagementError("El equipo está completo.");
    const substitutes = await client.query("SELECT 1 FROM substitutions WHERE user_id=$1", [user.id]);
    if (substitutes.rowCount) throw new ManagementError("Ya estás vinculado como sustituto a un equipo.");
    await client.query("INSERT INTO members(team_id,user_id) VALUES($1,$2)", [found.team_id, user.id]);
    await client.query("UPDATE invitations SET status='accepted' WHERE id=$1", [row.id]);
    await audit(client, user.id, "invitation.accepted", row.id);
  });
}

export async function submitTeam(user: User, input: Input) {
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(742028)");
    const team = await captainTeam(client, user, text(input.teamId, "Equipo", 36));
    if (!["draft", "correction"].includes(team.status)) throw new ManagementError("El equipo no está listo para reenviarse.");
    const rules = await teamRules(client);
    const count = await client.query<{ count: string }>(
      "SELECT count(*) FROM members m JOIN users u ON u.id=m.user_id WHERE team_id=$1 AND m.active AND verified_at IS NOT NULL AND u.disabled_at IS NULL AND u.accepted_at IS NOT NULL", [team.id]);
    if (Number(count.rows[0].count) < rules.min_team_size) throw new ManagementError(`Necesitas al menos ${rules.min_team_size} integrantes registrados y con correo confirmado.`);
    await client.query("UPDATE teams SET status='pending',review_reason=NULL WHERE id=$1", [team.id]);
    await audit(client, user.id, "team.submitted", team.id);
  });
}

export async function renameTeam(user: User, input: Input) {
  void user;
  void input;
  throw new ManagementError("TEAM_NAME_IMMUTABLE");
}

export async function cancelInvitation(user: User, input: Input) {
  await transaction(async client => {
    const team = await captainTeam(client, user, text(input.teamId, "Equipo", 36));
    if (!["draft", "correction"].includes(team.status)) throw new ManagementError("No se permiten cambios en este estado.");
    const result = await client.query("UPDATE invitations SET status='cancelled' WHERE id=$1 AND team_id=$2 AND status='pending' RETURNING id",
      [uuid(input.invitationId), team.id]);
    if (!result.rowCount) throw new ManagementError("La invitación ya no está pendiente.");
    await audit(client, user.id, "invitation.cancelled", uuid(input.invitationId));
  });
}

export async function review(user: User, input: Input) {
  requireStaff(user);
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(742028)");
    const actor = await client.query<User>(
      `SELECT u.*,user_has_league_admin_privileges(u.id) AS is_league_admin
       FROM users u WHERE u.id=$1 FOR UPDATE`, [user.id]);
    const current = actor.rows[0];
    if (!current) throw new ManagementError("Cuenta no disponible.", 403);
    requireStaff(current);
    const id = uuid(input.id);
    if (input.kind === "staff") {
      requireLeagueAdmin(current);
      const status = input.status;
      if (status !== "approved" && status !== "rejected" && status !== "removed") throw new ManagementError("Estado no válido.");
      const request = await client.query<{
        user_id: string; community_id: string; community: string; request_status: string; email: string;
      }>(`SELECT r.user_id,r.community_id,c.name AS community,r.status AS request_status,u.email
          FROM staff_requests r JOIN communities c ON c.id=r.community_id
          JOIN users u ON u.id=r.user_id WHERE r.id=$1 FOR UPDATE OF r,u`, [id]);
      const row = request.rows[0];
      if (!row || !row.email || !["pending", "approved"].includes(row.request_status) ||
        (status === "approved" && row.request_status !== "pending")) {
        throw new ManagementError("La solicitud ya no admite esa acción.");
      }
      if (status === "approved") {
        const worldIds = Array.isArray(input.worldIds)
          ? [...new Set(input.worldIds.map(value => text(value, "Mundo", 100)))] : [];
        if (!worldIds.length) throw new ManagementError("Selecciona al menos un mundo para este Staff.");
        const worlds = await client.query<{ world_id: string }>(
          `SELECT world_id FROM community_worlds WHERE community_id=$1 AND active
           AND world_id=ANY($2::text[]) ORDER BY world_id`, [row.community_id, worldIds]);
        if (worlds.rowCount !== worldIds.length) throw new ManagementError("Uno o varios mundos no pertenecen a la comunidad solicitada.");
        await client.query(
          "UPDATE staff_requests SET status='approved',reviewed_at=now(),reviewed_by=$2,version=version+1 WHERE id=$1",
          [id, user.id]);
        await client.query("UPDATE users SET staff_status='approved',community=$2 WHERE id=$1", [row.user_id, row.community]);
        await client.query("INSERT INTO staff_memberships(user_id,community) VALUES($1,$2) ON CONFLICT(user_id,community) DO UPDATE SET active=true",
          [row.user_id, row.community]);
        for (const world of worlds.rows) {
          await client.query(
            `INSERT INTO staff_world_assignments(id,user_id,community_id,world_id,assigned_by)
             VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
            [randomUUID(), row.user_id, row.community_id, world.world_id, user.id]);
        }
      } else if (status === "rejected") {
        if (row.request_status !== "pending") throw new ManagementError("Solo se pueden rechazar solicitudes pendientes.");
        const reason = text(input.reason, "Motivo", 1000);
        await client.query(
          "UPDATE staff_requests SET status='rejected',reviewed_at=now(),reviewed_by=$2,public_reason=$3,version=version+1 WHERE id=$1",
          [id, user.id, reason]);
        await client.query("UPDATE users SET staff_status='none' WHERE id=$1", [row.user_id]);
      } else {
        await client.query(
          "UPDATE staff_requests SET status='revoked',reviewed_at=now(),reviewed_by=$2,version=version+1 WHERE id=$1",
          [id, user.id]);
        await client.query(
          "UPDATE staff_world_assignments SET active=false,revoked_at=now() WHERE user_id=$1 AND active", [row.user_id]);
        await client.query("UPDATE staff_memberships SET active=false WHERE user_id=$1", [row.user_id]);
        await client.query("UPDATE users SET staff_status='removed' WHERE id=$1", [row.user_id]);
      }
      await queueMail(client, row.email, "Actualización de acceso staff",
        `Tu solicitud de staff está ${status === "approved" ? "aprobada" : status === "rejected" ? "rechazada" : "dada de baja"}.${status === "rejected" ? ` Motivo: ${text(input.reason, "Motivo", 1000)}` : ""} Consulta ${appUrl()}/mi-equipo`);
      await audit(client, user.id, `staff.${status}`, id);
    } else if (input.kind === "team") {
      requireLeagueAdmin(current);
      const status = input.status;
      if (!["approved", "correction", "rejected"].includes(String(status))) throw new ManagementError("Estado no válido.");
      const reason = status === "approved" ? null : text(input.reason, "Motivo", 1000);
      const result = await client.query<{ captain_id: string }>(
        "UPDATE teams SET status=$2,review_reason=$3 WHERE id=$1 AND status='pending' RETURNING captain_id", [id, status, reason]);
      if (!result.rowCount) throw new ManagementError("El equipo ya no está pendiente de revisión.");
      const captain = await client.query<{ email: string }>("SELECT email FROM users WHERE id=$1", [result.rows[0].captain_id]);
      await queueMail(client, captain.rows[0].email, "Revisión de tu equipo",
        `Estado de tu equipo: ${status}.${reason ? ` Motivo: ${reason}` : ""}\nConsulta ${appUrl()}/mi-equipo`);
      await audit(client, user.id, `team.${status}`, id);
    } else throw new ManagementError("Revisión no válida.");
  });
}

export async function dashboard(user: User) {
  const teams = await database().query<Team>(`SELECT t.*,t.captain_id=$1 AND t.captain_active AS is_captain FROM teams t
    WHERE EXISTS(SELECT 1 FROM members m WHERE m.team_id=t.id AND m.user_id=$1 AND m.active)
    OR EXISTS(SELECT 1 FROM substitutions s WHERE s.team_id=t.id AND s.user_id=$1)`, [user.id]);
  const team = teams.rows[0];
  const members = team ? await database().query<Member & { original: boolean; active: boolean }>("SELECT u.id,u.first_name,u.last_name,u.email,m.original,m.active,m.joined_at FROM members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 ORDER BY joined_at", [team.id]) : { rows: [] };
  const invitations = team && team.is_captain ? await database().query<Invitation>("SELECT id,email,status,expires_at FROM invitations WHERE team_id=$1 ORDER BY created_at", [team.id]) : { rows: [] };
  const season = await database().query<{ retired_at: Date | null }>("SELECT retired_at FROM seasons WHERE id='2027'");
  const rules = await database().query<{ min_team_size: number; max_team_size: number }>(
    "SELECT min_team_size,max_team_size FROM season_rules WHERE season='2027'");
  if (!rules.rows[0]) throw new ManagementError("Faltan reglas de equipo para la temporada.", 503);
  return { user, team: team ?? null, members: members.rows, invitations: invitations.rows, retired: Boolean(season.rows[0]?.retired_at), rules: rules.rows[0] };
}
export async function staffDashboard(user: User) {
  requireStaff(user);
  const isAdmin = Boolean(user.is_owner || user.is_league_admin);
  const teams = isAdmin ? await database().query<Team & { captain_email: string; members: Member[] }>(
    `SELECT t.*,u.email AS captain_email,
      (SELECT json_agg(json_build_object('id',p.id,'first_name',p.first_name,'last_name',p.last_name,'email',p.email))
       FROM members m JOIN users p ON p.id=m.user_id WHERE m.team_id=t.id) AS members
     FROM teams t JOIN users u ON u.id=t.captain_id WHERE t.status='pending' ORDER BY t.created_at`) : { rows: [] };

  const staff = isAdmin ? await database().query<StaffApplicant>(
    `SELECT r.id,u.id AS user_id,u.email,u.first_name,u.last_name,c.name AS community,c.id AS community_id,
      u.staff_status,r.status AS request_status,
      COALESCE((SELECT json_agg(json_build_object('id',e.id,'name',e.name) ORDER BY e.ordinal)
        FROM community_worlds cw JOIN league_events e ON e.id=cw.world_id
        WHERE cw.community_id=c.id AND cw.active),'[]'::json) AS worlds,
      COALESCE((SELECT json_agg(json_build_object('id',e.id,'name',e.name) ORDER BY e.ordinal)
        FROM staff_world_assignments a JOIN league_events e ON e.id=a.world_id
        WHERE a.user_id=u.id AND a.active),'[]'::json) AS assigned_worlds
     FROM staff_requests r JOIN users u ON u.id=r.user_id JOIN communities c ON c.id=r.community_id
     WHERE u.verified_at IS NOT NULL AND r.status=ANY($1::text[]) ORDER BY r.requested_at`,
    [isAdmin ? ["pending", "approved", "rejected", "revoked", "cancelled"] : ["pending"]]) : { rows: [] };
  const mails = isAdmin ? await database().query<MailSummary>("SELECT id,recipient,subject,status,last_error,created_at FROM mail_outbox WHERE status IN ('pending','failed') ORDER BY created_at LIMIT 100") : { rows: [] };
  const communities = isAdmin ? await database().query<{
    id: string; name: string; active: boolean; eligible_for_staff_request: boolean; role: string;
    worlds: { id: string; name: string; active: boolean }[];
  }>(
    `SELECT c.id,c.name,c.active,c.eligible_for_staff_request,c.role,
      COALESCE((SELECT json_agg(json_build_object('id',e.id,'name',e.name,'active',cw.active) ORDER BY e.ordinal)
        FROM community_worlds cw JOIN league_events e ON e.id=cw.world_id WHERE cw.community_id=c.id),'[]'::json) AS worlds
     FROM communities c ORDER BY c.name`) : { rows: [] };
  const worlds = isAdmin ? await database().query<{ id: string; name: string }>(
    "SELECT id,name FROM league_events WHERE season='2027' ORDER BY ordinal") : { rows: [] };
  const accounts = isAdmin ? await database().query<{
    id: string; email: string; first_name: string; last_name: string; is_owner: boolean;
    staff_status: string; is_league_admin: boolean; explicit_league_admin: boolean;
    communities: { name: string; role: string }[];
  }>(
    `SELECT u.id,u.email,u.first_name,u.last_name,u.is_owner,u.staff_status,
      user_has_league_admin_privileges(u.id) AS is_league_admin,
      EXISTS(SELECT 1 FROM league_admins a WHERE a.user_id=u.id AND a.active) AS explicit_league_admin,
      COALESCE((SELECT json_agg(json_build_object('name',m.community,'role',c.role) ORDER BY m.community)
        FROM staff_memberships m JOIN communities c ON c.name=m.community
        WHERE m.user_id=u.id AND m.active AND c.active),'[]'::json) AS communities
     FROM users u WHERE u.verified_at IS NOT NULL AND u.disabled_at IS NULL ORDER BY u.email`) : { rows: [] };
  return { teams: teams.rows, staff: staff.rows, mails: mails.rows, communities: communities.rows, worlds: worlds.rows, accounts: accounts.rows };
}
