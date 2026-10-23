// WhyBot command line.
//
//   npm run check                         provider + Zetaris checks
//   npm run why -- "Why did trial signups drop 18% last week?"
//
// Each investigation writes runs/<timestamp>/ with report.md, report.html,
// evidence.json (every SQL + rows) and run.json (the Markovian run record).

import { checkProvider, MeterlessProvider } from "./llm/meterless.ts";
import { ZetarisClient } from "./zetaris/client.ts";
import { openMemory } from "./agent/memory.ts";
import { runSession } from "./agent/session.ts";

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
  const verbose = flags.has("--verbose");
  const result = await runSession(question, {
    useMemory: !flags.has("--no-memory"),
    onEvent: (e) => {
      switch (e.type) {
        case "start":
          return console.log(`WhyBot · ${e.question}
model ${e.model} via ${e.provider}
`);
        case "memory":
          return console.log(`H-MEM recalled ${e.recalled.length} memories${e.recalled.map((m) => `
  ${m.id} ${m.content.slice(0, 110)}`).join("")}
`);
        case "call":
          if (verbose) console.log(`    · ${e.purpose} ${e.seconds.toFixed(1)}s ${e.error ? `FAILED ${e.error.slice(0, 80)}` : `${e.model ?? "?"} (${e.kind ?? "?"}) ${e.tokensIn ?? ""}+${e.tokensOut ?? ""}`}`);
          return;
        case "query":
          return console.log(`  ${e.id.padEnd(4)} ${e.hypothesis.padEnd(4)} ${e.purpose}${e.error ? `  ✗ ${e.error.slice(0, 120)}` : `  (${e.rows} rows)`}`);
        case "guard":
          return console.log(`  guard: ${e.message}`);
        case "step":
          return console.log(`step ${e.step} done · prompt ${e.promptTokens ?? "?"} tokens · carryover ${Math.ceil(e.state.length / 4)} tokens
${indent(e.state)}
`);
        case "report":
          return console.log(`
${e.markdown}

citations: ${e.cited} cited, ${e.unknown} unknown, ${e.uncited} uncited numbers`);
        case "error":
          return console.error(`error: ${e.message}`);
        case "done":
          for (const s of e.served) console.log(`served by ${s}`);
          return console.log(`investigation ${e.status} in ${e.seconds.toFixed(0)} s, ${e.steps} steps, ${e.queries} queries${e.reportPath ? `
report: ${e.reportPath}` : ""}`);
      }
    },
  });
  return result.ok ? 0 : 1;
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
