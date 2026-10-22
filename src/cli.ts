// WhyBot command line.
//
//   npm run check                         provider + Zetaris checks
//   npm run why -- "Why did trial signups drop 18% last week?"
//
// Each investigation writes runs/<timestamp>/ with report.md, report.html,
// evidence.json (every SQL + rows) and run.json (the Markovian run record).

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./env.ts";
import { checkProvider, MeterlessProvider, ReceiptLog } from "./llm/meterless.ts";
import { ZetarisClient } from "./zetaris/client.ts";
import { EvidenceLedger } from "./agent/evidence.ts";
import { investigate } from "./agent/investigator.ts";
import { checkCitations, renderHtml, writeReport } from "./agent/report.ts";
import { learn, openMemory, recall } from "./agent/memory.ts";
import { asOf } from "./agent/catalog.ts";

const [, , command, ...rest] = process.argv;

async function check(): Promise<number> {
  let failures = 0;
  const line = (ok: boolean, name: string, detail: string) => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  };
  try {
    const llm = new MeterlessProvider();
    for (const r of await checkProvider(llm)) line(r.ok, `Power · ${r.name}`, r.detail);
  } catch (err) {
    line(false, "Power · config", (err as Error).message);
  }
  try {
    const z = new ZetarisClient();
    const one = await z.run("SELECT 1 AS one");
    line(String(one.rows[0]?.[0]) === "1", "Data · Zetaris SELECT 1", `${one.ms} ms`);
    for (const t of ["ads_pg.ad_spend_daily", "app_pg.accounts", "app_pg.trial_signups_daily", "whybot.ca_holidays"]) {
      try {
        const r = await z.run(`SELECT count(*) AS n FROM ${t}`);
        line(true, `Data · ${t}`, `${r.rows[0]?.[0]} rows`);
      } catch (err) {
        line(false, `Data · ${t}`, (err as Error).message.slice(0, 200));
      }
    }
  } catch (err) {
    line(false, "Data · Zetaris", (err as Error).message);
  }
  return failures ? 1 : 0;
}

async function why(question: string): Promise<number> {
  if (!question) {
    console.error('Usage: npm run why -- "Why did trial signups drop 18% last week?"');
    return 2;
  }
  const useMemory = !flags.has("--no-memory");
  const llm = new ReceiptLog(new MeterlessProvider());
  if (flags.has("--verbose")) llm.onCall = (c) => console.log(`    · ${c.purpose} ${(c.ms / 1000).toFixed(1)}s ${c.error ? `FAILED ${c.error.slice(0, 80)}` : `${c.route?.label ?? "?"} ${c.usage ? `${c.usage.promptTokens}+${c.usage.completionTokens}` : ""}`}`);
  const ledger = new EvidenceLedger(new ZetarisClient());
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(ROOT, "runs", stamp);
  fs.mkdirSync(dir, { recursive: true });

  console.log(`WhyBot · ${question}\nmodel ${llm.model} via ${llm.name}\n`);
  const mem = useMemory ? openMemory() : undefined;
  const { context, recalled } = mem ? recall(mem, question) : { context: "", recalled: [] };
  console.log(mem ? `H-MEM recalled ${recalled.length} memories${recalled.length ? ":\n" + recalled.map((m) => `  ${m.id} ${m.content.slice(0, 110)}`).join("\n") : ""}\n` : "memory off\n");

  const inv = await investigate({
    question,
    llm,
    ledger,
    memoryContext: context || undefined,
    historyDir: path.join(ROOT, "runs"),
    events: {
      onQuery: (q) => console.log(`  ${q.id.padEnd(4)} ${q.hypothesis.padEnd(4)} ${q.purpose}${q.error ? `  ✗ ${q.error.slice(0, 120)}` : `  (${q.rows} rows)`}`),
      onGuard: (m) => console.log(`  guard: ${m}`),
      onChunk: (c, carry) =>
        console.log(`step ${c.id} done · prompt ${c.promptTokens ?? "?"} tokens · carryover ${Math.ceil(carry.length / 4)} tokens\n${indent(carry)}\n`),
    },
  });
  console.log(`investigation ${inv.run.status} in ${(inv.run.durationMs / 1000).toFixed(0)} s, ${inv.run.chunks.length} steps, ${ledger.items.length} queries`);
  if (inv.run.error) console.log(`  note: ${inv.run.error}`);
  if (!inv.run.chunks.length) {
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(inv.run, null, 2));
    fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(ledger.items, null, 2));
    fs.writeFileSync(path.join(dir, "receipts.json"), JSON.stringify(llm.calls, null, 2));
    console.error("no investigation steps completed; skipping the report");
    return 1;
  }

  const report = await writeReport(inv, llm.as("report"));
  const check = checkCitations(report, ledger.items);
  const w = asOf();
  const written = mem ? learn(mem, inv, stamp, `Week ${w.lastWeek[0]}..${w.lastWeek[1]}`) : [];
  if (mem) console.log(`H-MEM stored ${written.length} findings`);
  fs.writeFileSync(path.join(dir, "report.md"), `# ${question}\n\n${report}\n`);
  fs.writeFileSync(path.join(dir, "report.html"), renderHtml(inv, report, check, { provider: llm.name, model: llm.model, recalled, written, receipts: llm.summary() }));
  fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(ledger.items, null, 2));
  fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(inv.run, null, 2));
  fs.writeFileSync(path.join(dir, "receipts.json"), JSON.stringify(llm.calls, null, 2));
  for (const r of llm.summary()) console.log(`served by ${r.label} (${r.provider}, ${r.kind}): ${r.calls} calls, ${r.tokensIn}+${r.tokensOut} tokens`);

  console.log(`\n${report}\n`);
  console.log(`citations: ${check.cited.length} cited, ${check.unknown.length} unknown, ${check.uncitedNumbers.length} uncited numbers`);
  console.log(`report: ${path.join(dir, "report.html")}`);
  return inv.run.status === "completed" ? 0 : 1;
}

const indent = (s: string) => s.split("\n").map((l) => `    ${l}`).join("\n");

/** npm run memory -- list | feedback <id> helpful|not_helpful|wrong | sleep [--apply] | dream | approve <id> | conflicts */
async function memory(): Promise<number> {
  const mem = openMemory();
  const [sub, a, b] = args;
  switch (sub ?? "list") {
    case "list":
      for (const m of mem.store.all()) {
        console.log(`${m.id.padEnd(8)} ${m.layer.padEnd(10)} conf ${m.confidence.toFixed(2)} ${m.domain.padEnd(11)} ${m.supersededBy ? `(superseded by ${m.supersededBy}) ` : ""}${m.content.slice(0, 120)}`);
      }
      return 0;
    case "feedback": {
      const m = mem.feedback(a, b as "helpful" | "not_helpful" | "wrong");
      console.log(`${m.id} confidence now ${m.confidence.toFixed(2)}${m.tags.includes("review") ? " (tagged review)" : ""}`);
      return 0;
    }
    case "sleep": {
      const plan = mem.sleep.preview();
      console.log(`sleep preview: consolidate ${plan.toConsolidate.length}, archive ${plan.toArchive.length}, synthesize ${plan.toSynthesize.length}`);
      console.log(JSON.stringify(plan, null, 2));
      if (flags.has("--apply")) console.log(mem.sleep.execute(plan));
      else console.log("preview only; add --apply to execute (a backup is taken first)");
      return 0;
    }
    case "dream":
      for (const p of mem.dreaming.dream()) console.log(`${p.id} ${p.type}: ${p.content.slice(0, 200)}`);
      console.log("nothing is stored until you run: npm run memory -- approve <dream-id>");
      return 0;
    case "approve": {
      const m = mem.dreaming.approve(a);
      console.log(m ? `stored ${m.id} (long_term, derived from ${m.derivedFrom?.join(", ")})` : "approved");
      return 0;
    }
    case "conflicts":
      for (const c of mem.conflicts.scan()) console.log(`${c.id} ${c.memoryA} vs ${c.memoryB}: ${c.reason} (${c.confidence.toFixed(2)}) -> ${mem.conflicts.autoResolve(c)}`);
      return 0;
    default:
      console.error("memory commands: list, feedback <id> <helpful|not_helpful|wrong>, sleep [--apply], dream, approve <id>, conflicts");
      return 2;
  }
}

const flags = new Set(rest.filter((r) => r.startsWith("--")));
const args = rest.filter((r) => !r.startsWith("--"));

const commands: Record<string, () => Promise<number>> = {
  check,
  why: () => why(args.join(" ").trim()),
  memory,
};

const fn = commands[command ?? ""];
if (!fn) {
  console.error(`Commands: ${Object.keys(commands).join(", ")}`);
  process.exit(2);
}
// exitCode, not process.exit(): exiting while fetch sockets close trips a libuv assertion on Windows.
fn().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`error: ${(err as Error).message}`);
    process.exitCode = 1;
  },
);
