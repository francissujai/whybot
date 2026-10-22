// Markovian orchestrator (spec section 4.5): build prompt -> generate -> clean
// markers -> account tokens -> compress state -> repeat until [TASK_COMPLETE]
// or maxChunks. Chunk 1 sees memory and attachments; later chunks see only the
// truncated goal, the carryover, and (optionally) an [OVERLAP] tail. A
// reflection pass runs at the end and can never fail the run.

import fs from "node:fs";
import path from "node:path";
import { nextCarryover } from "./carryover.ts";
import { resolveConfig, runEfficiency } from "./config.ts";
import { cleanMarkers, parseMarkers } from "./markers.ts";
import { estimateTokens } from "./types.ts";
import type { Attachment, ChunkConfig, ChunkInfo, Generator, MarkovianOptions, MarkovianRun, Mode, RunOptions } from "./types.ts";

const MARKER_RULES =
  "End every non-final chunk with [STATE_CHECKPOINT] followed by a concise state block:\n" +
  "COMPLETED: ...\nREMAINING: ...\nDECISIONS: ...\nCONTEXT: ...\n" +
  "End the final chunk with [TASK_COMPLETE]. Exactly one marker per chunk. Never narrate the markers.";

export function buildPrompt(args: {
  mode: Mode;
  goal: string;
  step: number;
  carryover: string;
  overlapText: string;
  memoryContext?: string;
  attachments: Attachment[];
}): string {
  const parts: string[] = [];
  if (args.step === 1) {
    if (args.memoryContext) parts.push(args.memoryContext.trim(), "");
    parts.push(
      args.mode === "RESEARCH"
        ? "You are running a recursive investigation in bounded chunks. Take one step per chunk and keep a compact state snapshot."
        : "You are executing a long build task in bounded chunks. Analyze the goal, produce a plan, and start implementation.",
      "",
      `User Request: ${args.goal}`,
    );
    for (const a of args.attachments) parts.push("", `[ATTACHMENT ${a.name}]\n${a.content}`);
  } else {
    parts.push(`Continuing a chunked ${args.mode.toLowerCase()} run. Goal (truncated): ${args.goal.slice(0, 200)}`, "", `[CARRYOVER STATE]\n${args.carryover}`);
    if (args.overlapText) parts.push("", `[OVERLAP]\n${args.overlapText}`);
    parts.push("", "Continue exactly where the state leaves off. Do not repeat completed work.");
  }
  parts.push("", MARKER_RULES);
  return parts.join("\n");
}

let runSeq = 0;

export class Markovian {
  readonly config: ChunkConfig;
  private clock: () => number;
  private generator?: Generator;
  private compressorFn?: MarkovianOptions["compressorFn"];
  private historyFile?: string;

  constructor(opts: MarkovianOptions = {}) {
    this.config = resolveConfig(opts.chunkConfig);
    this.clock = opts.clock ?? Date.now;
    this.generator = opts.generator;
    this.compressorFn = opts.compressorFn;
    if (opts.historyDir) {
      fs.mkdirSync(opts.historyDir, { recursive: true });
      this.historyFile = path.join(opts.historyDir, "history.json");
    }
  }

  async run(options: RunOptions): Promise<MarkovianRun> {
    const goal = options.goal ?? options.prompt;
    if (!goal) throw new Error("Markovian: run needs a goal or prompt");
    const generator = options.generator ?? this.generator;
    if (!generator) throw new Error("Markovian: provide a generator");
    const mode: Mode = options.mode ?? "ARCHITECT";
    const config = { ...this.config };
    const start = this.clock();

    const run: MarkovianRun = {
      id: `run-${start}-${++runSeq}`,
      timestamp: start,
      prompt: goal.slice(0, 500),
      mode,
      chunkConfig: config,
      chunks: [],
      totalTokensUsed: 0,
      totalTokensSaved: 0,
      efficiencyPercent: 0,
      durationMs: 0,
      status: "completed",
      tokenLabel: "estimated",
      output: "",
      finalState: "",
    };

    let carryover = "";
    let previous = "";
    let done = false;
    let allMeasured = true;

    try {
      while (!done && run.chunks.length < config.maxChunks) {
        if (options.abortSignal?.aborted) {
          run.status = "aborted";
          break;
        }
        const step = run.chunks.length + 1;
        const attachments = step === 1 ? (options.attachments ?? []) : [];
        const overlapText = config.overlapTokens > 0 && previous ? previous.slice(-config.overlapTokens * 4) : "";
        const prompt = buildPrompt({ mode, goal, step, carryover, overlapText, memoryContext: options.memoryContext, attachments });

        const { text, metadata } = await generator(prompt, attachments, options.systemPrompt, options.onStream, options.abortSignal);
        const parsed = parseMarkers(text);
        const usage = metadata?.usage;
        if (!usage) allMeasured = false;

        const chunk: ChunkInfo = {
          id: step,
          tokens: usage?.completionTokens ?? estimateTokens(parsed.cleaned),
          carryover,
          content: parsed.cleaned,
          promptTokens: usage?.promptTokens ?? estimateTokens(prompt + (options.systemPrompt ?? "")),
        };
        run.chunks.push(chunk); // persist first: its cost is already paid
        previous = parsed.cleaned;

        if (options.abortSignal?.aborted) {
          run.status = "aborted";
          break;
        }
        carryover = (
          await nextCarryover({
            markerState: parsed.state,
            previousCarryover: carryover,
            chunkText: text,
            budget: config.carryoverTokens,
            compressorFn: this.compressorFn,
          })
        ).carryover;
        options.onChunk?.(chunk, carryover);

        if (parsed.done) done = true;
        else if (options.stopWhen?.({ step, carryover })) done = true;
      }
      if (!done && run.status === "completed") run.status = "max-chunks";
    } catch (err) {
      run.status = "errored";
      run.error = (err as Error).message;
    }

    run.tokenLabel = allMeasured && run.chunks.length > 0 ? "measured" : "estimated";
    run.finalState = carryover;
    run.output = run.chunks.map((c) => c.content).join("\n\n");
    const eff = runEfficiency(run.chunks, run.chunkConfig);
    run.totalTokensUsed = eff.totalTokensUsed;
    run.totalTokensSaved = eff.tokensSaved;
    run.efficiencyPercent = eff.efficiencyPercent;

    if (options.reflect !== false && run.status === "completed" && run.chunks.length > 0) {
      try {
        const { text } = await generator(
          `Reflect on this completed run.\nGoal: ${goal.slice(0, 200)}\nFinal state: ${carryover}\nOutput (truncated): ${run.output.slice(-4000)}\n` +
            `Verdict: RATIFY if the goal is met, or REFINE with the concrete gaps.`,
          [],
          "You are the reflection pass. Be brief and concrete.",
          undefined,
          options.abortSignal,
        );
        run.reflection = cleanMarkers(text);
      } catch (err) {
        run.error = `reflection failed (run preserved): ${(err as Error).message}`;
      }
    }

    run.durationMs = this.clock() - start;
    this.record(run);
    return run;
  }

  history(): MarkovianRun[] {
    if (!this.historyFile || !fs.existsSync(this.historyFile)) return [];
    return JSON.parse(fs.readFileSync(this.historyFile, "utf-8")) as MarkovianRun[];
  }

  private record(run: MarkovianRun): void {
    if (!this.historyFile) return;
    const runs = this.history();
    runs.push(run);
    fs.writeFileSync(this.historyFile, JSON.stringify(runs, null, 2) + "\n", "utf-8");
  }
}
