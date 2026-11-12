import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { database } from "../src/lib/management/db.ts";
import { digest } from "../src/lib/management/crypto.ts";
import * as service from "../src/lib/management/service.ts";
import { queueMail, sendQueuedMail } from "../src/lib/management/mail.ts";
import { transaction } from "../src/lib/management/db.ts";
import { operationsScenarios, retentionScenario } from "./operations-scenarios.ts";
import * as operations from "../src/lib/management/operations.ts";
import { githubScenarios } from "./github-scenarios.ts";
import { unzipSync } from "fflate";

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port.");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

test("PostgreSQL: complete registration, event operations, publication and retention", { timeout: 180000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "league-management-pg-"));
  const port = await freePort();
  const postgres = new EmbeddedPostgres({
    databaseDir: join(directory, "data"), port, user: "league_test",
    password: "isolated-test-only", persistent: true,
    initdbFlags: ["--encoding=UTF8", "--no-locale"],
  });
  let started = false;
  try {
    await postgres.initialise();
    await postgres.start();
    started = true;
    process.env.DATABASE_URL = `postgresql://league_test:isolated-test-only@127.0.0.1:${port}/postgres`;
    process.env.APP_URL = "http://localhost:3000";
    process.env.REGISTRATION_ENABLED = "true";
    await database().query(await readFile(new URL("../database/001-management.sql", import.meta.url), "utf8"));
    await database().query("INSERT INTO schema_migrations(version) VALUES('001-management')");
    const legacyId = randomUUID();
    await database().query(`INSERT INTO users(id,email,first_name,last_name,password_hash,staff_status,community,terms_version,verified_at)
      VALUES($1,'legacy@example.test','Legacy','Fixture','unused','approved','Legacy community','league-2027-v1',now())`, [legacyId]);
    for (let i = 0; i < 2; i++) {
      const migration = spawn(process.execPath, [fileURLToPath(new URL("../scripts/migrate.mjs", import.meta.url))], { cwd: fileURLToPath(new URL("../", import.meta.url)), env: process.env, stdio: "pipe" });
      let output = "";
      migration.stdout.on("data", data => { output += String(data); });
      migration.stderr.on("data", data => { output += String(data); });
      const code = await new Promise<number | null>((resolve, reject) => { migration.once("error", reject); migration.once("exit", resolve); });
      assert.equal(code, 0, output);
    }
    assert.equal((await database().query("SELECT * FROM schema_migrations")).rowCount, 3);
    assert.equal((await database().query("SELECT * FROM staff_memberships WHERE user_id=$1 AND active", [legacyId])).rowCount, 1);

    const input = (address: string, staff = false) => ({
      email: address, firstName: "Fixture", lastName: "Test", password: "test-password-123",
      accepted: true, adult: true, staff, community: staff ? "Fixture community" : "",
    });
    const findToken = async (address: string, marker: string) => {
      const mails = await database().query<{ body: string }>("SELECT body FROM mail_outbox WHERE recipient=$1 ORDER BY created_at DESC", [address]);
      for (const { body } of mails.rows) {
        const value = new RegExp(`${marker}=([a-f0-9]{64})`).exec(body)?.[1];
        if (value) return value;
      }
      throw new Error("Expected fixture email not found.");
    };
    const verified = async (address: string, staff = false) => {
      await service.register(input(address, staff));
      const value = await findToken(address, "token");
      await service.redeem({ token: value, purpose: "verify" });
      await assert.rejects(service.redeem({ token: value, purpose: "verify" }));
      const session = await service.login(input(address));
      const user = await service.sessionUser(session);
      assert.ok(user);
      return user;
    };
    await assert.rejects(service.register({ ...input("minor@example.test"), adult: false }));
    await assert.rejects(service.register({ ...input("unchecked@example.test"), accepted: false }));
    const captain = await verified("captain@example.test");
    await assert.rejects(service.register(input("CAPTAIN@example.test")));
    await service.createTeam(captain, { name: "Fixture Team" });
    const board = await service.dashboard(captain);
    assert.ok(board.team);
    const teamId = board.team.id;
    await assert.rejects(service.submitTeam(captain, { teamId }));
    const stranger = await verified("stranger@example.test");
    await assert.rejects(service.invite(stranger, { teamId, email: "someone@example.test" }));
    await assert.rejects(service.createTeam(stranger, { name: " fixture  TEAM " }));
    await service.createTeam(stranger, { name: "Another Team" });
    const invitedStaffAddress = "invited-staff@example.test";
    await service.invite(captain, { teamId, email: invitedStaffAddress });
    const staffInvitation = await findToken(invitedStaffAddress, "invitacion");
    const invitedStaff = await verified(invitedStaffAddress, true);
    await assert.rejects(service.acceptInvitation(invitedStaff, { token: staffInvitation }), /no pueden participar/);
    const staffInviteId = (await database().query("SELECT id FROM invitations WHERE token_hash=$1", [digest(staffInvitation)])).rows[0].id;
    await service.cancelInvitation(captain, { teamId, invitationId: staffInviteId });
    for (let i = 0; i < 3; i++) {
      const address = `member${i}@example.test`;
      await service.invite(captain, { teamId, email: address });
      const value = await findToken(address, "invitacion");
      await assert.rejects(service.acceptInvitation(stranger, { token: value }));
      const member = await verified(address);
      await service.acceptInvitation(member, { token: value });
      await assert.rejects(service.acceptInvitation(member, { token: value }));
      await assert.rejects(service.createTeam(member, { name: `Cannot create ${i}` }));
    }
    assert.equal((await service.dashboard(captain)).members.length, 4);
    await assert.rejects(service.invite(captain, { teamId, email: "fifth@example.test" }));
    await service.submitTeam(captain, { teamId });
    await assert.rejects(service.renameTeam(captain, { teamId, name: "Changed during review" }));

    const pending = await verified("staff@example.test", true);
    await assert.rejects(service.createTeam(pending, { name: "Staff team" }), /no pueden participar/);
    await assert.rejects(service.invite(stranger, { teamId: (await service.dashboard(stranger)).team!.id, email: pending.email }), /no pueden participar/);
    await assert.rejects(service.review(pending, { id: teamId, kind: "team", status: "approved" }));
    const owner = await verified("owner-fixture@example.test");
    await database().query("UPDATE users SET is_owner=true,staff_status='approved' WHERE id=$1", [owner.id]);
    const root: service.User = { ...owner, staff_status: "approved", is_owner: true };
    await assert.rejects(service.createTeam(owner, { name: "Owner team" }), /no pueden participar/);
    await database().query("UPDATE users SET staff_status='pending' WHERE id=$1", [stranger.id]);
    await assert.rejects(service.review(root, { id: stranger.id, kind: "staff", status: "approved" }), /vinculada a un equipo/);
    await database().query("UPDATE users SET staff_status='none' WHERE id=$1", [stranger.id]);
    await service.review(root, { id: pending.id, kind: "staff", status: "approved" });
    const staff: service.User = { ...pending, staff_status: "approved" };
    await assert.rejects(service.createTeam(staff, { name: "Approved staff team" }), /no pueden participar/);
    const next = await verified("next-staff@example.test", true);
    await service.review(staff, { id: next.id, kind: "staff", status: "approved" });
    await assert.rejects(service.review(staff, { id: next.id, kind: "staff", status: "removed" }));
    await service.review(staff, { id: teamId, kind: "team", status: "correction", reason: "Fixture correction" });
    await service.renameTeam(captain, { teamId, name: "Corrected Team" });
    await service.submitTeam(captain, { teamId });
    await service.review(staff, { id: teamId, kind: "team", status: "approved" });
    await assert.rejects(service.review(staff, { id: teamId, kind: "team", status: "approved" }));
    assert.equal((await service.dashboard(captain)).team.status, "approved");
    await service.review(root, { id: next.id, kind: "staff", status: "removed" });
    await service.requestAccountMail({ email: captain.email }, "reset");
    const reset = await findToken(captain.email, "token");
    await service.redeem({ token: reset, purpose: "reset", password: "new-test-password-123" });
    await assert.rejects(service.login(input(captain.email)));
    const valid = await service.login({ email: captain.email, password: "new-test-password-123" });
    assert.ok(await service.sessionUser(valid));
    const audit = await database().query("SELECT count(*) AS count FROM audit_log");
    assert.ok(Number(audit.rows[0].count) > 10);
    const rawToken = randomUUID();
    const sessionCount = await database().query("SELECT count(*) FROM sessions WHERE token_hash=$1", [digest(rawToken)]);
    assert.equal(Number(sessionCount.rows[0].count), 0);
    const staffBoard = await service.staffDashboard(staff);
    assert.ok(staffBoard.mails.length > 0); // Pending mail is observable, never silently treated as sent.
    let acceptedMessages = 0;
    let rejectRecipients = false;
    const smtp = createServer(socket => {
      let buffer = "", inMessage = false;
      socket.write("220 fixture SMTP\r\n");
      socket.on("data", chunk => {
        buffer += chunk.toString();
        while (buffer.includes("\r\n")) {
          const end = buffer.indexOf("\r\n");
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (inMessage) {
            if (line === ".") { inMessage = false; acceptedMessages++; socket.write("250 Accepted\r\n"); }
          } else if (/^(EHLO|HELO)/i.test(line)) socket.write("250 fixture\r\n");
          else if (/^MAIL FROM/i.test(line)) socket.write("250 OK\r\n");
          else if (/^RCPT TO/i.test(line)) socket.write(rejectRecipients ? "550 Rejected\r\n" : "250 OK\r\n");
          else if (line === "DATA") { inMessage = true; socket.write("354 Send data\r\n"); }
          else if (line === "QUIT") { socket.end("221 Bye\r\n"); }
          else socket.write("250 OK\r\n");
        }
      });
    });
    await new Promise<void>(resolve => smtp.listen(0, "127.0.0.1", resolve));
    const smtpAddress = smtp.address();
    assert.ok(smtpAddress && typeof smtpAddress !== "string");
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(smtpAddress.port);
    process.env.MAIL_FROM = "Fixture <fixture@example.test>";
    try {
      assert.ok(await sendQueuedMail() > 0);
      assert.ok(acceptedMessages > 0);
      const sentBodies = await database().query("SELECT id FROM mail_outbox WHERE status='sent' AND body<>''");
      assert.equal(sentBodies.rowCount, 0);
      rejectRecipients = true;
      await transaction(client => queueMail(client, "rejected@example.test", "Fixture", "Fixture body"));
      await assert.rejects(sendQueuedMail());
      const failure = await database().query("SELECT status,last_error FROM mail_outbox WHERE recipient='rejected@example.test'");
      assert.equal(failure.rows[0].status, "failed");
      assert.ok(failure.rows[0].last_error);
    } finally {
      await new Promise<void>((resolve, reject) => smtp.close(error => error ? reject(error) : resolve()));
    }

    await operationsScenarios({ captain, staff, root, teamId, verified, findToken });
    const githubFixture = await githubScenarios({ root, directory, verified, findToken });
    if (process.env.LEAGUE_PRODUCTION_TEST === "true") {
      const reviewed = await operations.operationsDashboard(root);
      for (const { event, preview } of reviewed.previews.filter(p => p.preview.rows.length)) {
        assert.equal(preview.pending, false, "Fixture results are ready for publication");
        await operations.publishResults(root, { scope: event.id, fingerprint: preview.fingerprint });
      }
      const httpPort = await freePort();
      const origin = `https://localhost:${httpPort}`;
      const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
      const server = spawn(process.execPath, [join(rootDirectory, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(httpPort)],
        { cwd: rootDirectory, env: { ...process.env, NODE_ENV: "production", APP_URL: origin, DATABASE_SSL: "false", GITHUB_SNAPSHOT_KEY: githubFixture.snapshotKey }, stdio: "pipe" });
      let output = "";
      server.stdout.on("data", data => { output = (output + String(data)).slice(-4000); });
      server.stderr.on("data", data => { output = (output + String(data)).slice(-4000); });
      try {
        let ready = false;
        const readinessDeadline = Date.now() + 60000;
        while (Date.now() < readinessDeadline) {
          if (server.exitCode !== null) throw new Error(`Production server exited: ${output}`);
          try { ready = (await fetch(`http://localhost:${httpPort}/acceso`, { signal: AbortSignal.timeout(1000) })).ok; }
          catch (error) {
            if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === "TimeoutError")) throw error;
          }
          if (ready) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(ready, `Production server did not become ready within 60 seconds: ${output}`);
        const post = (action: string, body: Record<string, unknown>, cookie?: string, suppliedOrigin = origin) =>
          fetch(`http://localhost:${httpPort}/api/gestion/${action}`, {
            method: "POST", headers: { "Content-Type": "application/json", Origin: suppliedOrigin, ...(cookie ? { Cookie: cookie } : {}) },
            body: JSON.stringify(body),
          });
        assert.equal((await post("create-team", { name: "Anonymous" })).status, 401);
        assert.equal((await post("login", { email: captain.email, password: "new-test-password-123" }, undefined, "https://untrusted.example")).status, 403);
        const login = await post("login", { email: captain.email, password: "new-test-password-123" });
        assert.equal(login.status, 200);
        const cookie = login.headers.get("set-cookie");
        assert.ok(cookie);
        assert.ok(cookie.includes("HttpOnly") && cookie.includes("Secure"));
        const credentials = cookie.split(";")[0];
        assert.equal((await post("review", { kind: "staff", id: root.id, status: "removed" }, credentials)).status, 403);
        assert.equal((await post("attendance", { teamId, eventId: "negocio", userId: captain.id, luma: true, present: true, atEnd: true, reason: "No staff" }, credentials)).status, 403);
        assert.equal((await post("publish-solution", { id: randomUUID(), confirmed: true, reason: "No staff" }, credentials)).status, 403);
        assert.equal((await post("deliver-mission", { teamId: (await database().query("SELECT team_id FROM submissions WHERE id=$1", [githubFixture.submissionId])).rows[0].team_id, eventId: "seguridad", sha: "a".repeat(40), branch: "main" }, credentials)).status, 403);
        const snapshotUrl = `http://localhost:${httpPort}/api/github/snapshot/${githubFixture.submissionId}`;
        assert.equal((await fetch(snapshotUrl)).status, 401);
        assert.equal((await fetch(snapshotUrl, { headers: { Cookie: credentials } })).status, 403);
        const participantPage = await fetch(`http://localhost:${httpPort}/mi-equipo`, { headers: { Cookie: credentials } });
        const participantHtml = await participantPage.text();
        assert.equal(participantPage.status, 200);
        assert.match(participantHtml, /<nav class="site-nav"[^>]*>[\s\S]*?Mi equipo[\s\S]*?Cerrar sesión[\s\S]*?<\/nav>/);
        assert.equal((await fetch(`http://localhost:${httpPort}/api/gestion/export`)).status, 401);
        assert.equal((await fetch(`http://localhost:${httpPort}/api/gestion/export`, { headers: { Cookie: credentials } })).status, 403);
        const rootLogin = await post("login", { email: root.email, password: "test-password-123" });
        assert.equal(rootLogin.status, 200);
        const rootCookie = rootLogin.headers.get("set-cookie")!.split(";")[0];
        const snapshot = await fetch(snapshotUrl, { headers: { Cookie: rootCookie } });
        assert.equal(snapshot.status, 200);
        assert.equal(snapshot.headers.get("content-type"), "application/zip");
        assert.equal(snapshot.headers.get("cache-control"), "no-store");
        assert.ok(snapshot.headers.get("content-disposition")?.includes(githubFixture.sha!));
        const snapshotFiles = unzipSync(new Uint8Array(await snapshot.arrayBuffer()));
        assert.deepEqual(Object.keys(snapshotFiles), ["world-security/solution.ts"]);
        assert.equal(Buffer.from(snapshotFiles["world-security/solution.ts"]).toString(), "export const mission = 'private fixture';\n");
        const staffPage = await fetch(`http://localhost:${httpPort}/gestion`, { headers: { Cookie: rootCookie } });
        const staffHtml = await staffPage.text();
        assert.equal(staffPage.status, 200);
        assert.ok(staffHtml.includes("Cerrar sesión") && staffHtml.includes("Mi cuenta"));
        assert.match(staffHtml, /<details class="management-section"><summary>Solicitudes de staff/);
        assert.match(staffHtml, /<details class="management-section"><summary>Operación de equipos y mundos/);
        const ownerPage = await fetch(`http://localhost:${httpPort}/mi-equipo`, { headers: { Cookie: rootCookie } });
        const ownerHtml = await ownerPage.text();
        assert.ok(ownerHtml.includes("Mi cuenta") && !ownerHtml.includes("Crear equipo como capitán"));
        const activationPage = await fetch(`http://localhost:${httpPort}/acceso?token=${"a".repeat(64)}&purpose=reset`);
        const activationHtml = await activationPage.text();
        const activationMain = activationHtml.match(/<main id="contenido">([\s\S]*?)<\/main>/)?.[1];
        assert.ok(activationMain);
        assert.ok(activationMain.includes("Nueva contraseña"));
        assert.ok(!activationMain.includes("¿Has olvidado tu contraseña?") && !activationMain.includes("<h2>Entrar</h2>"));
        for (const title of ["Operación de equipos y mundos", "Retos y cierre de eventos", "Vouchers y premios", "Retención de temporada"]) assert.ok(staffHtml.includes(title), `Missing staff surface: ${title}`);
        const csv = await fetch(`http://localhost:${httpPort}/api/gestion/export`, { headers: { Cookie: rootCookie } });
        assert.equal(csv.status, 200);
        assert.ok(csv.headers.get("content-type")?.startsWith("text/csv"));
        const exported = await csv.text();
        assert.ok(exported.includes(captain.email) && exported.includes("Original"));
        const publicPage = await fetch(`http://localhost:${httpPort}/clasificacion`);
        assert.equal(publicPage.status, 200);
        const publicHtml = await publicPage.text();
        assert.ok(publicHtml.includes("Corrected Team"), "Published event rankings render real teams");
        assert.ok(!publicHtml.includes(captain.email), "Public page does not expose participants");
        for (const privateValue of ["private-team", githubFixture.sha!, githubFixture.snapshotKey, "ephemeral-fixture-user-token", "private-read-fixture-token", "publisher-fixture-token"]) {
          assert.ok(!publicHtml.includes(privateValue), "Public ranking does not expose private GitHub data");
          assert.ok(!staffHtml.includes(privateValue) || privateValue === githubFixture.sha || privateValue === "private-team", "Staff HTML never serializes tokens or snapshot keys");
        }
        assert.equal((await post("retire-season", {}, rootCookie)).status, 400, "Destructive retirement requires confirmation");
        assert.equal((await post("logout", {}, credentials)).status, 200);
        assert.equal((await post("create-team", { name: "After logout" }, credentials)).status, 401);
      } finally {
        server.kill();
        await new Promise<void>(resolve => {
          if (server.exitCode !== null) resolve();
          else server.once("exit", () => resolve());
        });
      }
    }
    await retentionScenario(root);
  } finally {
    if (started) {
      await database().end();
      await postgres.stop();
    }
    await rm(directory, { recursive: true, force: true });
  }
});
