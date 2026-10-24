// Meterless Runtime provider (Nightshift). WhyBot's primary and only model
// provider: an OpenAI-compatible endpoint on this machine that routes to the
// NVIDIA Nemotron lanes configured in Nightshift. Follows the Meterless
// "Add Meterless as a provider" contract (docs/agent-ready/add-meterless-provider.md):
//   - Authorization: Bearer <runtime token>; the placeholder rt-local is rejected
//   - meterless-app on every call, meterless-scope: user on chat requests
//   - base URL auto-detect on 8088, 8090, 8787, 11434
//   - 180 s timeout; 429 retries after 2 s, 4 s, 8 s
//   - status from GET /v1/models: 401/403 means unauthorized

import { env } from "../env.ts";
import type { Usage } from "../engines/markovian/types.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** From Nightshift's compute receipt: which lane actually answered. */
export interface RouteReceipt {
  receiptId?: string;
  routedModel: string;
  label?: string;
  provider?: string;
  kind?: string; // cloud | local
  ms?: number;
}

export interface ChatResult {
  text: string;
  usage?: Usage;
  model: string;
  route?: RouteReceipt;
}

export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  chat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number; model?: string; signal?: AbortSignal }): Promise<ChatResult>;
}

const AUTO_PORTS = [8088, 8090, 8787, 11434];
// The contract's 180 s suits cloud lanes; a local GPU lane writing 4-5k
// tokens at ~26 tok/s needs longer. WHYBOT_CALL_TIMEOUT_S overrides it.
const TIMEOUT_MS = (Number(process.env.WHYBOT_CALL_TIMEOUT_S) || 180) * 1000;
const RETRY_WAITS = [2000, 4000, 8000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MeterlessProvider implements ChatProvider {
  readonly name: string;
  readonly model: string;
  private token: string;
  private app: string;
  private meterless: boolean;
  private reasoningEffort: string;
  baseUrl: string;

  constructor(opts: { baseUrl?: string; token?: string; model?: string; app?: string; provider?: string } = {}) {
    const provider = (opts.provider ?? env("MODEL_PROVIDER", "meterless")).toLowerCase();
    this.meterless = provider === "meterless";
    this.name = this.meterless ? "Meterless Runtime (Nightshift)" : provider;
    this.baseUrl = (opts.baseUrl ?? env("MODEL_BASE_URL", "")).replace(/\/+$/, "");
    this.token = opts.token ?? env("MODEL_API_KEY");
    this.model = opts.model ?? env("NEMOTRON_MODEL", "meterless/auto");
    this.app = opts.app ?? env("METERLESS_APP", "whybot");
    this.reasoningEffort = env("WHYBOT_REASONING_EFFORT", "low"); // set to "none" to omit
    if (this.reasoningEffort === "none") this.reasoningEffort = "";
    if (this.meterless && (this.token === "rt-local" || this.token.startsWith("your-"))) {
      throw new Error("MODEL_API_KEY is a placeholder. Copy the Runtime token from Nightshift > Console into .env.");
    }
  }

  private headers(chat: boolean): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
    if (this.meterless) {
      h["meterless-app"] = this.app;
      if (chat) h["meterless-scope"] = "user";
    }
    return h;
  }

  /** Finds a live runtime when MODEL_BASE_URL is not set. */
  async resolveBaseUrl(): Promise<string> {
    if (this.baseUrl) return this.baseUrl;
    for (const port of AUTO_PORTS) {
      const url = `http://127.0.0.1:${port}/v1`;
      try {
        const res = await fetch(`${url}/models`, { headers: this.headers(false), signal: AbortSignal.timeout(2000) });
        if (res.status < 500) return (this.baseUrl = url);
      } catch {
        // try the next port
      }
    }
    throw new Error(`No Meterless Runtime found on ports ${AUTO_PORTS.join(", ")}. Start Nightshift or set MODEL_BASE_URL.`);
  }

  async listModels(): Promise<string[]> {
    const base = await this.resolveBaseUrl();
    const res = await fetch(`${base}/models`, { headers: this.headers(false), signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 403) throw new Error(`unauthorized (HTTP ${res.status}): check MODEL_API_KEY`);
    if (!res.ok) throw new Error(`GET /models HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { id: string }[] };
    return (body.data ?? []).map((m) => m.id);
  }

  async chat(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number; model?: string; signal?: AbortSignal } = {}): Promise<ChatResult> {
    const base = await this.resolveBaseUrl();
    const body = JSON.stringify({
      model: opts.model ?? this.model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1500,
      // Nemotron 3.5 reasons before answering; at the default effort a long
      // prompt overruns Nightshift's ~45 s provider deadline (502 provider_deadline).
      ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
    });
    let providerRetries = 0;
    for (let attempt = 0; ; attempt++) {
      const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
      const res = await fetch(`${base}/chat/completions`, { method: "POST", headers: this.headers(true), body, signal });
      if (res.status === 429 && attempt < RETRY_WAITS.length) {
        await sleep(RETRY_WAITS[attempt]);
        continue;
      }
      if (!res.ok) {
        const detail = await res.text();
        // Transient upstream failures (deadline, empty response from a raced lane): retry three times.
        if (res.status === 502 && /provider_error/.test(detail) && providerRetries < 3) {
          await sleep(RETRY_WAITS[providerRetries++]);
          continue;
        }
        throw new Error(`chat HTTP ${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        model?: string;
        choices?: { message?: { content?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        meterless?: {
          receipt_id?: string;
          routed_model?: string;
          winning_route?: { model?: string; label?: string; provider?: string; kind?: string };
          phases?: { ms?: number }[];
        };
      };
      const text = stripThinking(data.choices?.[0]?.message?.content ?? "");
      if (!text && providerRetries < 3) {
        await sleep(RETRY_WAITS[providerRetries++]);
        continue;
      }
      const usage =
        data.usage?.prompt_tokens != null && data.usage?.completion_tokens != null
          ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
          : undefined;
      const m = data.meterless;
      const route = m
        ? {
            receiptId: m.receipt_id,
            routedModel: m.winning_route?.model ?? m.routed_model ?? data.model ?? "",
            label: m.winning_route?.label,
            provider: m.winning_route?.provider,
            kind: m.winning_route?.kind,
            ms: m.phases?.reduce((s, p) => s + (p.ms ?? 0), 0),
          }
        : undefined;
      return { text, usage, model: data.model ?? opts.model ?? this.model, route };
    }
  }
}

/** Wraps a provider and keeps every call's receipt: which model actually served it, and its tokens. */
export class ReceiptLog implements ChatProvider {
  readonly calls: { purpose: string; route?: RouteReceipt; usage?: Usage; ms: number; error?: string }[] = [];
  onCall?: (c: ReceiptLog["calls"][number]) => void;
  constructor(private inner: ChatProvider, private purpose = "investigate") {}
  get name() {
    return this.inner.name;
  }
  get model() {
    return this.inner.model;
  }
  as(purpose: string): ChatProvider {
    return { name: this.name, model: this.model, chat: (m, o) => this.record(purpose, m, o) };
  }
  chat(messages: ChatMessage[], opts?: Parameters<ChatProvider["chat"]>[1]) {
    return this.record(this.purpose, messages, opts);
  }
  private async record(purpose: string, messages: ChatMessage[], opts?: Parameters<ChatProvider["chat"]>[1]) {
    const t0 = Date.now();
    try {
      const r = await this.inner.chat(messages, opts);
      const call = { purpose, route: r.route, usage: r.usage, ms: Date.now() - t0 };
      this.calls.push(call);
      this.onCall?.(call);
      return r;
    } catch (err) {
      const call = { purpose, ms: Date.now() - t0, error: (err as Error).message.slice(0, 200) };
      this.calls.push(call);
      this.onCall?.(call);
      throw err;
    }
  }
  /** Calls grouped by the model that served them. */
  summary(): { model: string; label: string; provider: string; kind: string; calls: number; tokensIn: number; tokensOut: number }[] {
    const by = new Map<string, { model: string; label: string; provider: string; kind: string; calls: number; tokensIn: number; tokensOut: number }>();
    for (const c of this.calls) {
      const model = c.route?.routedModel || this.model;
      const row = by.get(model) ?? { model, label: c.route?.label ?? model, provider: c.route?.provider ?? "?", kind: c.route?.kind ?? "?", calls: 0, tokensIn: 0, tokensOut: 0 };
      row.calls++;
      row.tokensIn += c.usage?.promptTokens ?? 0;
      row.tokensOut += c.usage?.completionTokens ?? 0;
      by.set(model, row);
    }
    return [...by.values()].sort((a, b) => b.calls - a.calls);
  }
}

/** Nemotron reasoning models may wrap their chain of thought in <think> tags. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim();
}

/** The four provider checks from the Meterless provider contract. */
export async function checkProvider(p: MeterlessProvider): Promise<{ name: string; ok: boolean; detail: string }[]> {
  const out: { name: string; ok: boolean; detail: string }[] = [];
  const step = async (name: string, fn: () => Promise<string>) => {
    try {
      out.push({ name, ok: true, detail: await fn() });
      return true;
    } catch (err) {
      out.push({ name, ok: false, detail: (err as Error).message });
      return false;
    }
  };
  let models: string[] = [];
  (await step("connection", async () => `runtime at ${await p.resolveBaseUrl()}`)) &&
    (await step("authorization + model discovery", async () => {
      models = await p.listModels();
      const nemotron = models.filter((m) => /nemotron/i.test(m));
      return `${models.length} models; nemotron: ${nemotron.slice(0, 4).join(", ") || "none listed"}`;
    })) &&
    (await step("text request", async () => {
      const r = await p.chat([{ role: "user", content: "Reply with the single word: ready" }], { maxTokens: 400 });
      return `model=${r.model} replied ${JSON.stringify(r.text.slice(0, 40))}${r.usage ? ` (${r.usage.promptTokens}+${r.usage.completionTokens} tokens measured)` : ""}`;
    }));
  return out;
}
