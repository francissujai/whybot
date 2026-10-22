// Markovian engine types for WhyBot. Implements the Meterless Markovian spec
// (github.com/meterless/meterless, engines/markovian/AGENTS.md, Apache-2.0):
// a long task runs as bounded chunks, and each chunk sees only the goal plus a
// compressed carryover state, so context stays flat instead of growing.

export interface ChunkConfig {
  chunkSize: number; // generation budget per chunk (tokens)
  maxChunks: number; // recursion cap
  carryoverTokens: number; // carryover state budget
  overlapTokens: number; // tail of the previous chunk re-shown as [OVERLAP]
}

export const DEFAULT_CONFIG: ChunkConfig = { chunkSize: 8000, maxChunks: 24, carryoverTokens: 800, overlapTokens: 0 };

export const BOUNDS: Record<keyof ChunkConfig, { min: number; max: number }> = {
  chunkSize: { min: 1000, max: 128000 },
  maxChunks: { min: 1, max: 32 },
  carryoverTokens: { min: 128, max: 32768 },
  overlapTokens: { min: 0, max: 4096 },
};

export const FRAMING_TOKENS = 400;
export const OUTPUT_BUDGET = 1200;

/** Spec estimator: ceil(chars / 4). Numbers from it are labeled "estimated". */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
export type TokenLabel = "estimated" | "measured";

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

export interface Attachment {
  name: string;
  content: string;
}

/** Provider-agnostic generator. Return usage in metadata to get "measured" token numbers. */
export type Generator = (
  prompt: string,
  attachments: Attachment[],
  systemPrompt?: string,
  onStream?: (delta: string) => void,
  abortSignal?: AbortSignal,
) => Promise<{ text: string; metadata?: { usage?: Usage } & Record<string, unknown> }>;

export interface ChunkInfo {
  id: number; // 1-based
  tokens: number; // output tokens of this chunk
  carryover: string; // state passed INTO this chunk
  content: string; // marker-cleaned output
  promptTokens?: number; // input tokens of this chunk (measured when the provider reports usage)
}

export type RunStatus = "completed" | "max-chunks" | "errored" | "aborted";
export type Mode = "ARCHITECT" | "RESEARCH";

export interface MarkovianRun {
  id: string;
  timestamp: number;
  prompt: string;
  mode: Mode;
  chunkConfig: ChunkConfig; // mandatory per-run snapshot
  chunks: ChunkInfo[];
  totalTokensUsed: number;
  totalTokensSaved: number;
  efficiencyPercent: number;
  durationMs: number;
  status: RunStatus;
  tokenLabel: TokenLabel;
  output: string;
  finalState: string;
  reflection?: string;
  error?: string;
}

export interface RunOptions {
  prompt?: string;
  goal?: string;
  mode?: Mode;
  generator?: Generator;
  /** Constant per-chunk instructions (tools, schema). Same size every chunk, so context stays flat. */
  systemPrompt?: string;
  stopWhen?: (args: { step: number; carryover: string }) => boolean;
  memoryContext?: string; // chunk 1 only
  attachments?: Attachment[]; // chunk 1 only
  abortSignal?: AbortSignal;
  onStream?: (delta: string) => void;
  onChunk?: (chunk: ChunkInfo, nextCarryover: string) => void;
  reflect?: boolean; // default true
}

export interface MarkovianOptions {
  chunkConfig?: Partial<ChunkConfig>;
  generator?: Generator;
  compressorFn?: (prompt: string, systemPrompt: string) => Promise<string>;
  clock?: () => number;
  historyDir?: string;
}

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(`Markovian config: ${message}`);
    this.name = "ConfigValidationError";
  }
}
