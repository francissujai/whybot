import type { LandingContent } from "./Landing";
import { StoryPanes } from "./Scrollytelling";

const lane = (c: string) => ({ "--c": c }) as React.CSSProperties;
const HYPOTHESES = ["Ad budget change", "Release 4.12.0 tracking", "Holiday", "Pricing change", "Seasonal dip"];
const EVIDENCE: [string, string, string][] = [["E1", "Trial signups this week vs last week", "14"], ["E2", "Mobile signup events around release 4.12.0", "28"], ["E3", "Brand Search daily budget and clicks", "14"]];

/** The pinned view: one investigation in the state of the current step. */
function CaseView({ step }: { step: number }) {
  return (
    <>
      <div className="pv-window-bar"><span>Why did trial signups drop 18%?</span><span>Step {step + 1} of 4</span></div>
      <StoryPanes step={step}>
        {[
          <>{HYPOTHESES.map((h) => <div className="pv-card" key={h}>{h}<span className="pv-sub">Open, not yet tested</span></div>)}</>,
          <>{EVIDENCE.map(([id, what, rows]) => <div className="pv-row" key={id}><span><mark className="pv-mark">{id}</mark></span><span>{what}</span><span className="pv-n">{rows} rows</span></div>)}
            <pre className="pv-code">{"SELECT week, COUNT(*) FROM signups\nGROUP BY week ORDER BY week;"}</pre></>,
          <div className="pv-lanes">
            <div className="pv-lane" style={lane("var(--ds-success)")}><b>Confirmed</b><div className="pv-card">Ad budget change <mark>E3</mark></div></div>
            <div className="pv-lane" style={lane("var(--ds-warn)")}><b>Measurement</b><div className="pv-card">Release 4.12.0 tracking <mark>E2</mark></div></div>
            <div className="pv-lane" style={lane("var(--ds-line-strong)")}><b>Ruled out</b><div className="pv-card">Holiday <mark>E4</mark></div><div className="pv-card">Pricing change <mark>E5</mark></div></div>
          </div>,
          <>
            <div className="pv-head"><span className="pv-title">Finding</span><span className="pv-dot" style={lane("var(--ds-success)")}>Finished</span></div>
            <p>Trial signups fell 18.0%, from 2,160 to 1,771 <mark className="pv-mark">E1</mark>. The mobile signup event also drops after release 4.12.0, but that is a measurement gap <mark className="pv-mark">E2</mark>. The real cause is the Brand Search budget cut from 1,200 to 500 on 13 Oct <mark className="pv-mark">E3</mark>.</p>
          </>,
        ]}
      </StoryPanes>
    </>
  );
}

export const content: LandingContent = {
  product: "WhyBot",
  tagline: "Metric investigation agent",
  headline: <>Find out <em>why</em> your number moved.</>,
  lede: "Ask about a metric. WhyBot tests competing explanations against your data and cites the query behind every number in its answer.",
  scene: "prism",
  accent: "#FFE14D",
  heroLabel: "Five shards around a bright core; four go dark one by one while one stays lit",
  heroCaption: "Five shards are five explanations for one number. As evidence arrives, four are ruled out and go dark; the one the data supports stays lit.",
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
  storyTitle: "One investigation, step by step.",
  story: [
    { title: "List the explanations", body: "Five plausible causes become five hypotheses, none of them trusted yet." },
    { title: "Query the data", body: "Each read-only query becomes a numbered exhibit the finding can cite." },
    { title: "Rule them in or out", body: "As the queries return, each hypothesis moves to Confirmed, Measurement or Ruled out." },
    { title: "Write the finding", body: "The answer cites every number by exhibit, so each claim can be checked." },
  ],
  storyView: (step) => <CaseView step={step} />,
  closing: "Know why, before the meeting starts.",
  footer: "WhyBot. Built on Zetaris, Meterless and NVIDIA Nemotron for the Open Agent Hackathon 2026.",
};
