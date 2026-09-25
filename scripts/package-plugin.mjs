import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = path.join(projectRoot, "release", "viso-to-svg");

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });
await cp(path.join(projectRoot, "dist-visio", "main.js"), path.join(releaseRoot, "main.js"));
await cp(
  path.join(projectRoot, "dist-visio", "main.js.map"),
  path.join(releaseRoot, "main.js.map"),
);
await cp(
  path.join(projectRoot, "visio-manifest.json"),
  path.join(releaseRoot, "manifest.json"),
);
await cp(path.join(projectRoot, "bin"), path.join(releaseRoot, "bin"), {
  recursive: true,
});

console.log(`Plugin package created at ${path.relative(projectRoot, releaseRoot)}`);
