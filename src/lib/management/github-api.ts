import { createCipheriv, createDecipheriv, createHash, createSign, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { zipSync, unzipSync, type Zippable } from "fflate";
import { ManagementError } from "./validation.ts";

export const OFFICIAL_REPOSITORY = "techriderscommunity/tech_riders_league";
const MAX_BYTES = 20 * 1024 * 1024;
export interface GitHubRepository { id: number; full_name: string; private: boolean; fork: boolean; owner: { id: number }; default_branch: string }
export interface SourceFile { path: string; sha: string; mode: "100644" | "100755"; size: number }
export interface Snapshot { commit: string; files: SourceFile[]; contents: Record<string, Uint8Array> }
function setting(name: string) {
  const value = process.env[name];
  if (!value) throw new ManagementError(`Integración GitHub no configurada: ${name}.`, 503);
  return value;
}
export function githubEnabled() {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET &&
    process.env.GITHUB_PRIVATE_KEY_FILE && process.env.GITHUB_SNAPSHOT_KEY && process.env.GITHUB_APP_SLUG);
}
function snapshotKey() {
  const raw = Buffer.from(setting("GITHUB_SNAPSHOT_KEY"), "base64");
  if (raw.length !== 32) throw new ManagementError("GITHUB_SNAPSHOT_KEY debe contener 32 bytes en base64.", 503);
  return raw;
}
export function encryptSnapshot(value: Buffer, context: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", snapshotKey(), iv);
  cipher.setAAD(Buffer.from(context));
  return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]);
}
export function decryptSnapshot(value: Buffer, context: string) {
  const decipher = createDecipheriv("aes-256-gcm", snapshotKey(), value.subarray(0, 12));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(value.subarray(-16));
  return Buffer.concat([decipher.update(value.subarray(12, -16)), decipher.final()]);
}
export function sha256(value: Uint8Array | string) { return createHash("sha256").update(value).digest("hex"); }
export function oauthSettings() {
  return { clientId: setting("GITHUB_CLIENT_ID"), clientSecret: setting("GITHUB_CLIENT_SECRET"), slug: setting("GITHUB_APP_SLUG") };
}
function appJwt(publisher = false) {
  const prefix = publisher ? "GITHUB_PUBLISHER" : "GITHUB";
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: setting(`${prefix}_APP_ID`) })).toString("base64url");
  const message = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(message).sign(readFileSync(setting(`${prefix}_PRIVATE_KEY_FILE`))).toString("base64url");
  return `${message}.${signature}`;
}
export function repositoryName(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(value) || value.split("/")[1] === "." || value.split("/")[1] === "..") throw new ManagementError("Repositorio no válido; utiliza propietario/nombre.");
  return value;
}
export function commitSha(value: string) {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new ManagementError("Se necesita el SHA completo de 40 caracteres.");
  return value;
}
export function safePath(value: string) {
  if (!value || value.startsWith("/") || value.includes("\\") || /[:\x00-\x1f\x7f]/.test(value) ||
      value.split("/").some(p => !p || p === "." || p === ".." || p === "__proto__") || value.length > 500) throw new ManagementError("Ruta de código no válida.");
  return value;
}
async function readBounded(response: Response, max = MAX_BYTES) {
  if (!response.body) throw new ManagementError("GitHub devolvió una respuesta vacía.", 502);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > max) { await reader.cancel(); throw new ManagementError("La respuesta GitHub supera el límite admitido.", 413); }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}
async function request<T>(path: string, credential: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "Tech-Riders-League", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) { await response.body?.cancel(); throw new ManagementError(`GitHub no confirmó la operación (HTTP ${response.status}). Revisa autorización y disponibilidad.`, response.status === 404 ? 404 : 502); }
  return JSON.parse((await readBounded(response, MAX_BYTES * 2)).toString("utf8")) as T;
}
export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const settings = oauthSettings();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: settings.clientId, client_secret: settings.clientSecret, code, code_verifier: verifier, redirect_uri: redirectUri }),
  });
  const data: { access_token?: string; error?: string } = JSON.parse((await readBounded(response, 8192)).toString());
  if (!response.ok || !data.access_token || data.error) throw new ManagementError("GitHub no autorizó la vinculación. Inténtalo de nuevo.", 403);
  return data.access_token;
}
export async function githubUser(credential: string) {
  const person = await request<{ id: number; login: string }>("/user", credential);
  if (!Number.isSafeInteger(person.id) || !person.login) throw new ManagementError("Identidad GitHub no válida.", 502);
  return person;
}
export async function validateRepository(name: string, userToken: string, githubId: number) {
  const repository = await request<GitHubRepository>(`/repos/${repositoryName(name)}`, userToken);
  if (!repository.private || repository.fork || repository.owner.id !== githubId || !Number.isSafeInteger(repository.id)) throw new ManagementError("Se requiere un repositorio privado propio, no un fork ni un repositorio de otro propietario.");
  const installation = await request<{ id: number; app_id: number; account: { id: number }; repository_selection: string; permissions: { contents?: string } }>(
    `/repos/${repository.full_name}/installation`, appJwt());
  if (String(installation.app_id) !== setting("GITHUB_APP_ID") || installation.account.id !== githubId || installation.repository_selection !== "selected" || installation.permissions.contents !== "read") throw new ManagementError("Instala la App de lectura solo en repositorios seleccionados; no autorices todos ni permisos de escritura.");
  return { repository, installationId: installation.id };
}
export async function installationToken(installationId: number, repositoryId: number, publisher = false) {
  const result = await request<{ token: string }>(`/app/installations/${installationId}/access_tokens`, appJwt(publisher), "POST",
    { repository_ids: [repositoryId], permissions: { contents: publisher ? "write" : "read", ...(publisher ? { pull_requests: "write" } : {}) } });
  if (!result.token) throw new ManagementError("GitHub no generó acceso al repositorio.", 502);
  return result.token;
}
export async function liveRepository(id: number, credential: string) {
  const repository = await request<GitHubRepository>(`/repositories/${id}`, credential);
  if (repository.id !== id || !repository.private || repository.fork) throw new ManagementError("El repositorio ya no es privado o no coincide. No se permite entregar.");
  return repository;
}
export async function latestCommit(id: number, installationId: number) {
  const credential = await installationToken(installationId, id);
  const repository = await liveRepository(id, credential);
  const commit = await request<{ sha: string }>(`/repos/${repository.full_name}/commits/${encodeURIComponent(repository.default_branch)}`, credential);
  return { sha: commitSha(commit.sha), branch: repository.default_branch };
}
export async function captureRepository(id: number, installationId: number, sha: string, branch: string): Promise<{ repository: GitHubRepository; zip: Buffer; files: SourceFile[] }> {
  const credential = await installationToken(installationId, id);
  const repository = await liveRepository(id, credential);
  const base = `/repos/${repository.full_name}`;
  const selected = await request<{ sha: string; tree: { sha: string } }>(`${base}/git/commits/${commitSha(sha)}`, credential);
  if (selected.sha !== sha) throw new ManagementError("GitHub no confirmó el SHA exacto.");
  const comparison = await request<{ status: string }>(`${base}/compare/${sha}...${encodeURIComponent(branch)}`, credential);
  if (!["ahead", "identical"].includes(comparison.status)) throw new ManagementError("El commit no pertenece al historial de la rama seleccionada.");
  const tree = await request<{ truncated: boolean; tree: { path: string; type: string; mode: string; sha: string; size?: number }[] }>(`${base}/git/trees/${selected.tree.sha}?recursive=1`, credential);
  if (tree.truncated || tree.tree.length > 1000) throw new ManagementError("El árbol supera 1000 entradas o está truncado; reduce el repositorio.", 413);
  const files: SourceFile[] = [], contents: Record<string, Uint8Array> = Object.create(null);
  const started = Date.now();
  let total = 0;
  for (const item of tree.tree) {
    if (Date.now() - started > 120000) throw new ManagementError("La captura GitHub agotó dos minutos. Reduce el repositorio o reintenta.", 504);
    if (item.type === "tree") continue;
    if (item.type !== "blob" || !["100644", "100755"].includes(item.mode)) throw new ManagementError("La entrega no admite submódulos ni enlaces simbólicos. Incluye los archivos reales.");
    safePath(item.path);
    if (item.path.startsWith(".git/")) throw new ManagementError("Ruta Git interna no admitida.");
    if (files.length >= 300 || (item.size ?? 0) + total > MAX_BYTES) throw new ManagementError("La entrega supera 300 archivos o 20 MiB.", 413);
    const blob = await request<{ content: string; encoding: string; size: number }>(`${base}/git/blobs/${item.sha}`, credential);
    if (blob.encoding !== "base64") throw new ManagementError("GitHub devolvió un archivo no compatible.", 502);
    const data = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
    const blobSha = createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
    if (blobSha !== item.sha || data.length !== blob.size) throw new ManagementError("Integridad de archivo incorrecta.", 502);
    if (data.toString("utf8", 0, 120).startsWith("version https://git-lfs.github.com/spec/v1")) throw new ManagementError("Git LFS no está admitido: incluye el contenido real del archivo.");
    total += data.length;
    if (total > MAX_BYTES) throw new ManagementError("La entrega supera 20 MiB.", 413);
    const mode = item.mode === "100755" ? "100755" : "100644";
    files.push({ path: item.path, sha: item.sha, mode, size: data.length }); contents[item.path] = data;
  }
  if (!files.length) throw new ManagementError("No hay archivos entregables.");
  const archive: Zippable = Object.create(null);
  for (const file of files) archive[file.path] = [contents[file.path], { os: 3, attrs: (file.mode === "100755" ? 0o100755 : 0o100644) << 16 }];
  const verifiedRepository = await liveRepository(id, credential);
  return { repository: verifiedRepository, files, zip: Buffer.from(zipSync(archive, { level: 1 })) };
}
export function snapshotFiles(zip: Buffer) {
  const files = unzipSync(zip);
  for (const path of Object.keys(files)) safePath(path);
  return files;
}
export function selectedFiles(zip: Buffer, folder: string, originalFiles: SourceFile[] = []) {
  safePath(folder);
  const source = snapshotFiles(zip), prefix = `${folder}/`;
  const files = Object.keys(source).filter(path => path.startsWith(prefix)).sort();
  if (!files.length) throw new ManagementError("La carpeta no contiene archivos en el SHA entregado.");
  const denied = /(^|\/)(\.env(?:\.|$)|\.git\/|id_rsa$|id_ed25519$)|\.(pem|pfx|p12|key)$/i;
  for (const path of files) {
    if (denied.test(path) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}/.test(Buffer.from(source[path]).toString("utf8"))) throw new ManagementError(`Archivo con posibles secretos: ${path}. Retíralo mediante una entrega válida; no se publica.`);
  }
  return { source, manifest: files.map(path => ({ path, bytes: source[path].length, digest: sha256(source[path]), mode: originalFiles.find(f => f.path === path)?.mode ?? "100644" as const })) };
}
export interface ManifestFile { path: string; bytes: number; digest: string; mode: "100644" | "100755" }
export async function createSolutionPr(job: { id: string; event_id: string; position: number; submission_id: string; source_folder: string; commit_sha: string }, zip: Buffer, manifest: ManifestFile[]) {
  const repositoryId = Number(setting("GITHUB_PUBLISHER_REPOSITORY_ID")), installationId = Number(setting("GITHUB_PUBLISHER_INSTALLATION_ID"));
  if (!Number.isSafeInteger(repositoryId) || !Number.isSafeInteger(installationId)) throw new ManagementError("Identificadores de publicación no válidos.", 503);
  const credential = await installationToken(installationId, repositoryId, true);
  const official = await request<GitHubRepository>(`/repositories/${repositoryId}`, credential);
  if (official.full_name !== OFFICIAL_REPOSITORY || official.private) throw new ManagementError("El destino no es el repositorio público oficial.", 503);
  const base = `/repos/${OFFICIAL_REPOSITORY}`, branch = `league-solution-${job.id}`;
  const pulls = await request<{ number: number; html_url: string; merged_at: string | null; state: string }[]>(
    `${base}/pulls?state=all&head=techriderscommunity:${branch}`, credential);
  if (pulls[0]) return { number: pulls[0].number, url: pulls[0].html_url, merged: Boolean(pulls[0].merged_at) };
  const branches = await request<{ ref: string }[]>(`${base}/git/matching-refs/heads/${branch}`, credential);
  // A deterministic branch allows retries after an ambiguous GitHub response.
  const existing = branches.find(b => b.ref === `refs/heads/${branch}`);
  if (!existing) {
    const baseCommit = await request<{ sha: string; commit: { tree: { sha: string } } }>(`${base}/commits/${encodeURIComponent(official.default_branch)}`, credential);
    const contents = snapshotFiles(zip), entries = [];
    const destination = `solutions/${safePath(job.event_id)}/${String(job.position).padStart(2, "0")}-team-${job.submission_id}`;
    const started = Date.now();
    for (const file of manifest) {
      if (Date.now() - started > 120000) throw new ManagementError("La publicación GitHub agotó dos minutos. Reintenta el mismo trabajo.", 504);
      const data = contents[file.path];
      if (!data || sha256(data) !== file.digest) throw new ManagementError("El manifiesto no coincide con el snapshot.");
      const blob = await request<{ sha: string }>(`${base}/git/blobs`, credential, "POST", { content: Buffer.from(data).toString("base64"), encoding: "base64" });
      entries.push({ path: `${destination}/${safePath(file.path.slice(job.source_folder.length + 1))}`, mode: file.mode, type: "blob", sha: blob.sha });
    }
    const tree = await request<{ sha: string }>(`${base}/git/trees`, credential, "POST", { base_tree: baseCommit.commit.tree.sha, tree: entries });
    const commit = await request<{ sha: string }>(`${base}/git/commits`, credential, "POST", { message: `League ${job.event_id}: solución seleccionada ${job.position}`, tree: tree.sha, parents: [baseCommit.sha] });
    await request(`${base}/git/refs`, credential, "POST", { ref: `refs/heads/${branch}`, sha: commit.sha });
  }
  const pr = await request<{ number: number; html_url: string }>(`${base}/pulls`, credential, "POST", {
    title: `League ${job.event_id} · Top ${job.position}`, head: branch, base: official.default_branch, draft: true,
    body: `Publicación expresamente autorizada por staff. Entrega ${job.submission_id}. SHA evaluado: ${job.commit_sha}. Solo archivos del manifiesto revisado.\nLa revisión y el merge se realizan por organización.`,
  });
  return { number: pr.number, url: pr.html_url, merged: false };
}
export async function solutionPrStatus(number: number) {
  const credential = await installationToken(Number(setting("GITHUB_PUBLISHER_INSTALLATION_ID")), Number(setting("GITHUB_PUBLISHER_REPOSITORY_ID")), true);
  const pr = await request<{ merged: boolean; html_url: string; state: string }>(`/repos/${OFFICIAL_REPOSITORY}/pulls/${number}`, credential);
  return pr;
}
