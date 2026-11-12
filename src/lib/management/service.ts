import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database, transaction } from "./db.ts";
import { digest, token, hashPassword, verifyPassword } from "./crypto.ts";
import { accountMail, appUrl, queueMail } from "./mail.ts";
import { email, password, text, teamName, uuid, TERMS_VERSION, ManagementError } from "./validation.ts";

export interface User {
  id: string; email: string; first_name: string; last_name: string;
  verified_at: Date | null; staff_status: "none" | "pending" | "approved" | "removed";
  is_owner: boolean;
}
type Input = Record<string, unknown>;
export interface Team {
  id: string; name: string; status: string; captain_id: string;
  is_captain: boolean; review_reason: string | null; captain_active: boolean;
}
export interface Member { id: string; first_name: string; last_name: string; email: string }
export interface Invitation { id: string; email: string; status: string; expires_at: Date }
interface StaffApplicant extends Member { community: string; staff_status: string }
interface MailSummary { id: string; recipient: string; subject: string; status: string; last_error: string | null }
async function audit(client: PoolClient, actor: string | null, action: string, target: string) {
  await client.query("INSERT INTO audit_log(actor_id,action,target_id) VALUES($1,$2,$3)", [actor, action, target]);
}
export function requireStaff(user: User) {
  if (!user.verified_at || user.staff_status !== "approved") throw new ManagementError("Acceso exclusivo de staff aprobado.", 403);
}
export async function requireParticipant(client: PoolClient, id: string) {
  const found = await client.query<{ is_owner: boolean; staff_status: User["staff_status"] }>(
    "SELECT is_owner,staff_status FROM users WHERE id=$1 FOR UPDATE", [id]);
  const person = found.rows[0];
  if (!person || person.is_owner || ["pending", "approved"].includes(person.staff_status)) {
    throw new ManagementError("El responsable y el staff, incluidas las solicitudes pendientes, no pueden participar en equipos.", 403);
  }
}
export async function sessionUser(value: string | undefined): Promise<User | undefined> {
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return undefined;
  const result = await database().query<User>(
    `SELECT u.id,u.email,u.first_name,u.last_name,u.verified_at,u.staff_status,u.is_owner
     FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled_at IS NULL`, [digest(value)]);
  return result.rows[0];
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
  const community = input.staff === true ? text(input.community, "Comunidad", 120) : null;
  return transaction(async client => {
    const id = randomUUID();
    await client.query(`INSERT INTO users(id,email,first_name,last_name,password_hash,staff_status,community,terms_version,accepted_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())`, [id, address, first, last, credential, community ? "pending" : "none", community, TERMS_VERSION]);
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
      await client.query("UPDATE teams SET captain_active=true WHERE captain_id=$1 AND NOT captain_active AND EXISTS(SELECT 1 FROM captain_changes c WHERE c.team_id=teams.id AND c.next_id=$1 AND c.status='activation')", [row.user_id]);
      await client.query("UPDATE captain_changes SET status='approved' WHERE next_id=$1 AND status='activation'", [row.user_id]);
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
    await client.query("UPDATE invitations SET status='cancelled' WHERE team_id=$1 AND status='pending' AND expires_at<=now()", [team.id]);
    const occupied = await client.query<{ count: string }>(
      `SELECT (SELECT count(*) FROM members WHERE team_id=$1 AND active)+
       (SELECT count(*) FROM invitations WHERE team_id=$1 AND status='pending' AND event_id IS NULL) AS count`, [team.id]);
    if (Number(occupied.rows[0].count) >= 4) throw new ManagementError("El equipo ya tiene sus cuatro plazas ocupadas o invitadas.");
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
    const count = await client.query<{ count: string }>("SELECT count(*) FROM members WHERE team_id=$1 AND active", [found.team_id]);
    if (Number(count.rows[0].count) >= 4) throw new ManagementError("El equipo está completo.");
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
    const count = await client.query<{ count: string }>(
      "SELECT count(*) FROM members m JOIN users u ON u.id=m.user_id WHERE team_id=$1 AND m.active AND verified_at IS NOT NULL AND u.disabled_at IS NULL AND u.accepted_at IS NOT NULL", [team.id]);
    if (Number(count.rows[0].count) !== 4) throw new ManagementError("Necesitas cuatro integrantes registrados y con correo confirmado.");
    await client.query("UPDATE teams SET status='pending',review_reason=NULL WHERE id=$1", [team.id]);
    await audit(client, user.id, "team.submitted", team.id);
  });
}

export async function renameTeam(user: User, input: Input) {
  const name = teamName(input.name);
  await transaction(async client => {
    const team = await captainTeam(client, user, text(input.teamId, "Equipo", 36));
    if (!["draft", "correction"].includes(team.status)) throw new ManagementError("No puedes cambiar el nombre en este estado.");
    await client.query("UPDATE teams SET name=$2,name_key=$3 WHERE id=$1", [team.id, name.name, name.key]);
    await audit(client, user.id, "team.renamed", team.id);
  });
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
    const actor = await client.query<User>("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const current = actor.rows[0];
    if (!current) throw new ManagementError("Cuenta no disponible.", 403);
    requireStaff(current);
    const id = uuid(input.id);
    if (input.kind === "staff") {
      const status = input.status;
      if (status !== "approved" && status !== "removed") throw new ManagementError("Estado no válido.");
      if (status === "removed" && !current.is_owner) throw new ManagementError("Solo el responsable inicial puede dar de baja a otro staff.", 403);
      if (status === "approved") {
        const participation = await client.query(
          "SELECT 1 FROM members WHERE user_id=$1 AND active UNION ALL SELECT 1 FROM substitutions WHERE user_id=$1", [id]);
        if (participation.rowCount) throw new ManagementError("No se puede aprobar staff mientras la persona esté vinculada a un equipo.", 409);
      }
      const result = await client.query<{ email: string }>(
        `UPDATE users SET staff_status=$2 WHERE id=$1 AND NOT is_owner
         AND staff_status=ANY($3::text[]) AND verified_at IS NOT NULL RETURNING email`,
        [id, status, status === "approved" ? ["pending"] : ["pending", "approved"]]);
      if (!result.rowCount) throw new ManagementError("La solicitud ya no admite esa acción.");
      if (status === "approved") {
        const person = await client.query<{ community: string | null }>("SELECT community FROM users WHERE id=$1", [id]);
        const community = person.rows[0].community;
        if (community) {
          await client.query("INSERT INTO staff_communities(name) VALUES($1) ON CONFLICT DO NOTHING", [community]);
          const active = await client.query("SELECT 1 FROM staff_communities WHERE name=$1 AND active", [community]);
          if (!active.rowCount) throw new ManagementError("La comunidad está dada de baja.");
          await client.query("INSERT INTO staff_memberships(user_id,community) VALUES($1,$2) ON CONFLICT(user_id,community) DO UPDATE SET active=true", [id, community]);
        }
      } else await client.query("UPDATE staff_memberships SET active=false WHERE user_id=$1", [id]);
      await queueMail(client, result.rows[0].email, "Actualización de acceso staff", `Tu solicitud de staff está ${status === "approved" ? "aprobada" : "dada de baja"}. Consulta ${appUrl()}/mi-equipo`);
      await audit(client, user.id, `staff.${status}`, id);
    } else if (input.kind === "team") {
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
  const members = team ? await database().query<Member & { original: boolean; active: boolean }>("SELECT u.id,u.first_name,u.last_name,u.email,m.original,m.active FROM members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 ORDER BY joined_at", [team.id]) : { rows: [] };
  const invitations = team && team.is_captain ? await database().query<Invitation>("SELECT id,email,status,expires_at FROM invitations WHERE team_id=$1 ORDER BY created_at", [team.id]) : { rows: [] };
  const season = await database().query<{ retired_at: Date | null }>("SELECT retired_at FROM seasons WHERE id='2027'");
  return { user, team: team ?? null, members: members.rows, invitations: invitations.rows, retired: Boolean(season.rows[0]?.retired_at) };
}
export async function staffDashboard(user: User) {
  requireStaff(user);
  const teams = await database().query<Team & { captain_email: string; members: Member[] }>(
    `SELECT t.*,u.email AS captain_email,
      (SELECT json_agg(json_build_object('id',p.id,'first_name',p.first_name,'last_name',p.last_name,'email',p.email))
       FROM members m JOIN users p ON p.id=m.user_id WHERE m.team_id=t.id) AS members
     FROM teams t JOIN users u ON u.id=t.captain_id WHERE t.status='pending' ORDER BY t.created_at`);
  const staff = await database().query<StaffApplicant>("SELECT id,email,first_name,last_name,community,staff_status FROM users WHERE verified_at IS NOT NULL AND staff_status=ANY($1::text[]) AND NOT is_owner ORDER BY created_at",
    [user.is_owner ? ["pending", "approved"] : ["pending"]]);
  const mails = await database().query<MailSummary>("SELECT id,recipient,subject,status,last_error,created_at FROM mail_outbox WHERE status IN ('pending','failed') ORDER BY created_at LIMIT 100");
  return { teams: teams.rows, staff: staff.rows, mails: mails.rows };
}
