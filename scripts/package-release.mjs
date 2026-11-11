import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const destination = join(root, "dist", "web");
try {
  await readdir(destination);
  throw new Error("dist/web already exists. Remove the previous release before packaging.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await readFile(join(root, ".next", "BUILD_ID"), "utf8");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
for (const name of Object.keys(manifest.devDependencies ?? {})) {
  try {
    await readFile(join(root, "node_modules", ...name.split("/"), "package.json"));
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  throw new Error(`Development dependency ${name} is still installed. Run npm prune --omit=dev first.`);
}
await mkdir(destination, { recursive: true });
for (const name of ["src", "public", "content", "database", "node_modules"]) {
  await cp(join(root, name), join(destination, name), { recursive: true, dereference: true });
}
await cp(join(root, ".next"), join(destination, ".next"), {
  recursive: true,
  filter: source => source !== join(root, ".next", "cache"),
});
await mkdir(join(destination, "scripts"));
for (const name of ["azure-initialize.mjs", "azure-maintenance.mjs", "migrate.mjs", "database.mjs", "verify-azure-database.mjs", "bootstrap.mjs", "send-mail.mjs", "retire-data.mjs"]) {
  await cp(join(root, "scripts", name), join(destination, "scripts", name));
}
await writeFile(join(destination, "package.json"), JSON.stringify({
  name: manifest.name,
  version: manifest.version,
  private: true,
  engines: manifest.engines,
  scripts: {
    start: manifest.scripts.start,
    "db:migrate": manifest.scripts["db:migrate"],
    "staff:bootstrap": manifest.scripts["staff:bootstrap"],
    "mail:send": manifest.scripts["mail:send"],
    "data:retire": manifest.scripts["data:retire"],
  },
  dependencies: manifest.dependencies,
}, null, 2));
console.log("Production web release created in dist/web; no secrets, tests, build cache or development dependencies.");
