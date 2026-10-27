# Why did trial signups drop 18% last week?

## Answer
Trial signups dropped 18% (2160→1771, −389) because roughly half was a dashboard–backend measurement gap and half was a real decline in account creation [E1][E2][E3]. The real decline was driven mainly by paid search after budget and creative changes, with a smaller unexplained softness in organic and referral channels [E5][E9].

## What explains the change

| Cause | Real or measurement | Effect on the metric | Verdict | Evidence |
|---|---|---|---|---|
| Mobile dashboard–backend tracking gap (H2) | Measurement | ≈184 of the −389 dashboard drop (≈47%) | Supported | [E2],[E3] |
| Paid media pullback (H1) | Real | Paid signups −227 (−23.8%); campaign 101 daily_budget 1200→500 on 2026-10-13 and campaign 201 creative carousel_v3→video_v1 on 2026-10-14 | Supported (partial) | [E4],[E5],[E6] |
| Residual real demand softness (H5) | Real | Backend organic −37, referral −10, display −1 (≈ −48 accounts) | Supported (partial) | [E9] |
| Unexplained residual | Real | ≈ −48 backend accounts not tied to ads, pricing, or holidays | Unexplained | [E9] |

## Hypotheses ruled out
- H3 Pricing: zero pricing_history rows effective Oct 5–18, so no price change occurred [E7].
- H4 Holidays: only Canadian Thanksgiving on Mon 2026-10-12; one day cannot produce a week-long decline [E8].

## What to do next
- Marketing: reassess campaign 101 budget and campaign 201 creative; test whether video_v1 underperforms carousel_v3. (Owner: marketing)
- Growth: investigate the unexplained organic/referral/display decline for funnel or UX issues. (Owner: growth)
- Analytics: reconcile dashboard vs backend mobile signup counts and close the ≈184 measurement gap. (Owner: analytics)
- Engineering: audit mobile signup event logging around the Oct 13–14 changes. (Owner: engineering)

## Caveats
- Dashboard and backend count signups differently, so part of the dashboard drop may be tracking rather than lost demand.
- The data do not identify a driver for the ≈48 residual real decline in non-paid channels.
- Thanksgiving may have softened signups on Oct 12 but cannot explain the full week.
