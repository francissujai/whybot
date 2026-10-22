// Config validation and efficiency math (Markovian spec sections 2.1 and 6,
// docs/efficiency-model.md). Out-of-range values throw; nothing is clamped.

import { BOUNDS, ConfigValidationError, DEFAULT_CONFIG, FRAMING_TOKENS, OUTPUT_BUDGET } from "./types.ts";
import type { ChunkConfig, ChunkInfo } from "./types.ts";

export function resolveConfig(partial?: Partial<ChunkConfig>): ChunkConfig {
  const cfg: ChunkConfig = { ...DEFAULT_CONFIG, ...partial };
  for (const key of Object.keys(BOUNDS) as (keyof ChunkConfig)[]) {
    const v = cfg[key];
    const { min, max } = BOUNDS[key];
    if (!Number.isFinite(v)) throw new ConfigValidationError(`${key} must be a number`);
    if (v < min || v > max) throw new ConfigValidationError(`${key}=${v} outside [${min}, ${max}]`);
  }
  const floor = FRAMING_TOKENS + cfg.carryoverTokens + OUTPUT_BUDGET;
  if (cfg.chunkSize < floor) {
    throw new ConfigValidationError(`chunkSize=${cfg.chunkSize} < framing ${FRAMING_TOKENS} + carryover ${cfg.carryoverTokens} + output ${OUTPUT_BUDGET}`);
  }
  return cfg;
}

/**
 * Efficiency of a finished run, always against the run's own config snapshot.
 * Standard cost re-reads every previous chunk (prefix sum); Markovian cost is
 * one carryover per chunk plus the chunk itself.
 */
export function runEfficiency(chunks: ChunkInfo[], cfg: ChunkConfig) {
  const totalTokensUsed = chunks.reduce((s, c) => s + c.tokens, 0);
  let standardCost = 0;
  let prefix = 0;
  for (const c of chunks) {
    standardCost += prefix + c.tokens;
    prefix += c.tokens;
  }
  const markovianCost = chunks.length * cfg.carryoverTokens + totalTokensUsed;
  const tokensSaved = Math.max(0, standardCost - markovianCost);
  return {
    totalTokensUsed,
    standardCost,
    markovianCost,
    tokensSaved,
    efficiencyPercent: standardCost > 0 ? (tokensSaved / standardCost) * 100 : 0,
  };
}

/** Symbolic constants from docs/efficiency-model.md. */
export const DOC_DEFAULTS = { F: 400, G: 200, S: 300, O: 1200, C: 800 };

/** Input-token totals for N steps: naive re-sends all prior output, Markovian sends a fixed carryover. */
export function modelTotals(N: number, k = DOC_DEFAULTS) {
  const naiveTotal = N * (k.F + k.G + k.S) + (k.O * N * (N - 1)) / 2;
  const markovianTotal = N * (k.F + k.G + k.C + k.S);
  const savings = naiveTotal - markovianTotal;
  return { naiveTotal, markovianTotal, savings, efficiency: savings / naiveTotal };
}
