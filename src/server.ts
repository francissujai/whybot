// WhyBot web UI. Ask a question in the browser, watch the investigation
// stream in, open the evidence-linked report.
//
//   npm run serve            http://127.0.0.1:4173
//
// Binds to 127.0.0.1 by default. To share it, put an authenticated tunnel in
// front (for example Cloudflare Tunnel + Cloudflare Access); do not expose it
// directly, because anyone who can reach it can start investigations.
// One investigation runs at a time: model calls are the bottleneck.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { env } from "./env.ts";
import { listRuns, RUNS_DIR, runSession, type SessionEvent } from "./agent/session.ts";
import { PAGE } from "./ui/page.ts";

const HOST = env("WHYBOT_HOST", "127.0.0.1");
const PORT = Number(env("WHYBOT_PORT", "4173"));

interface Job {
  id: string;
  question: string;
  events: SessionEvent[];
  listeners: Set<http.ServerResponse>;
  finished: boolean;
}
const jobs = new Map<string, Job>();
let running: Job | undefined;
let jobSeq = 0;

function startJob(question: string): Job {
  const job: Job = { id: `job-${Date.now()}-${++jobSeq}`, question, events: [], listeners: new Set(), finished: false };
  jobs.set(job.id, job);
  running = job;
  const push = (e: SessionEvent) => {
    job.events.push(e);
    for (const res of job.listeners) res.write(`data: ${JSON.stringify(e)}\n\n`);
  };
  runSession(question, { onEvent: push })
    .catch((err) => push({ type: "error", message: (err as Error).message }))
    .finally(() => {
      job.finished = true;
      running = undefined;
      for (const res of job.listeners) res.end("event: end\ndata: {}\n\n");
      job.listeners.clear();
    });
  return job;
}

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

async function readBody(req: http.IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error("body too large");
  }
  return body;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(PAGE);
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, { running: running ? { id: running.id, question: running.question } : null, runs: listRuns().slice(0, 20) });
    }
    if (req.method === "POST" && url.pathname === "/api/investigate") {
      const { question } = JSON.parse((await readBody(req)) || "{}") as { question?: string };
      const q = (question ?? "").trim();
      if (q.length < 8 || q.length > 300) return json(res, 400, { error: "Ask a question between 8 and 300 characters." });
      if (running) return json(res, 409, { error: "An investigation is already running.", job: running.id });
      return json(res, 202, { job: startJob(q).id });
    }
    const ev = url.pathname.match(/^\/api\/jobs\/(job-[\w-]+)\/events$/);
    if (req.method === "GET" && ev) {
      const job = jobs.get(ev[1]);
      if (!job) return json(res, 404, { error: "unknown job" });
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      for (const e of job.events) res.write(`data: ${JSON.stringify(e)}\n\n`);
      if (job.finished) return res.end("event: end\ndata: {}\n\n");
      job.listeners.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => {
        clearInterval(ping);
        job.listeners.delete(res);
      });
      return;
    }
    const rep = url.pathname.match(/^\/runs\/([\dT-]{19})\/report\.html$/);
    if (req.method === "GET" && rep) {
      const file = path.join(RUNS_DIR, rep[1], "report.html");
      if (!fs.existsSync(file)) return json(res, 404, { error: "no report" });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(file).pipe(res);
    }
    json(res, 404, { error: "not found" });
  } catch (err) {
    json(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, HOST, () => console.log(`WhyBot UI on http://${HOST}:${PORT}`));
