import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { zipSync } from "fflate";
import { commitSha, repositoryName, safePath, encryptSnapshot, decryptSnapshot, selectedFiles } from "../src/lib/management/github-api.ts";
import { readFileSync } from "node:fs";

test("GitHub repository, SHA and publication paths cannot select arbitrary resources", () => {
  assert.equal(repositoryName("captain/private-team"), "captain/private-team");
  for (const value of ["../private", "owner/../repo", "https://github.com/owner/repo", "owner/repo?secret", "owner/."]) assert.throws(() => repositoryName(value));
  assert.equal(commitSha("a".repeat(40)), "a".repeat(40));
  for (const sha of ["main", "a".repeat(7), "../main"]) assert.throws(() => commitSha(sha));
  for (const path of ["../code", "/code", "code\\file", "code/../file", "code//file", "code/\0file", "code/C:file", "__proto__/file"]) assert.throws(() => safePath(path));
  assert.equal(safePath("code/constructor.ts"), "code/constructor.ts");
});
test("Snapshots are authenticated, encrypted and bound to their immutable submission", () => {
  const previous = process.env.GITHUB_SNAPSHOT_KEY;
  process.env.GITHUB_SNAPSHOT_KEY = randomBytes(32).toString("base64");
  try {
    const value = Buffer.from("private fixture solution"), encrypted = encryptSnapshot(value, "submission-a");
    assert.ok(!encrypted.includes(value));
    assert.deepEqual(decryptSnapshot(encrypted, "submission-a"), value);
    assert.throws(() => decryptSnapshot(encrypted, "submission-b"));
    const corrupted = Buffer.from(encrypted); corrupted[15] ^= 1;
    assert.throws(() => decryptSnapshot(corrupted, "submission-a"));
  } finally {
    if (previous === undefined) delete process.env.GITHUB_SNAPSHOT_KEY; else process.env.GITHUB_SNAPSHOT_KEY = previous;
  }
});
test("Publication selects only the reviewed folder and rejects common secret files", () => {
  const zip = Buffer.from(zipSync({ "world/solution.ts": Buffer.from("fixture"), "other/private.ts": Buffer.from("not selected") }));
  const chosen = selectedFiles(zip, "world");
  assert.deepEqual(chosen.manifest.map(f => f.path), ["world/solution.ts"]);
  for (const [path, content] of [
    ["world/.env", "password=fixture"], ["world/server.pem", "fixture"], ["world/credential.txt", "-----BEGIN PRIVATE KEY-----"],
  ]) {
    assert.throws(() => selectedFiles(Buffer.from(zipSync({ [path]: Buffer.from(content) })), "world"));
  }
});
test("League exposes captain delivery, staff-only publication and exact-SHA review", () => {
  const panel = readFileSync(new URL("../src/components/operations-panel.tsx", import.meta.url), "utf8");
  const mission = readFileSync(new URL("../src/components/mission-delivery.tsx", import.meta.url), "utf8");
  assert.match(panel, /label="Vincular GitHub"/);
  assert.match(mission, /label="Entregar misión"/);
  assert.match(panel, /api\/github\/snapshot/);
  assert.match(panel, /s\.commit_sha/);
  assert.match(panel, /manifestDigest: job\.manifest_digest/);
  assert.match(panel, /He revisado todos los archivos/);
});
