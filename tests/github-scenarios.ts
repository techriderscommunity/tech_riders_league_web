import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { database, transaction } from "../src/lib/management/db.ts";
import * as service from "../src/lib/management/service.ts";
import * as ops from "../src/lib/management/operations.ts";
import * as github from "../src/lib/management/github.ts";
import * as api from "../src/lib/management/github-api.ts";
import { unzipSync } from "fflate";

export async function githubScenarios(context: {
  root: service.User; directory: string;
  verified: (address: string, staff?: boolean) => Promise<service.User>;
  findToken: (address: string, marker: string) => Promise<string>;
}) {
  const { root, directory, verified, findToken } = context;
  const captain = await verified("github-captain@example.test");
  await service.createTeam(captain, { name: "GitHub private team" });
  const teamId = (await service.dashboard(captain)).team.id, members = [captain];
  for (let i = 0; i < 3; i++) {
    const address = `github-member${i}@example.test`;
    await service.invite(captain, { teamId, email: address });
    const member = await verified(address);
    await service.acceptInvitation(member, { token: await findToken(address, "invitacion") }); members.push(member);
  }
  await service.submitTeam(captain, { teamId });
  await service.review(root, { kind: "team", id: teamId, status: "approved" });
  const stranger = await verified("github-stranger@example.test");
  const session = await service.login({ email: captain.email, password: "test-password-123" });
  const keyFile = join(directory, "fixture-github.pem");
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await writeFile(keyFile, keys.privateKey.export({ type: "pkcs8", format: "pem" }));
  const settings: Record<string, string> = {
    GITHUB_APP_ID: "100", GITHUB_APP_SLUG: "league-fixture", GITHUB_CLIENT_ID: "fixture-client",
    GITHUB_CLIENT_SECRET: "fixture-only", GITHUB_PRIVATE_KEY_FILE: keyFile, GITHUB_SNAPSHOT_KEY: randomBytes(32).toString("base64"),
    GITHUB_PUBLISHER_APP_ID: "101", GITHUB_PUBLISHER_PRIVATE_KEY_FILE: keyFile,
    GITHUB_PUBLISHER_INSTALLATION_ID: "2001", GITHUB_PUBLISHER_REPOSITORY_ID: "9000",
  };
  const previousEnv = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]]));
  Object.assign(process.env, settings);
  const originalFetch = globalThis.fetch;
  const sha1 = "a".repeat(40), sha2 = "b".repeat(40);
  let privateRepo = true, badOwner = false, fork = false, branchValid = true, truncate = false, contentsMode = "100644";
  const identity = 12345;
  let failPrResponse = false, failBlob = false, expireDuringCapture = false, merged = false, treeWrites = 0, prWrites = 0;
  let pr: { number: number; html_url: string; merged_at: string | null; state: string } | undefined;
  const requests: { path: string; method: string; body: Record<string, unknown> }[] = [];
  let content = Buffer.from("export const mission = 'private fixture';\n");
  const blobSha = () => createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
  let fileCount = 1, directoryCount = 1, revealDuringCapture = false;
  const repo = () => ({ id: 7000, full_name: "fixture-captain/private-team", private: privateRepo, fork, owner: { id: badOwner ? 555 : 12345 }, default_branch: "main" });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ path: url.pathname, method, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.href === "https://github.com/login/oauth/access_token") {
      assert.ok(body.code_verifier && body.client_secret === "fixture-only");
      return json({ access_token: "ephemeral-fixture-user-token" });
    }
    assert.equal(url.origin, "https://api.github.com", "Fixture cannot send data to external systems");
    const path = url.pathname;
    if (path === "/user") return json({ id: identity, login: "fixture-captain" });
    if (/\/app\/installations\/\d+\/access_tokens$/.test(path)) {
      assert.deepEqual(body.repository_ids, [path.includes("2001") ? 9000 : 7000]);
      return json({ token: path.includes("2001") ? "publisher-fixture-token" : "private-read-fixture-token" });
    }
    if (path === "/repos/fixture-captain/private-team/installation") return json({ id: 2000, app_id: 100, account: { id: 12345 }, repository_selection: "selected", permissions: { contents: "read" } });
    if (path === "/repos/fixture-captain/private-team" || path === "/repositories/7000") return json(repo());
    if (path === "/repos/fixture-captain/private-team/commits/main") return json({ sha: sha2 });
    if (/\/repos\/fixture-captain\/private-team\/git\/commits\/[ab]{40}$/.test(path)) return json({ sha: path.split("/").at(-1), tree: { sha: "tree-fixture" } });
    if (path.includes("/private-team/compare/")) return json({ status: branchValid ? "ahead" : "diverged" });
    if (path.includes("/private-team/git/trees/")) return json({ truncated: truncate, tree: [
      ...Array.from({ length: directoryCount }, (_, i) => ({ path: `folder-${i}`, type: "tree", mode: "040000", sha: "folder" })),
      ...Array.from({ length: fileCount }, (_, i) => ({ path: fileCount === 1 ? "world-security/solution.ts" : `world-security/file-${i}.ts`, type: "blob", mode: contentsMode, sha: blobSha(), size: content.length })),
    ] });
    if (path.includes("/private-team/git/blobs/")) {
      if (expireDuringCapture) await database().query("UPDATE challenges SET deadline=clock_timestamp()-interval '1 second' WHERE event_id='seguridad'");
      if (revealDuringCapture) privateRepo = false;
      return json({ content: content.toString("base64"), encoding: "base64", size: content.length });
    }
    if (path === "/repositories/9000") return json({ id: 9000, full_name: api.OFFICIAL_REPOSITORY, private: false, default_branch: "main" });
    const base = `/repos/${api.OFFICIAL_REPOSITORY}`;
    if (path === `${base}/pulls` && method === "GET") return json(pr ? [{ ...pr, merged_at: merged ? "2027-01-01" : null }] : []);
    if (path === `${base}/pulls/17`) return json({ merged, state: "open", html_url: `https://github.com/${api.OFFICIAL_REPOSITORY}/pull/17` });
    if (path.startsWith(`${base}/git/matching-refs/`)) return json(treeWrites ? [{ ref: `refs/heads/${path.split("/").at(-1)}` }] : []);
    if (path === `${base}/commits/main`) return json({ sha: sha1, commit: { tree: { sha: "official-base" } } });
    if (path === `${base}/git/blobs` && method === "POST") {
      if (failBlob) return json({}, 503);
      assert.equal(Buffer.from(String(body.content), "base64").toString(), content.toString()); return json({ sha: blobSha() });
    }
    if (path === `${base}/git/trees`) { treeWrites++; return json({ sha: "public-tree" }); }
    if (path === `${base}/git/commits`) return json({ sha: sha2 });
    if (path === `${base}/git/refs`) return json({ ref: body.ref });
    if (path === `${base}/pulls` && method === "POST") {
      assert.equal(body.draft, true); prWrites++;
      pr = { number: 17, html_url: `https://github.com/${api.OFFICIAL_REPOSITORY}/pull/17`, merged_at: null, state: "open" };
      if (failPrResponse) throw new TypeError("Fixture ambiguous connection failure after PR creation");
      return json(pr);
    }
    throw new Error(`Unexpected fixture request: ${method} ${url.href}`);
  };
  try {
    fileCount = 300;
    assert.equal((await api.captureRepository(7000, 2000, sha1, "main")).files.length, 300);
    fileCount = 301;
    await assert.rejects(api.captureRepository(7000, 2000, sha1, "main"), /300 archivos/);
    fileCount = 1; directoryCount = 999;
    assert.equal((await api.captureRepository(7000, 2000, sha1, "main")).files.length, 1);
    directoryCount = 1000;
    await assert.rejects(api.captureRepository(7000, 2000, sha1, "main"), /1000 entradas/);
    directoryCount = 1;
    const smallContent = content;
    content = Buffer.alloc(20 * 1024 * 1024, 7);
    const largest = await api.captureRepository(7000, 2000, sha1, "main");
    assert.equal(unzipSync(largest.zip)["world-security/solution.ts"].length, content.length, "Exactly 20 MiB must not be truncated or rejected by base64 response limits");
    content = Buffer.alloc(20 * 1024 * 1024 + 1);
    await assert.rejects(api.captureRepository(7000, 2000, sha1, "main"), /20 MiB/);
    content = smallContent;
    contentsMode = "100755";
    const executable = await api.captureRepository(7000, 2000, sha1, "main");
    assert.equal(executable.files[0].mode, "100755");
    const centralHeader = executable.zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    assert.ok(centralHeader >= 0);
    assert.equal((executable.zip.readUInt32LE(centralHeader + 38) >>> 16) & 0o777, 0o755, "ZIP preserves executable permissions");
    assert.equal(api.selectedFiles(executable.zip, "world-security", executable.files).manifest[0].mode, "100755");
    contentsMode = "100644";
    revealDuringCapture = true;
    await assert.rejects(api.captureRepository(7000, 2000, sha1, "main"), /privado/);
    revealDuringCapture = false; privateRepo = true;
    await assert.rejects(github.startGitHub(members[1], session, { teamId }));
    const first = new URL(await github.startGitHub(captain, session, { teamId }));
    assert.equal(first.searchParams.get("code_challenge_method"), "S256");
    await assert.rejects(github.finishGitHub(captain, "other-session", { state: first.searchParams.get("state"), code: "fixture-code" }));
    await github.finishGitHub(captain, session, { state: first.searchParams.get("state"), code: "fixture-code" });
    await assert.rejects(github.finishGitHub(captain, session, { state: first.searchParams.get("state"), code: "fixture-code" }));
    const expired = new URL(await github.startGitHub(captain, session, { teamId }));
    await database().query("UPDATE github_oauth_states SET expires_at=now()-interval '1 second'");
    await assert.rejects(github.finishGitHub(captain, session, { state: expired.searchParams.get("state"), code: "fixture-code" }));
    const linkRepository = async () => {
      const url = new URL(await github.startGitHub(captain, session, { teamId, repository: "fixture-captain/private-team" }));
      return github.finishGitHub(captain, session, { state: url.searchParams.get("state"), code: "fixture-code" });
    };
    privateRepo = false; await assert.rejects(linkRepository()); privateRepo = true;
    fork = true; await assert.rejects(linkRepository()); fork = false;
    badOwner = true; await assert.rejects(linkRepository()); badOwner = false;
    await linkRepository();
    await assert.rejects(github.githubDashboard(stranger, teamId));
    assert.equal((await github.commitPreview(captain, { teamId })).sha, sha2);
    await ops.saveChallenge(root, { eventId: "seguridad", title: "Private mission", instructions: "Deliver private code", status: "draft" });
    await assert.rejects(ops.saveChallenge(root, { eventId: "seguridad", title: "No deadline", instructions: "Invalid", status: "published", version: 1 }));
    await ops.saveChallenge(root, { eventId: "seguridad", title: "Private mission", instructions: "Deliver private code", status: "published", version: 1, deadline: "2027-04-01T20:00:00Z", allowResubmission: true });
    const deliver = (sha: string, previousId?: string) => github.deliverMission(captain, { teamId, eventId: "seguridad", sha, branch: "main", previousId });
    await assert.rejects(github.deliverMission(members[1], { teamId, eventId: "seguridad", sha: sha1, branch: "main" }));
    await assert.rejects(ops.submitEvidence(captain, { teamId, eventId: "seguridad", kind: "challenge", url: "https://github.com/public/fork" }));
    branchValid = false; await assert.rejects(deliver(sha1)); branchValid = true;
    truncate = true; await assert.rejects(deliver(sha1)); truncate = false;
    contentsMode = "120000"; await assert.rejects(deliver(sha1)); contentsMode = "100644";
    privateRepo = false; await assert.rejects(deliver(sha1)); privateRepo = true;
    expireDuringCapture = true; await assert.rejects(deliver(sha1)); expireDuringCapture = false;
    assert.equal((await database().query("SELECT id FROM submissions WHERE team_id=$1", [teamId])).rowCount, 0, "Deadline is checked again after GitHub capture");
    await database().query("UPDATE challenges SET deadline='2027-04-01T20:00:00Z' WHERE event_id='seguridad'");
    await deliver(sha1);
    let submitted = (await ops.operationsDashboard(root)).submissions.find(s => s.team_id === teamId && s.current)!;
    await assert.rejects(ops.reviewEvidence(root, { id: submitted.id, status: "approved", reason: "Too early" }));
    await assert.rejects(github.closeEvaluation(root, { eventId: "seguridad", reason: "Too early" }));
    await assert.rejects(database().query("UPDATE submissions SET commit_sha=$2 WHERE id=$1", [submitted.id, sha2]));
    const download = await github.downloadSubmission(root, submitted.id);
    assert.equal(download.sha, sha1); assert.equal(Buffer.from(unzipSync(download.zip)["world-security/solution.ts"]).toString(), content.toString());
    await assert.rejects(github.downloadSubmission(stranger, submitted.id));
    await assert.rejects(github.prepareSolution(root, { submissionId: submitted.id, folder: "world-security", reason: "Too early" }));
    await assert.rejects(deliver(sha2, "stale-id"));
    await database().query("UPDATE challenges SET allow_resubmission=false WHERE event_id='seguridad'");
    await assert.rejects(deliver(sha2, submitted.id));
    await database().query("UPDATE challenges SET allow_resubmission=true WHERE event_id='seguridad'");
    await deliver(sha2, submitted.id);
    const oldId = submitted.id;
    submitted = (await ops.operationsDashboard(root)).submissions.find(s => s.team_id === teamId && s.current)!;
    assert.equal(submitted.commit_sha, sha2);
    assert.equal((await github.downloadSubmission(root, oldId)).sha, sha1);
    assert.equal(requests.filter(r => r.method !== "GET" && r.path.startsWith(`/repos/${api.OFFICIAL_REPOSITORY}`)).length, 0, "No public writes during competition");
    await database().query("UPDATE challenges SET deadline=clock_timestamp()-interval '1 second' WHERE event_id='seguridad'");
    await assert.rejects(deliver(sha1, submitted.id));
    await assert.rejects(github.closeEvaluation(root, { eventId: "seguridad", reason: "Still pending" }));
    for (const member of members.slice(0, 3)) await ops.markAttendance(root, { teamId, eventId: "seguridad", userId: member.id, luma: true, present: true, atEnd: true, reason: "Fixture checked" });
    await ops.reviewEvidence(root, { id: submitted.id, status: "approved", reason: "Exact SHA verified" });
    let preview = (await ops.operationsDashboard(root)).previews.find(p => p.event.id === "seguridad")!.preview;
    await assert.rejects(ops.publishResults(root, { scope: "seguridad", fingerprint: preview.fingerprint }));
    await github.closeEvaluation(root, { eventId: "seguridad", reason: "All definitive SHAs evaluated" });
    await assert.rejects(ops.reviewEvidence(root, { id: submitted.id, status: "rejected", reason: "Evaluation closed" }));
    await ops.publishResults(root, { scope: "seguridad", fingerprint: preview.fingerprint });
    await assert.rejects(github.prepareSolution(members[1], { submissionId: submitted.id, folder: "world-security", reason: "Not staff" }));
    await assert.rejects(github.prepareSolution(root, { submissionId: oldId, folder: "world-security", reason: "Old SHA" }));
    await assert.rejects(github.prepareSolution(root, { submissionId: submitted.id, folder: "../world-security", reason: "Traversal" }));
    const published = (await database().query<{ id: string; ranking: ops.RankedTeam[] }>("SELECT id,ranking FROM publications WHERE scope='seguridad' AND current")).rows[0];
    await database().query("UPDATE publications SET ranking=$2 WHERE id=$1", [published.id, JSON.stringify(published.ranking.map(r => ({ ...r, posicion: 4 })))]);
    await assert.rejects(github.prepareSolution(root, { submissionId: submitted.id, folder: "world-security", reason: "Fourth cannot publish" }));
    await database().query("UPDATE publications SET ranking=$2 WHERE id=$1", [published.id, JSON.stringify(published.ranking)]);
    assert.throws(() => api.selectedFiles(download.zip, "missing"));
    await github.prepareSolution(root, { submissionId: submitted.id, folder: "world-security", reason: "Selected top three" });
    const job = (await github.githubDashboard(root)).jobs.find(j => j.submission_id === submitted.id)!;
    assert.equal(job.manifest.length, 1);
    await assert.rejects(github.publishSolution(root, { id: job.id, manifestDigest: job.manifest_digest, reason: "No consent" }));
    failBlob = true;
    await assert.rejects(github.publishSolution(root, { id: job.id, confirmed: true, manifestDigest: job.manifest_digest, reason: "Files and rights checked" }));
    assert.equal((await github.githubDashboard(root)).jobs.find(j => j.id === job.id)?.status, "failed");
    failBlob = false; failPrResponse = true;
    await assert.rejects(github.publishSolution(root, { id: job.id, confirmed: true, manifestDigest: job.manifest_digest, reason: "Retry same manifest" }));
    failPrResponse = false;
    await github.publishSolution(root, { id: job.id, confirmed: true, manifestDigest: job.manifest_digest, reason: "Reconcile ambiguous PR" });
    assert.equal(prWrites, 1); assert.equal(treeWrites, 1);
    assert.equal((await github.githubDashboard(root)).jobs.find(j => j.id === job.id)?.status, "pr");
    assert.equal((await github.hallOfFame()).length, 0);
    merged = true; await github.syncSolution(root, { id: job.id });
    assert.equal((await github.hallOfFame()).length, 1);
    await assert.rejects(github.syncSolution(captain, { id: job.id }));
    assert.equal((await database().query("SELECT * FROM github_accounts WHERE user_id=$1", [members[1].id])).rowCount, 0, "Non-captains never need GitHub");
    const publicTree = requests.find(r => r.path.endsWith("/git/trees") && r.method === "POST")!;
    assert.ok(JSON.stringify(publicTree.body).includes("solutions/seguridad/01-team-"));
    assert.ok(!JSON.stringify(publicTree.body).includes("private-team"), "Public tree never exposes private repository identity");
    await assert.rejects(github.deliverMission(captain, { teamId, eventId: "seguridad", sha: sha1, branch: "main", previousId: submitted.id }));
    await ops.requestCaptain(captain, { teamId, nextId: members[1].id, reason: "New GitHub captain" });
    const transfer = (await ops.operationsDashboard(root)).changes.find(c => c.team_id === teamId && c.status === "pending")!;
    await ops.reviewCaptain(root, { id: transfer.id, status: "approved", reason: "Captain must relink GitHub" });
    await service.redeem({ token: await findToken(members[1].email, "token"), purpose: "reset", password: "github-new-captain-123" });
    await assert.rejects(github.commitPreview(captain, { teamId }));
    await assert.rejects(github.commitPreview(members[1], { teamId }), "Old captain binding does not transfer to another account");
    await assert.rejects(github.startGitHub(captain, session, { teamId }));
    return { submissionId: submitted.id, sha: submitted.commit_sha, snapshotKey: settings.GITHUB_SNAPSHOT_KEY };
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(settings)) {
      if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
    }
    await unlink(keyFile);
  }
}
