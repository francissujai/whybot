import type { LandingContent } from "./Landing";
import { CHAPTERS, FilmScene } from "./film-scene";

export const content: LandingContent = {
  product: "WhyBot",
  tagline: "Metric investigation agent",
  headline: <>Find out <em>why</em> your number moved.</>,
  lede: "Ask about a metric. WhyBot tests competing explanations against your data and cites the query behind every number in its answer.",
  scene: "prism",
  accent: "#FFE14D",
  heroLabel: "Five shards around a bright core; four go dark one by one while one stays lit",
  facts: [
    { title: "Read-only SQL", body: "A guard refuses writes and multi-statement queries before they reach Zetaris." },
    { title: "Every number cited", body: "Figures in the finding link to the query and the rows that produced them." },
    { title: "Bounded, checkpointed steps", body: "Investigations run in chunks on Meterless, so each step can be followed and replayed." },
  ],
  capsTitle: "From a question to a cited answer.",
  capsLede: "Each investigation runs as short steps you can follow while it works.",
  capabilities: [
    { title: "Ask in plain words", body: "Type the question you would ask an analyst, in 8 to 300 characters." },
    { title: "List the explanations", body: "Each plausible cause becomes a hypothesis to test, not a guess to report." },
    { title: "Query the data", body: "Read-only SQL through Zetaris. Each query becomes an evidence exhibit, E1, E2 and on." },
    { title: "Rule causes in or out", body: "Confirmed, a measurement problem, or ruled out, with the evidence for each." },
    { title: "Write a cited finding", body: "Every number in the answer links to the query and rows behind it." },
  ],
  why: "When a number drops, everyone has a theory. WhyBot tests each one against the data, keeps the evidence, and tells you which story survived.",
  filmLabel: "One investigation, scrolled",
  chapters: CHAPTERS,
  film: (p) => <FilmScene p={p} />,
  closing: "Know why, before the meeting starts.",
  footer: "WhyBot. Built on Zetaris, Meterless and NVIDIA Nemotron for the Open Agent Hackathon 2026.",
};
