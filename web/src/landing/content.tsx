import type { LandingContent } from "./Landing";

const lane = (c: string) => ({ "--c": c }) as React.CSSProperties;

export const content: LandingContent = {
  product: "WhyBot",
  eyebrow: "Metric investigation agent",
  cycle: ["Test", "Check", "Explain"],
  rest: " why a number moved.",
  statement: "Ask about a metric. WhyBot tests competing explanations against your data and shows the query behind every number.",
  facts: [
    { title: "Read-only SQL", body: "A guard refuses writes and multi-statement queries before they reach Zetaris." },
    { title: "Every number cited", body: "Figures in the finding link to the query and the rows that produced them." },
    { title: "Bounded, checkpointed steps", body: "Investigations run in chunks on Meterless, so each step can be followed and replayed." },
  ],
  capsEyebrow: "What it does",
  capsTitle: "From a question to a cited answer.",
  capsLede: "Each investigation runs as short steps you can follow while it works.",
  capabilities: [
    { title: "Ask in plain words", body: "Type the question you would ask an analyst, in 8 to 300 characters." },
    { title: "List the explanations", body: "Each plausible cause becomes a hypothesis to test, not a guess to report." },
    { title: "Query the data", body: "Read-only SQL through Zetaris. Each query becomes an evidence exhibit, E1, E2 and on." },
    { title: "Rule causes in or out", body: "Confirmed, a measurement problem, or ruled out, with the evidence for each." },
    { title: "Write a cited finding", body: "Every number in the answer links to the query and rows behind it." },
  ],
  interludeEyebrow: "Why it exists",
  interlude: "When a number drops, everyone has a theory. WhyBot tests each one against the data, keeps the evidence, and tells you which story survived.",
  pillarsEyebrow: "The product",
  pillarsTitle: "Hypotheses, evidence, a finding.",
  pillars: [
    {
      title: "Hypothesis board", body: "Each explanation moves to Confirmed, Measurement or Ruled out as the queries return.",
      preview: (
        <>
          <div className="pv-head"><span className="pv-title">Why did trial signups drop 18%?</span><span className="pv-dot" style={lane("var(--ds-success)")}>Finished</span></div>
          <div className="pv-lanes">
            <div className="pv-lane" style={lane("var(--ds-success)")}><b>Confirmed</b><div className="pv-card">Ad budget change <mark>E3</mark></div></div>
            <div className="pv-lane" style={lane("var(--ds-warn)")}><b>Measurement</b><div className="pv-card">Release 4.12.0 tracking <mark>E2</mark></div></div>
            <div className="pv-lane" style={lane("var(--ds-line-strong)")}><b>Ruled out</b><div className="pv-card">Holiday <mark>E4</mark></div><div className="pv-card">Pricing change <mark>E5</mark></div></div>
          </div>
        </>
      ),
    },
    {
      title: "Evidence ledger", body: "Every query, its purpose and its row count, numbered so the finding can cite it.",
      preview: (
        <>
          <div className="pv-head"><span className="pv-title">Evidence</span><span className="pv-dot" style={lane("var(--ds-accent-text)")}>5 queries</span></div>
          {[["E1", "Trial signups this week vs last week", "14"], ["E2", "Mobile signup events around release 4.12.0", "28"], ["E3", "Brand Search daily budget and clicks", "14"]].map(([id, what, rows]) => (
            <div className="pv-row" key={id}><span><mark style={{ background: "var(--ds-accent)", color: "var(--ds-on-accent)", padding: "0 4px", borderRadius: 3 }}>{id}</mark></span><span>{what}</span><span className="pv-n">{rows} rows</span></div>
          ))}
        </>
      ),
    },
    {
      title: "Replay any case", body: "Scrub through a past investigation and watch the board fill in, at 1x, 4x or 10x.",
      preview: (
        <>
          <div className="pv-head"><span className="pv-title">Replay</span><span className="pv-dot" style={lane("var(--ds-accent-text)")}>0:46 of 1:37</span></div>
          <div className="pv-rail" style={{ marginBottom: 20 }}><i style={{ width: "47%" }} /></div>
          <pre className="pv-code">{"step 1  E1  2,160 to 1,771 (-18.0%)\nstep 2  E2  mobile event drops after 4.12.0\nstep 3  E3  budget cut 1,200 to 500 on 13 Oct"}</pre>
        </>
      ),
    },
  ],
  closing: "Know why, before the meeting starts.",
  scene: "prism",
  footer: "WhyBot. Built on Zetaris, Meterless and NVIDIA Nemotron for the Open Agent Hackathon 2026.",
};
