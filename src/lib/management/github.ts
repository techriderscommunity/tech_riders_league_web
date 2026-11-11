import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database, transaction } from "./db.ts";
import { digest, token } from "./crypto.ts";
import { appUrl } from "./mail.ts";
import { requireStaff, type User } from "./service.ts";
import { team, event, run, invalidate, allowedAtFinal, type RankedTeam } from "./operations.ts";
import { text, uuid, ManagementError } from "./validation.ts";
import * as api from "./github-api.ts";

type Input = Record<string, unknown>;
interface RepositoryBinding { team_id: string; repository_id: string; full_name: string; installation_id: string; captain_id: string }
interface GitSubmission {
  id: string; team_id: string; event_id: string; commit_sha: string; branch: string;
  github_repository_id: string; github_full_name: string; github_installation_id: string;
  submitted_by: string; submitted_at: Date; status: string; current: boolean; snapshot: Buffer; snapshot_digest: string;
  snapshot_manifest: api.SourceFile[];
}
export interface SolutionJob {
  id: string; submission_id: string; publication_id: string; event_id: string; position: number;
  source_folder: string; manifest: api.ManifestFile[]; manifest_digest: string; status: string;
  pr_number: number | null; pr_url: string | null; error: string | null; reason: string; updated_at: Date;
}
async function audit(client: PoolClient, user: User, action: string, id: string, details: Input = {}) {
  await client.query("INSERT INTO audit_log(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)", [user.id, action, id, JSON.stringify(details)]);
}
function idNumber(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ManagementError("Identificador GitHub no válido.");
  return id;
}
async function binding(client: PoolClient, teamId: string, captainId: string) {
  const found = await client.query<RepositoryBinding>("SELECT * FROM github_repositories WHERE team_id=$1 AND captain_id=$2", [teamId, captainId]);
  if (!found.rows[0]) throw new ManagementError("Vincula GitHub y conecta un repositorio privado como capitán actual.");
  return found.rows[0];
}
export async function startGitHub(user: User, session: string, input: Input) {
  if (!api.githubEnabled()) throw new ManagementError("GitHub todavía no está configurado por organización.", 503);
  return run(user, false, async (client, actor) => {
    const t = await team(client, input.teamId, actor);
    const repository = input.repository ? api.repositoryName(text(input.repository, "Repositorio", 140)) : null;
    const state = token(), verifier = token(), settings = api.oauthSettings();
    await client.query("DELETE FROM github_oauth_states WHERE expires_at<now() OR user_id=$1", [actor.id]);
    await client.query("INSERT INTO github_oauth_states(state_hash,session_hash,user_id,team_id,repository,verifier,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '10 minutes')",
      [digest(state), digest(session), actor.id, t.id, repository, verifier]);
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: `${appUrl()}/api/github/callback`,
      state, code_challenge: Buffer.from(digest(verifier), "hex").toString("base64url"), code_challenge_method: "S256" }).toString();
    await audit(client, actor, "github.authorization_started", t.id);
    return url.toString();
  });
}
export async function finishGitHub(user: User, session: string, input: Input) {
  const state = text(input.state, "Estado OAuth", 64), code = text(input.code, "Código OAuth", 1000);
  const context = await run(user, false, async (client, actor) => {
    const found = await client.query<{ team_id: string; repository: string | null; verifier: string }>(
      "SELECT * FROM github_oauth_states WHERE state_hash=$1 AND session_hash=$2 AND user_id=$3 AND expires_at>now() AND consumed_at IS NULL FOR UPDATE",
      [digest(state), digest(session), actor.id]);
    const row = found.rows[0];
    if (!row) throw new ManagementError("La vinculación ha caducado, pertenece a otra sesión o ya se utilizó.", 403);
    await team(client, row.team_id, actor);
    await client.query("UPDATE github_oauth_states SET consumed_at=now() WHERE state_hash=$1", [digest(state)]);
    return row;
  });
  const credential = await api.exchangeCode(code, context.verifier, `${appUrl()}/api/github/callback`);
  const identity = await api.githubUser(credential);
  const repository = context.repository ? await api.validateRepository(context.repository, credential, identity.id) : null;
  return run(user, false, async (client, actor) => {
    await team(client, context.team_id, actor);
    const existing = await client.query<{ github_id: string }>("SELECT github_id FROM github_accounts WHERE user_id=$1", [actor.id]);
    const occupied = await client.query("SELECT 1 FROM github_repositories WHERE team_id=$1", [context.team_id]);
    if (existing.rows[0] && idNumber(existing.rows[0].github_id) !== identity.id && occupied.rowCount) throw new ManagementError("No puedes cambiar la identidad GitHub mientras el equipo tenga repositorio asociado.");
    await client.query("INSERT INTO github_accounts(user_id,github_id,login) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET github_id=$2,login=$3,linked_at=now()", [actor.id, identity.id, identity.login]);
    if (repository) {
      const prior = await client.query<RepositoryBinding>("SELECT * FROM github_repositories WHERE team_id=$1", [context.team_id]);
      if (prior.rows[0] && idNumber(prior.rows[0].repository_id) !== repository.repository.id) throw new ManagementError("El equipo ya tiene otro repositorio. Organización debe resolver el cambio, no sobrescribir entregas.");
      await client.query(`INSERT INTO github_repositories(team_id,repository_id,full_name,installation_id,captain_id)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(team_id) DO UPDATE SET full_name=$3,installation_id=$4,captain_id=$5,linked_at=now()`,
        [context.team_id, repository.repository.id, repository.repository.full_name, repository.installationId, actor.id]);
    }
    await audit(client, actor, "github.linked", context.team_id, { repositoryId: repository?.repository.id ?? null });
  });
}
export async function commitPreview(user: User, input: Input) {
  const b = await run(user, false, async (client, actor) => {
    const t = await team(client, input.teamId, actor);
    return binding(client, t.id, actor.id);
  });
  return api.latestCommit(idNumber(b.repository_id), idNumber(b.installation_id));
}
async function deliveryContext(client: PoolClient, actor: User, input: Input) {
  const t = await team(client, input.teamId, actor), e = await event(client, input.eventId);
  await allowedAtFinal(client, e, t.id);
  const challenge = await client.query<{ version: number; allow_resubmission: boolean; open: boolean }>(
    `SELECT version,allow_resubmission,status='published' AND deadline IS NOT NULL AND deadline>clock_timestamp() AS open
     FROM challenges WHERE event_id=$1 FOR UPDATE`, [e.id]);
  const c = challenge.rows[0];
  if (!c?.open || e.evaluation_closed) throw new ManagementError("La misión no tiene plazo abierto o ya terminó la evaluación.");
  const prior = await client.query<{ id: string }>("SELECT id FROM submissions WHERE team_id=$1 AND event_id=$2 AND kind='challenge' AND current FOR UPDATE", [t.id, e.id]);
  if (prior.rows[0] && (!c.allow_resubmission || input.previousId !== prior.rows[0].id)) throw new ManagementError("No se permite sustituir esta entrega o la versión ha cambiado. Recarga.", 409);
  const b = await binding(client, t.id, actor.id);
  return { t, e, c, b };
}
export async function deliverMission(user: User, input: Input) {
  const sha = api.commitSha(text(input.sha, "SHA", 40)), branch = text(input.branch, "Rama", 200);
  const context = await run(user, false, (client, actor) => deliveryContext(client, actor, input));
  const captured = await api.captureRepository(idNumber(context.b.repository_id), idNumber(context.b.installation_id), sha, branch);
  return run(user, false, async (client, actor) => {
    const latest = await deliveryContext(client, actor, input);
    if (latest.b.repository_id !== context.b.repository_id || latest.b.installation_id !== context.b.installation_id ||
        latest.c.version !== context.c.version) throw new ManagementError("La misión o el repositorio cambiaron durante la entrega; vuelve a revisar.", 409);
    const id = randomUUID(), snapshotDigest = api.sha256(captured.zip);
    await client.query("UPDATE submissions SET current=false WHERE team_id=$1 AND event_id=$2 AND kind='challenge' AND current", [latest.t.id, latest.e.id]);
    await client.query(`INSERT INTO submissions(id,team_id,event_id,kind,url,challenge_version,github_repository_id,github_full_name,
      github_installation_id,commit_sha,branch,submitted_by,snapshot,snapshot_digest,snapshot_manifest)
      VALUES($1,$2,$3,'challenge',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, latest.t.id, latest.e.id, `https://github.com/${captured.repository.full_name}/tree/${sha}`, latest.c.version,
        captured.repository.id, captured.repository.full_name, latest.b.installation_id, sha, branch, actor.id,
        api.encryptSnapshot(captured.zip, id), snapshotDigest, JSON.stringify(captured.files)]);
    await invalidate(client, latest.e.id);
    await audit(client, actor, "mission.delivered", id, { sha, repositoryId: captured.repository.id, eventId: latest.e.id, snapshotDigest });
  });
}
async function readSubmission(client: PoolClient, actor: User, id: string, staffOnly = false) {
  if (staffOnly) requireStaff(actor);
  const found = await client.query<GitSubmission>("SELECT * FROM submissions WHERE id=$1 AND commit_sha IS NOT NULL", [uuid(id)]);
  const s = found.rows[0];
  if (!s) throw new ManagementError("Entrega GitHub no disponible.", 404);
  if (actor.staff_status !== "approved") {
    const access = await client.query("SELECT 1 FROM members WHERE team_id=$1 AND user_id=$2 AND active", [s.team_id, actor.id]);
    if (!access.rowCount) throw new ManagementError("No puedes consultar esta entrega privada.", 403);
  }
  return s;
}
function plainSnapshot(s: GitSubmission) {
  const zip = api.decryptSnapshot(s.snapshot, s.id);
  if (api.sha256(zip) !== s.snapshot_digest) throw new ManagementError("No se pudo verificar la integridad del snapshot.", 503);
  return zip;
}
export async function downloadSubmission(user: User, id: string) {
  return run(user, false, async (client, actor) => {
    const s = await readSubmission(client, actor, id);
    await audit(client, actor, "mission.snapshot_downloaded", s.id);
    return { zip: plainSnapshot(s), sha: s.commit_sha };
  });
}
export async function closeEvaluation(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const e = await event(client, input.eventId, false), reason = text(input.reason, "Motivo", 1000);
    const c = await client.query<{ ended: boolean }>("SELECT deadline IS NOT NULL AND deadline<=clock_timestamp() AS ended FROM challenges WHERE event_id=$1", [e.id]);
    if (!c.rows[0]?.ended) throw new ManagementError("La evaluación solo puede cerrarse después del deadline.");
    const pending = await client.query("SELECT 1 FROM submissions WHERE event_id=$1 AND current AND kind='challenge' AND status IN ('pending','correction')", [e.id]);
    if (pending.rowCount) throw new ManagementError("Quedan entregas pendientes de evaluación o corrección.");
    await client.query("UPDATE league_events SET evaluation_closed=true WHERE id=$1", [e.id]);
    await audit(client, actor, "evaluation.closed", randomUUID(), { eventId: e.id, reason });
  });
}
async function selection(client: PoolClient, actor: User, submissionId: string) {
  const s = await readSubmission(client, actor, submissionId, true);
  const e = await event(client, s.event_id, false);
  if (!e.evaluation_closed || !s.current || s.status !== "approved") throw new ManagementError("Solo una entrega válida y definitiva de un mundo evaluado puede publicarse.");
  const publication = await client.query<{ id: string; ranking: RankedTeam[] }>("SELECT id,ranking FROM publications WHERE scope=$1 AND current FOR UPDATE", [s.event_id]);
  const p = publication.rows[0], rank = p?.ranking.find(r => r.id === s.team_id && r.posicion <= 3);
  if (!p || !rank) throw new ManagementError("La entrega no pertenece al Top 3 publicado de ese mundo.");
  return { s, p, position: rank.posicion };
}
export async function prepareSolution(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const selected = await selection(client, actor, uuid(input.submissionId));
    const folder = api.safePath(text(input.folder, "Carpeta de la solución", 500)), reason = text(input.reason, "Motivo de selección", 1000);
    const { manifest } = api.selectedFiles(plainSnapshot(selected.s), folder, selected.s.snapshot_manifest);
    const id = randomUUID();
    await client.query(`INSERT INTO solution_publications(id,submission_id,publication_id,event_id,position,source_folder,manifest,manifest_digest,reason,reviewer_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, selected.s.id, selected.p.id, selected.s.event_id, selected.position, folder, JSON.stringify(manifest), api.sha256(JSON.stringify(manifest)), reason, actor.id]);
    await audit(client, actor, "solution.prepared", id, { submissionId: selected.s.id, folder, manifest });
  });
}
export async function publishSolution(user: User, input: Input) {
  if (input.confirmed !== true) throw new ManagementError("Confirma expresamente que revisaste los archivos y sus derechos de publicación.");
  const context = await run(user, true, async (client, actor) => {
    const found = await client.query<SolutionJob>("SELECT * FROM solution_publications WHERE id=$1 FOR UPDATE", [uuid(input.id)]);
    const job = found.rows[0];
    if (!job || !["prepared", "failed"].includes(job.status)) throw new ManagementError("Publicación no disponible para envío.");
    const chosen = await selection(client, actor, job.submission_id);
    if (chosen.p.id !== job.publication_id || chosen.position !== job.position || input.manifestDigest !== job.manifest_digest) throw new ManagementError("El ranking o manifiesto cambiaron. Prepara y revisa otra selección.", 409);
    const zip = plainSnapshot(chosen.s), manifest = api.selectedFiles(zip, job.source_folder, chosen.s.snapshot_manifest).manifest;
    if (api.sha256(JSON.stringify(manifest)) !== job.manifest_digest) throw new ManagementError("El manifiesto no coincide con la entrega.");
    const reason = text(input.reason, "Autorización de publicación", 1000);
    await client.query("UPDATE solution_publications SET status='creating',approved_by=$2,reason=$3,error=NULL,updated_at=now() WHERE id=$1", [job.id, actor.id, reason]);
    await audit(client, actor, "solution.publication_authorized", job.id, { manifestDigest: job.manifest_digest, reason });
    return { job: { ...job, commit_sha: chosen.s.commit_sha }, zip };
  });
  try {
    const pr = await api.createSolutionPr(context.job, context.zip, context.job.manifest);
    await database().query("UPDATE solution_publications SET status=$2,pr_number=$3,pr_url=$4,updated_at=now() WHERE id=$1", [context.job.id, pr.merged ? "merged" : "pr", pr.number, pr.url]);
  } catch (error) {
    console.error("GitHub solution publication failed", { jobId: context.job.id, error: error instanceof ManagementError ? error.message : "Transport/configuration failure" });
    await database().query("UPDATE solution_publications SET status='failed',error='GitHub no confirmó el PR. Reintenta el mismo trabajo para reconciliar el resultado.',updated_at=now() WHERE id=$1", [context.job.id]);
    throw new ManagementError("GitHub no confirmó la publicación. Puede haber creado la rama o PR: reintenta este mismo trabajo, no crees otro.", 502);
  }
}
export async function syncSolution(user: User, input: Input) {
  const job = await run(user, true, async (client) => {
    const found = await client.query<SolutionJob>("SELECT * FROM solution_publications WHERE id=$1", [uuid(input.id)]);
    if (!found.rows[0]?.pr_number) throw new ManagementError("No hay PR registrado para sincronizar.");
    return found.rows[0];
  });
  const status = await api.solutionPrStatus(job.pr_number!);
  await run(user, true, async (client, actor) => {
    await client.query("UPDATE solution_publications SET status=$2,error=$3,updated_at=now() WHERE id=$1", [job.id, status.merged ? "merged" : "pr", status.state === "closed" && !status.merged ? "PR cerrado sin integrar." : null]);
    await audit(client, actor, "solution.pr_synchronized", job.id, { merged: status.merged });
  });
}
export async function resetSolution(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const result = await client.query("UPDATE solution_publications SET status='failed',error='Recuperado tras interrupción; reintentar el mismo trabajo.',updated_at=now() WHERE id=$1 AND status='creating' AND updated_at<now()-interval '15 minutes' RETURNING id", [uuid(input.id)]);
    if (!result.rowCount) throw new ManagementError("Solo se recuperan trabajos interrumpidos durante al menos 15 minutos.");
    await audit(client, actor, "solution.recovered", uuid(input.id));
  });
}
export async function cancelSolution(user: User, input: Input) {
  return run(user, true, async (client, actor) => {
    const result = await client.query("UPDATE solution_publications SET status='cancelled',updated_at=now() WHERE id=$1 AND status='prepared' RETURNING id", [uuid(input.id)]);
    if (!result.rowCount) throw new ManagementError("Solo se cancela una preparación sin envío. Un PR creado debe gestionarse en GitHub.");
    await audit(client, actor, "solution.cancelled", uuid(input.id), { reason: text(input.reason, "Motivo", 1000) });
  });
}
export async function githubDashboard(user: User, teamId?: string) {
  return run(user, !teamId, async (client, actor) => {
    if (teamId) {
      const access = await client.query("SELECT 1 FROM members WHERE team_id=$1 AND user_id=$2 AND active UNION ALL SELECT 1 FROM substitutions WHERE team_id=$1 AND user_id=$2", [uuid(teamId), actor.id]);
      if (!access.rowCount && actor.staff_status !== "approved") throw new ManagementError("Equipo no autorizado.", 403);
    }
    const accounts = await client.query<{ user_id: string; login: string }>("SELECT user_id,login FROM github_accounts WHERE $1::uuid IS NULL OR user_id IN (SELECT captain_id FROM teams WHERE id=$1)", [teamId ?? null]);
    const repositories = await client.query<RepositoryBinding>("SELECT * FROM github_repositories WHERE $1::uuid IS NULL OR team_id=$1", [teamId ?? null]);
    const jobs = await client.query<SolutionJob>("SELECT * FROM solution_publications WHERE $1::uuid IS NULL OR submission_id IN (SELECT id FROM submissions WHERE team_id=$1)", [teamId ?? null]);
    return { enabled: api.githubEnabled(), accounts: accounts.rows, repositories: repositories.rows, jobs: jobs.rows };
  });
}
export async function hallOfFame() {
  if (!process.env.DATABASE_URL) return [];
  const result = await database().query<{ id: string; event_id: string; position: number; pr_url: string }>("SELECT id,event_id,position,pr_url FROM solution_publications WHERE status='merged' ORDER BY event_id,position");
  return result.rows;
}
