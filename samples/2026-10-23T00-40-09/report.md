# Why did trial signups drop 18% last week?

## Answer  
The 18 % drop in trial signups last week is driven chiefly by a mobile‑tracking artifact that inflated the dashboard decline by ~184 signups (≈47 % of the total fall) together with a ~20 % reduction in paid ad spend that cost 158 paid‑search signups; non‑paid channels showed only modest softness (organic −37, referral −10), leaving the remainder as measurement noise [E1,E6].

## What explains the change  
| Cause | Real or measurement | Effect on the metric | Verdict | Evidence |
|---|---|---|---|---|
| Mobile tracking / event‑capture artifact (organic −59, paid_search −47, direct −31, paid_social −24, email −18) | Measurement | −184 signups (≈47 % of the 389‑signup dashboard drop) | Supported [E1] | [E1] |
| Paid‑search budget cut (daily budget 1200→500 on 2026‑10‑13) and creative change (campaign 201) | Real (ad‑delivery reduction) | −158 paid‑search signups (desktop −105, mobile −53) [E6] | Supported [E2,E3] | [E2,E3] |
| Non‑paid real‑demand softness (organic −37, referral −10, direct +9, email +1) | Real | −37 signups total [E6] | Supported [E6] | [E6] |
| Paid social & display decline (−9 and −1) | Real | −10 signups [E6] | Supported [E6] | [E6] |
| Dashboard–backend gap (measurement) | Measurement | ≈184 signups difference between dashboard and backend [E1] | Confirmed [E1] | [E1] |
| Unexplained residual | — | 0 signups (all accounted for) | None | — |

## Hypotheses ruled out  
- **H3 (pricing changes):** No price changes observed in the 10‑day window 2026‑10‑05 → 2026‑10‑18 [E4].  
- **H4 (holidays / seasonality):** Thanksgiving (2026‑10‑12) appears only in the last week; its impact is too small to attribute [E5].

## What to do next  
1. **Fix mobile event‑capture tracking** to eliminate the ~184‑signup measurement gap; owner: analytics / engineering [E1].  
2. **Re‑optimize paid‑search budget** after the 1200→500 cut and creative swap; owner: marketing [E2,E3].  
3. **Monitor non‑paid channel trends weekly** (organic, referral, direct, email) to catch any further softness early; owner: growth [E6].  
4. **Implement automated dashboard‑backend reconciliation** (weekly diff report) to keep the measurement gap visible; owner: analytics [E1].

## Caveats  
- The data count only signups; quality, retention, or lifetime value are not reflected.  
- The measurement gap may include attribution‑window differences, cross‑device tracking limits, and delayed backend ingestion.  
- External factors (competitor campaigns, macro‑economic shifts) are not captured in the available logs.  
- The analysis covers a single two‑week interval; longer trends are needed to confirm whether the drop is a sustained shift or a transient artifact.
