import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

test("the release package includes only production website files", async () => {
  const root = await mkdtemp(join(tmpdir(), "league-release-"));
  const file = async (name: string, value = "fixture") => {
    const path = join(root, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value);
  };
  const run = () => spawnSync(process.execPath, [join(root, "scripts", "package-release.mjs")], { encoding: "utf8" });
  try {
    await file("package.json", JSON.stringify({
      name: "league-fixture", version: "1.0.0", engines: { node: "24.x" },
      scripts: { start: "next start", test: "should-not-ship" },
      dependencies: { pg: "8.16.0" }, devDependencies: { "test-tool": "1.0.0" },
    }));
    for (const name of ["src/app/page.tsx", "public/logo.png", "content/temporada.json", "database/001-management.sql", "node_modules/pg/package.json", ".next/BUILD_ID", ".next/server/app.js", ".next/cache/ignored", ".env.local", "tests/ignored.ts", "knowledge/ignored"]) await file(name);
    for (const name of ["azure-initialize.mjs", "azure-maintenance.mjs", "migrate.mjs", "database.mjs", "verify-azure-database.mjs", "bootstrap.mjs", "send-mail.mjs", "retire-data.mjs"]) await file(`scripts/${name}`);
    await cp(new URL("../scripts/package-release.mjs", import.meta.url), join(root, "scripts", "package-release.mjs"));
    await file("node_modules/test-tool/package.json", "{}");
    const rejected = run();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Development dependency test-tool is still installed/);
    await rm(join(root, "node_modules", "test-tool"), { recursive: true });
    const packaged = run();
    assert.equal(packaged.status, 0, packaged.stderr);
    for (const name of ["public/logo.png", ".next/BUILD_ID", "database/001-management.sql", "scripts/migrate.mjs", "node_modules/pg/package.json"]) {
      assert.ok((await stat(join(root, "dist", "web", name))).isFile());
    }
    for (const name of [".env.local", "tests", "knowledge", ".next/cache", "scripts/package-release.mjs"]) {
      await assert.rejects(stat(join(root, "dist", "web", name)), { code: "ENOENT" });
    }
    const manifest = JSON.parse(await readFile(join(root, "dist", "web", "package.json"), "utf8"));
    assert.equal(manifest.devDependencies, undefined);
    assert.equal(manifest.scripts.test, undefined);
    const duplicate = run();
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /already exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
