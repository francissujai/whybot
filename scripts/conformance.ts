// Runs the official Meterless conformance runners (conformance/<engine>/runner.ts)
// against WhyBot's engines and saves the scorecards to conformance/results/.
//
//   npm run conformance

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engines = [
  { name: "markovian", envVar: "MARKOVIAN_IMPL", impl: "src/engines/markovian/index.ts" },
  { name: "hmem", envVar: "HMEM_IMPL", impl: "src/engines/hmem/index.ts" },
].filter((e) => fs.existsSync(path.join(root, "conformance", e.name, "runner.ts")) && fs.existsSync(path.join(root, e.impl)));

const outDir = path.join(root, "conformance", "results");
fs.mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const e of engines) {
  const implPath = path.join(root, e.impl).replaceAll("\\", "/");
  const r = spawnSync(process.execPath, ["--import", "tsx", path.join(root, "conformance", e.name, "runner.ts")], {
    cwd: path.join(root, "conformance", e.name),
    env: { ...process.env, [e.envVar]: implPath },
    encoding: "utf-8",
  });
  const out = `${r.stdout}${r.stderr}`;
  process.stdout.write(out);
  fs.writeFileSync(path.join(outDir, `${e.name}.txt`), `$ ${e.envVar}=${e.impl} npx tsx conformance/${e.name}/runner.ts\n# ${new Date().toISOString()}\n${out}`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
