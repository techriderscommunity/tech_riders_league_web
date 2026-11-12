import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database, transaction } from "./db.ts";
import { digest, verifyPassword, token } from "./crypto.ts";
import { accountMail, appUrl, queueMail } from "./mail.ts";
import { requireParticipant, requireStaff, type User } from "./service.ts";
import { email, uuid, text, password, ManagementError } from "./validation.ts";

type Input = Record<string, unknown>;
export interface Event { id: string; name: string; ordinal: number; closed: boolean; voucher_limit: number; evaluation_closed: boolean }
export interface RosterPerson {
  id: string; first_name: string; last_name: string; email: string; original: boolean;
  luma: boolean; present: boolean; at_end: boolean;
}
export interface Submission {
  id: string; team_id: string; event_id: string; kind: string; url: string;
  submitted_at: Date; status: string; reason: string | null; current: boolean;
  commit_sha: string | null; branch: string | null; github_full_name: string | null; submitted_by: string | null;
}
export interface Challenge { event_id: string; title: string; instructions: string; deadline: Date | null; status: string; version: number; allow_resubmission: boolean }
export interface RankedTeam { id: string; equipo: string; puntos: number; posicion: number }
interface ScoreRow { id: string; equipo: string; puntos: number; sort_key: string }
interface OperationalTeam { id: string; name: string; status: string; captain_id: string; captain_active: boolean }
export interface CaptainChange { id: string; team_id: string; previous_id: string; next_id: string; status: string; reason: string; review_reason: string | null }

function flag(value: unknown) {
  if (typeof value !== "boolean") throw new ManagementError("El check debe indicar sí o no.");
  return value;
}
function choice(value: unknown, options: readonly string[]) {
  const result = text(value, "Estado", 30);
  if (!options.includes(result)) throw new ManagementError("Estado no permitido.");
  return result;
}
function link(value: unknown) {
  const result = text(value, "Enlace", 2000);
  let parsed: URL;
  try { parsed = new URL(result); } catch { throw new ManagementError("Introduce un enlace HTTPS válido."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new ManagementError("El enlace debe usar HTTPS sin credenciales.");
  return result;
}
async function audit(client: PoolClient, actor: User, action: string, target: string | null, details: Input = {}) {
  await client.query("INSERT INTO audit_log(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)", [actor.id, action, target, JSON.stringify(details)]);
}
export async function run<T>(user: User, staff: boolean, work: (client: PoolClient, actor: User) => Promise<T>) {
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(742028)");
    const found = await client.query<User & { disabled_at: Date | null }>("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const actor = found.rows[0];
    if (!actor || actor.disabled_at || !actor.verified_at) throw new ManagementError("La cuenta ya no está activa.", 403);
    if (staff) requireStaff(actor);
    return work(client, actor);
  });
}
export async function event(client: PoolClient, id: unknown, writing = true): Promise<Event> {
  const found = await client.query<Event>("SELECT e.* FROM league_events e JOIN seasons s ON s.id=e.season WHERE e.id=$1 AND s.retired_at IS NULL FOR UPDATE OF e", [text(id, "Mundo", 30)]);
  const row = found.rows[0];
  if (!row) throw new ManagementError("Mundo no disponible.");
  if (writing && row.evaluation_closed) throw new ManagementError("La evaluación está cerrada; no se pueden alterar entregas ni resultados.");
  if (writing && row.closed) throw new ManagementError("El evento está cerrado. Staff debe reabrirlo con motivo antes de corregir.");
  return row;
}
export async function team(client: PoolClient, id: unknown, actor?: User): Promise<OperationalTeam> {
  if (actor) await requireParticipant(client, actor.id);
  const found = await client.query<OperationalTeam>("SELECT * FROM teams WHERE id=$1 FOR UPDATE", [uuid(id)]);
  const row = found.rows[0];
  if (!row || row.status !== "approved") throw new ManagementError("Se necesita un equipo aprobado.");
  const season = await client.query("SELECT 1 FROM seasons WHERE id='2027' AND retired_at IS NULL");
  if (!season.rowCount) throw new ManagementError("La temporada está archivada.");
  if (actor && (row.captain_id !== actor.id || !row.captain_active)) throw new ManagementError("Solo el capitán activo puede realizar esta acción.", 403);
  return row;
}
async function participantAvailable(client: PoolClient, person: string, teamId: string) {
  await requireParticipant(client, person);
  const conflicts = await client.query(
    `SELECT 1 FROM members WHERE user_id=$1 AND active AND season='2027'
     UNION ALL SELECT 1 FROM substitutions WHERE user_id=$1 AND team_id<>$2`, [person, teamId]);
  if (conflicts.rowCount) throw new ManagementError("La persona ya pertenece a un equipo o sustituye a otro.");
}
export async function invalidate(client: PoolClient, eventId?: string) {
  const publishing = await client.query("SELECT 1 FROM solution_publications WHERE status='creating' AND ($1::text IS NULL OR event_id=$1)", [eventId ?? null]);
  if (publishing.rowCount) throw new ManagementError("Hay una publicación GitHub en curso; espera su resultado antes de corregir.", 409);
  await client.query("UPDATE league_events SET evaluation_closed=false WHERE evaluation_closed AND ($1::text IS NULL OR id=$1)", [eventId ?? null]);
  await client.query("UPDATE publications SET current=false WHERE current AND (scope='global' OR $1::text IS NULL OR scope=$1)", [eventId ?? null]);
  const events = await client.query<Event>("SELECT * FROM league_events WHERE $1::text IS NULL OR id=$1 ORDER BY ordinal", [eventId ?? null]);
  for (const e of events.rows) await recalculate(client, e);
}

export async function roster(client: PoolClient, teamId: string, eventId: string): Promise<RosterPerson[]> {
  const found = await client.query<RosterPerson>(
    `SELECT u.id,u.first_name,u.last_name,u.email,r.original,
       COALESCE(a.luma,false) AS luma,COALESCE(a.present,false) AS present,COALESCE(a.at_end,false) AS at_end
     FROM (
       SELECT m.user_id,m.original FROM members m WHERE m.team_id=$1 AND
         (m.active OR EXISTS(SELECT 1 FROM attendance history WHERE history.team_id=$1 AND history.event_id=$2 AND history.user_id=m.user_id AND history.present))
         AND NOT EXISTS(SELECT 1 FROM substitutions s WHERE s.team_id=$1 AND s.event_id=$2 AND s.original_id=m.user_id)
       UNION ALL SELECT user_id,false FROM substitutions WHERE team_id=$1 AND event_id=$2
     ) r JOIN users u ON u.id=r.user_id AND u.disabled_at IS NULL
     LEFT JOIN attendance a ON a.team_id=$1 AND a.event_id=$2 AND a.user_id=u.id ORDER BY r.original DESC,u.id`,
    [teamId, eventId]);
  return found.rows;
}
export async function eligibility(client: PoolClient, teamId: string) {
  const found = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM (
       SELECT a.event_id FROM attendance a JOIN league_events e ON e.id=a.event_id
       JOIN members m ON m.team_id=a.team_id AND m.user_id=a.user_id
       WHERE a.team_id=$1 AND a.present AND a.luma AND m.original AND e.ordinal<5
       GROUP BY a.event_id HAVING count(*)>=3
     ) valid`, [teamId]);
  return { worlds: found.rows[0].count, eligible: found.rows[0].count >= 3 };
}
export async function allowedAtFinal(client: PoolClient, eventRow: Event, teamId: string) {
  if (eventRow.ordinal === 5 && !(await eligibility(client, teamId)).eligible) throw new ManagementError("Este equipo todavía no cumple tres mundos con tres originales para la final.");
}
export async function inviteSubstitute(user: User, input: Input) {
  return run(user, false, async (client, actor) => {
    const t = await team(client, input.teamId, actor.staff_status === "approved" ? undefined : actor);
    const e = await event(client, input.eventId);
    const originalId = uuid(input.originalId);
    const member = await client.query("SELECT 1 FROM members WHERE team_id=$1 AND user_id=$2 AND active AND original", [t.id, originalId]);
    if (!member.rowCount) throw new ManagementError("El sustituido debe ser uno de los originales activos.");
    const address = email(input.email);
    const existing = await client.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [address]);
    if (existing.rows[0]) await participantAvailable(client, existing.rows[0].id, t.id);
    const occupied = await client.query("SELECT 1 FROM substitutions WHERE team_id=$1 AND event_id=$2", [t.id, e.id]);
    if (occupied.rowCount) throw new ManagementError("Ya hay un sustituto. Cancélalo antes de invitar otro.");
    await client.query("UPDATE invitations SET status='cancelled' WHERE team_id=$1 AND event_id=$2 AND status='pending' AND expires_at<=now()", [t.id, e.id]);
    const value = token(), id = randomUUID();
    await client.query("INSERT INTO invitations(id,team_id,email,token_hash,expires_at,event_id,original_id) VALUES($1,$2,$3,$4,now()+interval '7 days',$5,$6)",
      [id, t.id, address, digest(value), e.id, originalId]);
    await queueMail(client, address, "Sustitución en la League",
      `Te han invitado como sustituto de ${t.name} en ${e.name}. Regístrate y acepta personalmente con este correo: ${appUrl()}/mi-equipo?invitacion=${value}`);
    await audit(client, actor, "substitution.invited", id, { eventId: e.id, originalId });
  });
}
export async function acceptSubstitute(user: User, input: Input) {
  return run(user, false, async (client, actor) => {
    const found = await client.query<{ id: string; team_id: string; event_id: string; original_id: string; email: string }>(
      "SELECT * FROM invitations WHERE token_hash=$1 AND event_id IS NOT NULL AND status='pending' AND expires_at>now() FOR UPDATE", [digest(text(input.token, "Invitación", 64))]);
    const invite = found.rows[0];
    if (!invite || invite.email !== actor.email) throw new ManagementError("Invitación caducada, utilizada o destinada a otro correo.");
    await team(client, invite.team_id);
    await event(client, invite.event_id);
    await participantAvailable(client, actor.id, invite.team_id);
    const original = await client.query("SELECT 1 FROM members WHERE team_id=$1 AND user_id=$2 AND original AND active", [invite.team_id, invite.original_id]);
    if (!original.rowCount) throw new ManagementError("El original ya no está activo; solicita otra invitación.");
    const marked = await client.query("SELECT 1 FROM attendance WHERE team_id=$1 AND event_id=$2 AND user_id=$3 AND present", [invite.team_id, invite.event_id, invite.original_id]);
    if (marked.rowCount) throw new ManagementError("El original está marcado como presente; staff debe corregirlo primero.");
    await client.query("INSERT INTO substitutions(team_id,event_id,original_id,user_id) VALUES($1,$2,$3,$4)", [invite.team_id, invite.event_id, invite.original_id, actor.id]);
    await client.query("DELETE FROM attendance WHERE team_id=$1 AND event_id=$2 AND user_id=$3", [invite.team_id, invite.event_id, invite.original_id]);
    await client.query("UPDATE invitations SET status='accepted' WHERE id=$1", [invite.id]);
    await invalidate(client, invite.event_id);
    await audit(client, actor, "substitution.accepted", invite.id);
  });
}
export async function cancelSubstitute(user: User, input: Input) {
  return run(user, false, async (client, actor) => {
    const t = await team(client, input.teamId, actor.staff_status === "approved" ? undefined : actor);
    const e = await event(client, input.eventId);
    const reason = text(input.reason, "Motivo", 1000);
    const marked = await client.query("SELECT 1 FROM attendance a JOIN substitutions s ON s.team_id=a.team_id AND s.event_id=a.event_id AND s.user_id=a.user_id WHERE s.team_id=$1 AND s.event_id=$2 AND a.present", [t.id, e.id]);
    if (marked.rowCount) throw new ManagementError("El sustituto figura como presente; staff debe corregir su asistencia primero.");
    await client.query("DELETE FROM attendance WHERE team_id=$1 AND event_id=$2 AND user_id IN (SELECT user_id FROM substitutions WHERE team_id=$1 AND event_id=$2)", [t.id, e.id]);
    await client.query("DELETE FROM substitutions WHERE team_id=$1 AND event_id=$2", [t.id, e.id]);
    await client.query("UPDATE invitations SET status='cancelled' WHERE team_id=$1 AND event_id=$2 AND status='pending'", [t.id, e.id]);
    await invalidate(client, e.id);
    await audit(client, actor, "substitution.cancelled", t.id, { eventId: e.id, reason });
  });
}
export async function markAttendance(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const t = await team(client, input.teamId), e = await event(client, input.eventId);
    const person = uuid(input.userId), luma = flag(input.luma), present = flag(input.present), atEnd = flag(input.atEnd);
    const reason = text(input.reason, "Motivo de la comprobación", 1000);
    const people = await roster(client, t.id, e.id);
    if (!people.some(p => p.id === person)) throw new ManagementError("La persona no forma parte de la plantilla de este mundo.");
    if (present) await requireParticipant(client, person);
    if ((present && !luma) || (atEnd && !present)) throw new ManagementError("Asistencia exige Luma validado; presencia al final exige asistencia.");
    if (present && people.filter(p => p.id !== person && p.present).length >= 4) throw new ManagementError("Solo pueden acudir cuatro personas por equipo y mundo.");
    if (present) await allowedAtFinal(client, e, t.id);
    const voucher = await client.query("SELECT 1 FROM awards WHERE event_id=$1 AND user_id=$2 AND kind='voucher'", [e.id, person]);
    if (!atEnd && voucher.rowCount) throw new ManagementError("Retira primero la adjudicación del voucher para corregir la presencia.");
    await client.query(`INSERT INTO attendance(team_id,event_id,user_id,luma,present,at_end,reviewer_id) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(team_id,event_id,user_id) DO UPDATE SET luma=$4,present=$5,at_end=$6,reviewer_id=$7,updated_at=now()`,
      [t.id, e.id, person, luma, present, atEnd, actor.id]);
    await invalidate(client, e.id);
    if (e.ordinal < 5) await invalidate(client, "hackathon");
    await audit(client, actor, "attendance.updated", t.id, { eventId: e.id, person, luma, present, atEnd, reason });
  });
}
export async function requestCaptain(user: User, input: Input) {
  return run(user, false, async (client, actor) => {
    const t = await team(client, input.teamId, actor);
    const nextId = uuid(input.nextId), reason = text(input.reason, "Motivo", 1000);
    const next = await client.query("SELECT 1 FROM members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 AND m.user_id=$2 AND m.original AND m.active AND u.disabled_at IS NULL AND u.verified_at IS NOT NULL", [t.id, nextId]);
    if (!next.rowCount || nextId === actor.id) throw new ManagementError("El nuevo capitán debe ser otro de los cuatro originales activos.");
    await requireParticipant(client, nextId);
    const id = randomUUID();
    await client.query("INSERT INTO captain_changes(id,team_id,previous_id,next_id,reason) VALUES($1,$2,$3,$4,$5)", [id, t.id, actor.id, nextId, reason]);
    await audit(client, actor, "captain.requested", id);
  });
}
export async function reviewCaptain(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const found = await client.query<CaptainChange>("SELECT * FROM captain_changes WHERE id=$1 AND status='pending' FOR UPDATE", [uuid(input.id)]);
    const change = found.rows[0];
    if (!change) throw new ManagementError("La solicitud ya no está pendiente.");
    const reason = text(input.reason, "Motivo de revisión", 1000);
    const status = choice(input.status, ["approved", "rejected"]);
    const t = await team(client, change.team_id);
    if (t.captain_id !== change.previous_id) throw new ManagementError("El capitán ha cambiado; la solicitud está obsoleta.");
    if (status === "approved") {
      await requireParticipant(client, change.next_id);
      const next = await client.query<{ email: string }>("SELECT u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 AND m.user_id=$2 AND m.original AND m.active AND u.disabled_at IS NULL", [t.id, change.next_id]);
      if (!next.rows[0]) throw new ManagementError("El candidato ya no es un original activo.");
      await client.query("UPDATE teams SET captain_id=$2,captain_active=false WHERE id=$1", [t.id, change.next_id]);
      await client.query("DELETE FROM sessions WHERE user_id=$1", [change.next_id]);
      await accountMail(client, change.next_id, next.rows[0].email, "reset");
    }
    await client.query("UPDATE captain_changes SET status=$2,review_reason=$3 WHERE id=$1", [change.id, status === "approved" ? "activation" : "rejected", reason]);
    await audit(client, actor, `captain.${status}`, change.id, { reason });
  });
}
export async function replaceMember(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const t = await team(client, input.teamId);
    const previous = uuid(input.previousId), nextId = uuid(input.nextId), reason = text(input.reason, "Fuerza mayor", 1000);
    if (previous === t.captain_id) throw new ManagementError("Aprueba y activa el cambio de capitán antes de retirar al actual.");
    const old = await client.query("SELECT 1 FROM members WHERE team_id=$1 AND user_id=$2 AND active", [t.id, previous]);
    const next = await client.query("SELECT 1 FROM users WHERE id=$1 AND verified_at IS NOT NULL AND disabled_at IS NULL AND accepted_at IS NOT NULL", [nextId]);
    if (!old.rowCount || !next.rowCount || previous === nextId) throw new ManagementError("Integrantes no válidos.");
    await requireParticipant(client, nextId);
    const changes = await client.query("SELECT 1 FROM substitutions WHERE user_id=ANY($1::uuid[])", [[previous, nextId]]);
    if (changes.rowCount) throw new ManagementError("Resuelve primero las sustituciones vinculadas a estas personas.");
    const oldTeams = await client.query<{ team_id: string }>("SELECT team_id FROM members WHERE user_id=$1 AND active", [nextId]);
    if (oldTeams.rows[0]) {
      const source = await client.query<OperationalTeam>("SELECT * FROM teams WHERE id=$1 FOR UPDATE", [oldTeams.rows[0].team_id]);
      if (source.rows[0].id === t.id || source.rows[0].captain_id === nextId) throw new ManagementError("El relevo no puede ser un integrante activo del destino ni capitán del equipo de origen.");
      await client.query("UPDATE members SET active=false WHERE user_id=$1 AND active", [nextId]);
    }
    await client.query("UPDATE members SET active=false WHERE team_id=$1 AND user_id=$2", [t.id, previous]);
    await client.query("INSERT INTO members(team_id,user_id,original) VALUES($1,$2,false) ON CONFLICT(team_id,user_id) DO UPDATE SET active=true", [t.id, nextId]);
    await client.query("INSERT INTO membership_changes(id,team_id,previous_id,next_id,reason,reviewer_id) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), t.id, previous, nextId, reason, actor.id]);
    await invalidate(client);
    await audit(client, actor, "member.replaced", t.id, { previous, nextId, reason });
  });
}
export async function saveChallenge(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const e = await event(client, input.eventId);
    const status = choice(input.status, ["draft", "published", "closed"]);
    const title = text(input.title, "Título", 200), instructions = text(input.instructions, "Enunciado", 4000);
    let deadline: Date | null = null;
    if (input.deadline) {
      deadline = new Date(text(input.deadline, "Plazo", 60));
      if (!Number.isFinite(deadline.getTime())) throw new ManagementError("Plazo no válido.");
    }
    const previous = await client.query<Challenge>("SELECT * FROM challenges WHERE event_id=$1 FOR UPDATE", [e.id]);
    if (previous.rows[0] && Number(input.version) !== previous.rows[0].version) throw new ManagementError("El reto ha cambiado. Recarga antes de guardar.", 409);
    if (status === "published" && !deadline) throw new ManagementError("Una misión publicada debe tener deadline explícito.");
    await client.query(`INSERT INTO challenges(event_id,title,instructions,deadline,status,allow_resubmission) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(event_id) DO UPDATE SET title=$2,instructions=$3,deadline=$4,status=$5,allow_resubmission=$6,version=challenges.version+1`, [e.id, title, instructions, deadline, status, input.allowResubmission !== false]);
    await audit(client, actor, "challenge.updated", null, { eventId: e.id, title, status, deadline });
  });
}
export async function submitEvidence(user: User, input: Input) {
  if (input.kind !== "photo") throw new ManagementError("Las misiones solo se entregan mediante repositorio GitHub privado y SHA; no se admiten enlaces de código.");
  return run(user, false, async (client, actor) => {
    const t = await team(client, input.teamId, actor), e = await event(client, input.eventId);
    await allowedAtFinal(client, e, t.id);
    const kind = choice(input.kind, ["challenge", "photo"]), url = link(input.url);
    const challenge = await client.query<Challenge>("SELECT * FROM challenges WHERE event_id=$1", [e.id]);
    const c = challenge.rows[0];
    if (kind === "challenge" && (!c || c.status !== "published" || (c.deadline && new Date(c.deadline) < new Date()))) throw new ManagementError("El reto no está abierto o ha vencido el plazo.");
    const previous = await client.query<Submission>("SELECT * FROM submissions WHERE team_id=$1 AND event_id=$2 AND kind=$3 AND current FOR UPDATE", [t.id, e.id, kind]);
    if (previous.rows[0] && previous.rows[0].id !== input.previousId) throw new ManagementError("La entrega ha cambiado; recarga antes de reenviar.", 409);
    await client.query("UPDATE submissions SET current=false WHERE team_id=$1 AND event_id=$2 AND kind=$3 AND current", [t.id, e.id, kind]);
    const id = randomUUID();
    await client.query("INSERT INTO submissions(id,team_id,event_id,kind,url,challenge_version) VALUES($1,$2,$3,$4,$5,$6)", [id, t.id, e.id, kind, url, kind === "challenge" ? c.version : null]);
    await invalidate(client, e.id);
    await audit(client, actor, "submission.created", id, { eventId: e.id, kind });
  });
}
export async function reviewEvidence(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const s = await client.query<Submission>("SELECT * FROM submissions WHERE id=$1 AND current FOR UPDATE", [uuid(input.id)]);
    const row = s.rows[0];
    if (!row) throw new ManagementError("La entrega ha sido sustituida por una nueva versión.");
    const e = await event(client, row.event_id, false);
    if (e.evaluation_closed) throw new ManagementError("Reabre la evaluación con motivo antes de cambiar una evaluación.");
    if (row.commit_sha) {
      const due = await client.query<{ ended: boolean }>("SELECT deadline IS NOT NULL AND deadline<=clock_timestamp() AS ended FROM challenges WHERE event_id=$1", [e.id]);
      if (!due.rows[0]?.ended) throw new ManagementError("Las misiones se evalúan después del deadline.");
    } else if (e.closed) throw new ManagementError("El evento está cerrado.");
    const status = choice(input.status, ["approved", "correction", "rejected"]), reason = text(input.reason, "Motivo", 1000);
    await client.query("UPDATE submissions SET status=$2,reason=$3,reviewer_id=$4 WHERE id=$1", [row.id, status, reason, actor.id]);
    await invalidate(client, row.event_id);
    await audit(client, actor, "submission.reviewed", row.id, { status, reason });
  });
}
function fingerprint(rows: ScoreRow[]) {
  return digest(JSON.stringify(rows.map(r => [r.id, r.puntos, r.sort_key])));
}
async function orderRows(client: PoolClient, scope: string, rows: ScoreRow[]) {
  const sorted = [...rows].sort((a, b) => scope.startsWith("bonus:") ? a.sort_key.localeCompare(b.sort_key) : b.puntos - a.puntos || a.id.localeCompare(b.id));
  const fp = fingerprint(sorted);
  const hasTies = sorted.some((r, i) => i > 0 && (scope.startsWith("bonus:") ? r.sort_key === sorted[i - 1].sort_key : r.puntos === sorted[i - 1].puntos));
  if (!hasTies) return { rows: sorted, pending: false, fingerprint: fp };
  const decision = await client.query<{ team_order: string[] }>("SELECT team_order FROM tie_decisions WHERE scope=$1 AND fingerprint=$2", [scope, fp]);
  if (!decision.rows[0]) return { rows: sorted, pending: true, fingerprint: fp };
  const ids = decision.rows[0].team_order;
  return { rows: ids.map(id => sorted.find(row => row.id === id)!), pending: false, fingerprint: fp };
}
async function recalculate(client: PoolClient, e: Event) {
  const teams = await client.query<{ id: string; name: string }>("SELECT id,name FROM teams WHERE status='approved' ORDER BY id");
  await client.query("DELETE FROM score_entries WHERE event_id=$1", [e.id]);
  const validSubmissions: ScoreRow[] = [];
  for (const t of teams.rows) {
    const eligible = e.ordinal !== 5 || (await eligibility(client, t.id)).eligible;
    const people = await roster(client, t.id, e.id);
    const present = people.filter(p => p.original && p.present && p.luma).length >= 3;
    const entries = await client.query<Submission & { order_time: string }>(`SELECT *,to_char(submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') AS order_time
      FROM submissions WHERE team_id=$1 AND event_id=$2 AND current AND status='approved'`, [t.id, e.id]);
    const photo = entries.rows.find(s => s.kind === "photo"), challenge = entries.rows.find(s => s.kind === "challenge");
    for (const [concept, points] of [["attendance", eligible && present ? 50 : 0], ["photo", eligible && photo ? 50 : 0], ["challenge", eligible && challenge ? 100 : 0]] as const) {
      await client.query("INSERT INTO score_entries(team_id,event_id,concept,points) VALUES($1,$2,$3,$4)", [t.id, e.id, concept, points]);
    }
    if (eligible && challenge) validSubmissions.push({ id: t.id, equipo: t.name, puntos: 0, sort_key: challenge.order_time });
  }
  const bonus = await orderRows(client, `bonus:${e.id}`, validSubmissions);
  if (!bonus.pending) {
    for (let index = 0; index < Math.min(3, bonus.rows.length); index++) {
      await client.query("INSERT INTO score_entries(team_id,event_id,concept,points) VALUES($1,$2,'bonus',$3)", [bonus.rows[index].id, e.id, [100, 75, 50][index]]);
    }
  }
  const found = await client.query<ScoreRow>(
    `SELECT t.id,t.name AS equipo,SUM(s.points)::int AS puntos,'' AS sort_key
     FROM teams t JOIN score_entries s ON s.team_id=t.id
     WHERE s.event_id=$1 AND t.status='approved' GROUP BY t.id HAVING SUM(s.points)>0 ORDER BY t.id`, [e.id]);
  return { ...await orderRows(client, e.id, found.rows), bonus };
}
async function globalRows(client: PoolClient) {
  const result = await client.query<{ ranking: RankedTeam[] }>("SELECT ranking FROM publications WHERE current AND scope<>'global'");
  const aggregate = new Map<string, ScoreRow>();
  for (const publication of result.rows) for (const row of publication.ranking) {
    const previous = aggregate.get(row.id);
    aggregate.set(row.id, { id: row.id, equipo: row.equipo, puntos: (previous?.puntos ?? 0) + row.puntos, sort_key: "" });
  }
  return { ...await orderRows(client, "global", [...aggregate.values()]), bonus: null };
}
export async function resolveTie(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const scope = text(input.scope, "Clasificación", 40), reason = text(input.reason, "Motivo del desempate", 1000);
    const preview = scope === "global" ? await globalRows(client) : await recalculate(client, await event(client, scope.replace(/^bonus:/, ""), false));
    const source = scope.startsWith("bonus:") && preview.bonus ? preview.bonus : preview;
    if (!source.pending || input.fingerprint !== source.fingerprint) throw new ManagementError("El empate ha cambiado o ya está resuelto. Recarga.", 409);
    const ids = text(input.order, "Orden de equipos (identificadores separados por comas)", 4000).split(",").map(id => uuid(id.trim()));
    if (ids.length !== source.rows.length || new Set(ids).size !== ids.length || ids.some(id => !source.rows.some(r => r.id === id))) throw new ManagementError("El orden debe incluir cada equipo de la vista previa una sola vez.");
    const reordered = ids.map(id => source.rows.find(r => r.id === id)!);
    if (reordered.some((r, i) => scope.startsWith("bonus:") ? r.sort_key !== source.rows[i].sort_key : r.puntos !== source.rows[i].puntos)) throw new ManagementError("Solo puedes cambiar el orden dentro de grupos empatados.");
    await client.query("INSERT INTO tie_decisions(scope,fingerprint,team_order,reason,reviewer_id) VALUES($1,$2,$3,$4,$5)", [scope, source.fingerprint, JSON.stringify(ids), reason, actor.id]);
    if (scope === "global") await client.query("UPDATE publications SET current=false WHERE current AND scope='global'");
    else await invalidate(client, scope.replace(/^bonus:/, ""));
    await audit(client, actor, "tie.resolved", null, { scope, reason, order: ids });
  });
}
export async function publishResults(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const scope = text(input.scope, "Clasificación", 30);
    const publishing = await client.query("SELECT 1 FROM solution_publications WHERE status='creating' AND ($1='global' OR event_id=$1)", [scope]);
    if (publishing.rowCount) throw new ManagementError("Espera a que finalice la publicación GitHub antes de cambiar el ranking.", 409);
    if (scope !== "global") {
      const git = await client.query("SELECT 1 FROM submissions WHERE event_id=$1 AND commit_sha IS NOT NULL AND current", [scope]);
      if (git.rowCount) {
        const evaluated = await event(client, scope, false);
        if (!evaluated.evaluation_closed) throw new ManagementError("Cierra la evaluación de las misiones antes de publicar el ranking.");
      }
    }
    const preview = scope === "global" ? await globalRows(client) : await recalculate(client, await event(client, scope, false));
    if (preview.pending || preview.bonus?.pending) throw new ManagementError("Resuelve los empates antes de publicar posiciones o bonus.");
    if (input.fingerprint !== preview.fingerprint) throw new ManagementError("Los resultados han cambiado. Revisa la nueva vista previa.", 409);
    const ranking: RankedTeam[] = preview.rows.map((row, index) => ({ id: row.id, equipo: row.equipo, puntos: row.puntos, posicion: index + 1 }));
    {
      const awarded = await client.query<{ team_id: string }>("SELECT team_id FROM awards WHERE kind='prize' AND (($1='global' AND event_id IS NULL) OR event_id=$1)", [scope]);
      if (awarded.rows.some(a => !ranking.some(t => t.id === a.team_id && t.posicion <= 3))) throw new ManagementError("Revisa y retira los premios de equipos que han salido del podio antes de republicar.");
    }
    await client.query("UPDATE publications SET current=false WHERE current AND (scope=$1 OR scope='global')", [scope]);
    await client.query("INSERT INTO publications(id,scope,ranking,reviewer_id) VALUES($1,$2,$3,$4)", [randomUUID(), scope, JSON.stringify(ranking), actor.id]);
    await audit(client, actor, "results.published", null, { scope, fingerprint: preview.fingerprint });
  });
}
export async function setEventState(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const e = await event(client, input.eventId, false), closed = flag(input.closed), reason = text(input.reason, "Motivo", 1000);
    if (!closed && e.evaluation_closed) await invalidate(client, e.id);
    await client.query("UPDATE league_events SET closed=$2 WHERE id=$1", [e.id, closed]);
    await audit(client, actor, closed ? "event.closed" : "event.reopened", null, { eventId: e.id, reason });
  });
}
export async function award(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const reason = text(input.reason, "Motivo / comprobación", 1000);
    if (input.id) {
      const id = uuid(input.id);
      const result = input.remove === true
        ? await client.query("DELETE FROM awards WHERE id=$1 RETURNING id", [id])
        : await client.query("UPDATE awards SET delivered=$2,reason=$3,reviewer_id=$4 WHERE id=$1 RETURNING id", [id, flag(input.delivered), reason, actor.id]);
      if (!result.rowCount) throw new ManagementError("Adjudicación no disponible.");
      await audit(client, actor, input.remove ? "award.removed" : "award.delivered", id, { reason });
      return;
    }
    const kind = choice(input.kind, ["voucher", "prize"]), description = text(input.description, "Premio", 500), id = randomUUID();
    let eventId: string | null = null, person: string | null = null, teamId: string | null = null;
    if (kind === "voucher") {
      const e = await event(client, input.eventId, false);
      eventId = e.id; person = uuid(input.userId);
      await requireParticipant(client, person);
      const present = await client.query<{ team_id: string }>("SELECT team_id FROM attendance WHERE event_id=$1 AND user_id=$2 AND luma AND present AND at_end", [e.id, person]);
      const count = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM awards WHERE event_id=$1 AND kind='voucher'", [e.id]);
      if (!present.rowCount || count.rows[0].count >= e.voucher_limit) throw new ManagementError("La persona no estaba al final o ya se adjudicó el cupo de vouchers.");
      await allowedAtFinal(client, e, present.rows[0].team_id);
    } else {
      teamId = uuid(input.teamId);
      eventId = input.eventId ? (await event(client, input.eventId, false)).id : null;
      const publication = await client.query<{ ranking: RankedTeam[] }>("SELECT ranking FROM publications WHERE scope=$1 AND current", [eventId ?? "global"]);
      if (!publication.rows[0]?.ranking.some(t => t.id === teamId && t.posicion <= 3)) throw new ManagementError("El equipo debe estar en el podio publicado de esa clasificación.");
    }
    await client.query("INSERT INTO awards(id,event_id,user_id,team_id,kind,description,reason,reviewer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [id, eventId, person, teamId, kind, description, reason, actor.id]);
    await audit(client, actor, "award.assigned", id, { reason });
  });
}
export async function leaveStaff(user: User, input: Input) {
  return run(user, false, async (client, actor) => {
    if (actor.is_owner) throw new ManagementError("El responsable inicial no puede abandonar su rol sin un relevo operativo.");
    const reason = text(input.reason, "Motivo", 1000);
    await client.query("UPDATE staff_memberships SET active=false WHERE user_id=$1", [actor.id]);
    await client.query("UPDATE users SET staff_status='removed' WHERE id=$1", [actor.id]);
    await audit(client, actor, "staff.self_removed", actor.id, { reason });
  });
}
export async function communityState(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const name = text(input.name, "Comunidad", 120), active = flag(input.active), reason = text(input.reason, "Motivo oficial", 1000);
    if (!actor.is_owner && !active) throw new ManagementError("Solo el responsable inicial puede revocar una comunidad, porque da de baja a otros staff.", 403);
    await client.query("INSERT INTO staff_communities(name,active) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET active=$2", [name, active]);
    if (!active) {
      await client.query("UPDATE staff_memberships SET active=false WHERE community=$1", [name]);
      await client.query(`UPDATE users u SET staff_status='removed' WHERE NOT is_owner AND staff_status='approved'
        AND EXISTS(SELECT 1 FROM staff_memberships m WHERE m.user_id=u.id AND m.community=$1)
        AND NOT EXISTS(SELECT 1 FROM staff_memberships m JOIN staff_communities c ON c.name=m.community WHERE m.user_id=u.id AND m.active AND c.active)`, [name]);
    }
    await audit(client, actor, "community.updated", null, { name, active, reason });
  });
}
export async function addStaffCommunity(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const person = uuid(input.userId), name = text(input.name, "Comunidad", 120);
    const target = await client.query("SELECT 1 FROM users WHERE id=$1 AND staff_status='approved' AND disabled_at IS NULL", [person]);
    const community = await client.query("SELECT 1 FROM staff_communities WHERE name=$1 AND active", [name]);
    if (!target.rowCount || !community.rowCount) throw new ManagementError("Se necesita staff aprobado y comunidad activa.");
    await client.query("INSERT INTO staff_memberships(user_id,community) VALUES($1,$2) ON CONFLICT(user_id,community) DO UPDATE SET active=true", [person, name]);
    await audit(client, actor, "staff.community_added", person, { name });
  });
}
export async function requestWithdrawal(user: User, input: Input) {
  return run(user, false, async (client, actor) => {
    if (actor.is_owner) throw new ManagementError("Contacta con organización para relevar al responsable antes de tramitar su baja.");
    const id = randomUUID(), reason = text(input.reason, "Solicitud de baja", 1000);
    await client.query("INSERT INTO withdrawal_requests(id,user_id,reason) VALUES($1,$2,$3)", [id, actor.id, reason]);
    await audit(client, actor, "withdrawal.requested", id);
  });
}
export async function updateProfile(user: User, input: Input) {
  return run(user, false, async (client, actor) => {
    const first = text(input.firstName, "Nombre"), last = text(input.lastName, "Apellidos"), address = email(input.email);
    const found = await client.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [actor.id]);
    if (!await verifyPassword(password(input.currentPassword), found.rows[0].password_hash)) throw new ManagementError("Contraseña actual incorrecta.", 403);
    const existing = await client.query("SELECT 1 FROM users WHERE email=$1 AND id<>$2", [address, actor.id]);
    if (existing.rowCount) throw new ManagementError("Ese correo ya tiene una cuenta.", 409);
    await client.query("UPDATE users SET first_name=$2,last_name=$3 WHERE id=$1", [actor.id, first, last]);
    if (address !== actor.email) await accountMail(client, actor.id, address, "verify", address);
    await audit(client, actor, "profile.updated", actor.id, { emailVerificationPending: address !== actor.email });
  });
}
async function anonymize(client: PoolClient, person: string) {
  await client.query("DELETE FROM sessions WHERE user_id=$1", [person]);
  await client.query("DELETE FROM account_tokens WHERE user_id=$1", [person]);
  await client.query("UPDATE mail_outbox SET recipient='retired@invalid.example',body='',subject='Datos retirados',status=CASE WHEN status='sent' THEN 'sent' ELSE 'failed' END,last_error=NULL WHERE recipient=(SELECT email FROM users WHERE id=$1)", [person]);
  await client.query("UPDATE invitations SET email='retired@invalid.example',status='cancelled' WHERE email=(SELECT email FROM users WHERE id=$1)", [person]);
  await client.query("UPDATE users SET email=$2,first_name='Persona',last_name='retirada',password_hash='',community=NULL,accepted_at=NULL,disabled_at=now(),staff_status='removed' WHERE id=$1", [person, `${person}@retired.invalid`]);
}
export async function reviewWithdrawal(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const result = await client.query<{ id: string; user_id: string }>("SELECT id,user_id FROM withdrawal_requests WHERE id=$1 AND status='pending' FOR UPDATE", [uuid(input.id)]);
    const request = result.rows[0], reason = text(input.reason, "Motivo de resolución", 1000), status = choice(input.status, ["completed", "rejected"]);
    if (!request) throw new ManagementError("Solicitud ya resuelta.");
    if (status === "completed") {
      const target = await client.query<User>("SELECT * FROM users WHERE id=$1 FOR UPDATE", [request.user_id]);
      if (target.rows[0].is_owner || (target.rows[0].staff_status === "approved" && !actor.is_owner && actor.id !== request.user_id)) throw new ManagementError("Solo el responsable inicial puede tramitar la baja de otro staff activo.", 403);
      const captain = await client.query("SELECT 1 FROM teams WHERE captain_id=$1 AND status='approved'", [request.user_id]);
      if (captain.rowCount) throw new ManagementError("Aprueba y activa primero el cambio de capitán.");
      await client.query("UPDATE teams SET status='withdrawn',captain_active=false WHERE captain_id=$1", [request.user_id]);
      await client.query("UPDATE members SET active=false WHERE team_id IN (SELECT id FROM teams WHERE captain_id=$1 AND status='withdrawn')", [request.user_id]);
      await client.query("UPDATE invitations SET status='cancelled' WHERE team_id IN (SELECT id FROM teams WHERE captain_id=$1 AND status='withdrawn')", [request.user_id]);
      await client.query("UPDATE members SET active=false WHERE user_id=$1", [request.user_id]);
      await client.query("DELETE FROM substitutions WHERE user_id=$1 OR original_id=$1", [request.user_id]);
      await client.query("DELETE FROM attendance WHERE user_id=$1", [request.user_id]);
      await client.query("DELETE FROM awards WHERE user_id=$1", [request.user_id]);
      await client.query("UPDATE staff_memberships SET active=false WHERE user_id=$1", [request.user_id]);
      await client.query("UPDATE audit_log SET details='{}' WHERE actor_id=$1 OR target_id=$1", [request.user_id]);
      await client.query("UPDATE captain_changes SET reason='Datos retirados',review_reason=NULL WHERE previous_id=$1 OR next_id=$1", [request.user_id]);
      await client.query("UPDATE membership_changes SET reason='Datos retirados' WHERE previous_id=$1 OR next_id=$1", [request.user_id]);
      await anonymize(client, request.user_id);
      await invalidate(client);
    }
    await client.query("UPDATE withdrawal_requests SET status=$2,review_reason=$3,reason='Solicitud tramitada' WHERE id=$1", [request.id, status, reason]);
    await audit(client, actor, "withdrawal.reviewed", request.id, { status, reason });
  });
}
export async function saveContribution(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const id = input.id ? uuid(input.id) : randomUUID();
    const amount = Number(input.amountCents);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) throw new ManagementError("Importe en céntimos no válido.");
    await client.query(`INSERT INTO contributions(id,name,description,destination,amount_cents,resource_url,authorized,reviewer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(id) DO UPDATE SET name=$2,description=$3,destination=$4,amount_cents=$5,resource_url=$6,authorized=$7,reviewer_id=$8`,
      [id, text(input.name, "Colaborador", 200), text(input.description, "Aportación", 1000), text(input.destination, "Destino", 1000), amount, input.url ? link(input.url) : null, input.authorized === true, actor.id]);
    await audit(client, actor, "contribution.saved", id);
  });
}
export async function setRetention(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    if (!actor.is_owner) throw new ManagementError("Solo el responsable inicial configura el corte.", 403);
    const date = new Date(text(input.date, "Inicio de la siguiente temporada", 60));
    if (!Number.isFinite(date.getTime()) || date <= new Date("2027-01-15T00:00:00+01:00") || date > new Date("2028-01-15T00:00:00+01:00")) throw new ManagementError("El corte debe estar entre el inicio de campaña y el 15 de enero de 2028.");
    const result = await client.query("UPDATE seasons SET retention_at=$1 WHERE id='2027' AND retired_at IS NULL RETURNING id", [date]);
    if (!result.rowCount) throw new ManagementError("Temporada ya retirada.");
    await audit(client, actor, "retention.scheduled", null, { date });
  });
}
export async function retireSeason(user: User) {
  return run(user, true, async (client, actor) => {
    if (!actor.is_owner) throw new ManagementError("Solo el responsable inicial ejecuta la retirada.", 403);
    const due = await client.query("SELECT 1 FROM seasons WHERE id='2027' AND retention_at<=now() AND retired_at IS NULL FOR UPDATE");
    if (!due.rowCount) throw new ManagementError("El corte no ha llegado o ya se aplicó.");
    const publishing = await client.query("SELECT 1 FROM solution_publications WHERE status='creating'");
    if (publishing.rowCount) throw new ManagementError("Espera o recupera las publicaciones en curso antes de retirar datos.");
    const teams = await client.query<{ id: string }>("SELECT id FROM teams ORDER BY created_at,id");
    for (const [index, t] of teams.rows.entries()) {
      const name = `Equipo histórico ${index + 1}`;
      await client.query("UPDATE teams SET name=$2,name_key=$3,captain_active=false WHERE id=$1", [t.id, name, `retired-${t.id}`]);
      await client.query(`UPDATE publications SET ranking=(SELECT COALESCE(jsonb_agg(CASE WHEN x->>'id'=$1 THEN jsonb_set(x,'{equipo}',to_jsonb($2::text)) ELSE x END),'[]'::jsonb) FROM jsonb_array_elements(ranking) x)`, [t.id, name]);
    }
    const people = await client.query<User>("SELECT * FROM users WHERE NOT is_owner AND staff_status<>'approved'");
    for (const person of people.rows) await anonymize(client, person.id);
    await client.query("UPDATE solution_publications SET reason='Campaña retirada',manifest='[]' WHERE status='merged'");
    await client.query("DELETE FROM solution_publications WHERE status<>'merged'");
    for (const table of ["github_oauth_states", "github_repositories", "github_accounts", "attendance", "substitutions", "invitations", "submissions", "captain_changes", "membership_changes", "withdrawal_requests", "awards", "members"]) {
      await client.query(`DELETE FROM ${table}`);
    }
    await client.query("UPDATE audit_log SET details='{}'");
    await client.query("UPDATE mail_outbox SET body='',subject='Datos de campaña retirados',status=CASE WHEN status='sent' THEN 'sent' ELSE 'failed' END,last_error=NULL");
    await client.query("DELETE FROM rate_limits");
    await client.query("UPDATE seasons SET retired_at=now() WHERE id='2027'");
    await audit(client, actor, "season.retired", null);
  });
}
export async function publishedResults(): Promise<{ configured: boolean; rankings: Record<string, RankedTeam[]> }> {
  if (!process.env.DATABASE_URL) return { configured: false, rankings: {} };
  const found = await database().query<{ scope: string; ranking: RankedTeam[] }>("SELECT scope,ranking FROM publications WHERE current");
  return { configured: true, rankings: Object.fromEntries(found.rows.map(p => [p.scope, p.ranking])) };
}
export async function operationsDashboard(user: User, teamId?: string) {
  return run(user, !teamId, async (client, actor) => {
    const season = await client.query<{ retention_at: Date; retired_at: Date | null }>("SELECT * FROM seasons WHERE id='2027'");
    if (teamId && actor.staff_status !== "approved") {
      const access = await client.query("SELECT 1 FROM members WHERE team_id=$1 AND user_id=$2 AND active UNION ALL SELECT 1 FROM substitutions WHERE team_id=$1 AND user_id=$2", [uuid(teamId), actor.id]);
      if (!access.rowCount) throw new ManagementError("No puedes consultar este equipo.", 403);
    }
    const teams = await client.query<OperationalTeam>("SELECT * FROM teams WHERE status='approved' AND ($1::uuid IS NULL OR id=$1) ORDER BY name", [teamId ?? null]);
    const events = await client.query<Event>("SELECT * FROM league_events ORDER BY ordinal");
    const challenges = await client.query<Challenge>(teamId ? "SELECT * FROM challenges WHERE status<>'draft'" : "SELECT * FROM challenges");
    const submissions = await client.query<Submission>("SELECT id,team_id,event_id,kind,url,submitted_at,status,reason,current,commit_sha,branch,github_full_name,submitted_by FROM submissions WHERE ($1::uuid IS NULL OR team_id=$1) ORDER BY submitted_at DESC", [teamId ?? null]);
    const changes = await client.query<CaptainChange>("SELECT * FROM captain_changes WHERE ($1::uuid IS NULL OR team_id=$1) ORDER BY created_at DESC", [teamId ?? null]);
    const views = [];
    for (const t of teams.rows) {
      const originals = await client.query<{ id: string; first_name: string; last_name: string; email: string; active: boolean; original: boolean }>("SELECT u.id,u.first_name,u.last_name,u.email,m.active,m.original FROM members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 ORDER BY m.joined_at", [t.id]);
      const eligibilityResult = await eligibility(client, t.id);
      const worlds = [];
      for (const e of events.rows) worlds.push({ event: e, people: await roster(client, t.id, e.id) });
      views.push({ team: t, originals: originals.rows, eligibility: eligibilityResult, worlds });
    }
    const previews = [];
    if (!teamId && !season.rows[0].retired_at) for (const e of events.rows) previews.push({ event: e, preview: await recalculate(client, e) });
    const global = !teamId ? await globalRows(client) : null;
    const awards = await client.query<{ id: string; kind: string; description: string; delivered: boolean; event_id: string; user_id: string; team_id: string }>("SELECT * FROM awards WHERE $1::uuid IS NULL OR team_id=$1 OR user_id IN (SELECT user_id FROM members WHERE team_id=$1)", [teamId ?? null]);
    const withdrawals = !teamId ? await client.query<{ id: string; user_id: string; reason: string }>("SELECT * FROM withdrawal_requests WHERE status='pending'") : { rows: [] };
    const communities = !teamId ? await client.query<{ name: string; active: boolean }>("SELECT * FROM staff_communities ORDER BY name") : { rows: [] };
    const contributions = !teamId ? await client.query<{ id: string; name: string; description: string; destination: string; amount_cents: number; resource_url: string | null; authorized: boolean }>("SELECT * FROM contributions ORDER BY name") : { rows: [] };
    const accounts = !teamId ? await client.query<{ id: string; email: string; first_name: string; last_name: string; is_owner: boolean; staff_status: User["staff_status"] }>("SELECT id,email,first_name,last_name,is_owner,staff_status FROM users WHERE verified_at IS NOT NULL AND disabled_at IS NULL ORDER BY email") : { rows: [] };
    const movements = await client.query<{ team_id: string; event_id: string; concept: string; points: number }>("SELECT * FROM score_entries WHERE $1::uuid IS NULL OR team_id=$1 ORDER BY event_id,concept", [teamId ?? null]);
    const audits = !teamId ? await client.query<{ id: string; action: string; details: Input; created_at: Date }>("SELECT id,action,details,created_at FROM audit_log ORDER BY id DESC LIMIT 100") : { rows: [] };
    return { views, events: events.rows, challenges: challenges.rows, submissions: submissions.rows, changes: changes.rows, previews, global, awards: awards.rows, withdrawals: withdrawals.rows, communities: communities.rows, contributions: contributions.rows, season: season.rows[0], accounts: accounts.rows, movements: movements.rows, audits: audits.rows };
  });
}
