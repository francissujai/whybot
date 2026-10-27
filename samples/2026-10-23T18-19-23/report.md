# Why did mobile trial signups fall last week?

## Answer  
The −251 mobile trial‑signup drop splits into a ≈184‑signup tracking gap caused by the Oct 13 2026 4.12.0 mobile‑stepper redesign and a genuine −71‑signup backend decline, of which ≈52 signups are paid (driven by the campaign 201 creative swap) and ≈19 signups are non‑paid (reflecting broader softness). The dashboard fell from 851→600 [E1]; backend from 871→800 [E1]; measurement gap ≈184 [E4].

## What explains the change  

| Cause | Real or measurement | Effect on the metric | Verdict | Evidence |
|---|---|---|---|---|
| Mobile‑stepper redesign (release 4.12.0, 2026‑10‑13 15:40) | Measurement | Inflated dashboard drop by ~184 signups (dashboard‑backend gap) | Supported | [E9][E4] |
| Paid‑search budget cut (campaign 101, daily_budget $1200→$500, 2026‑10‑13) | Real demand (paid) | Reduced paid_search signups by 90 (37.7 % of total dashboard drop) | Supported | [E3] |
| Paid‑social creative swap (campaign 201, carousel_v3→video_v1, 2026‑10‑14) | Real demand (paid) | Contributed to −52 paid‑backend drop and part of −37 % paid‑search signup fall | Supported | [E8][E10] |
| Non‑paid demand softness (organic, direct, referral, email) | Real demand (non‑paid) | Backend accounts fell 19 (−3.9 %); sessions fell 816 (−4.6 %) | Supported | [E5][E6] |
| Thanksgiving concentration | Ruling out | Decline spread Oct 12–18, not concentrated on 2026‑10‑12 | Ruled out | [E7] |
| Pricing changes | Ruling out | No price changes effective Oct 5–18 | Ruled out | [E11] |

## Hypotheses ruled out  
- **H3 pricing:** `app_pg.pricing_history` returned 0 rows for effective dates Oct 5–18 [E11]; no price change could explain the softness.  
- **H4 Thanksgiving concentration:** Daily signups show a steady decline across Oct 12–18, not a spike on 2026‑10‑12 [E7].

## What to do next  
1. **Monitor backend trial signups daily** to track the real‑demand trend; owner: analytics.  
2. **Run a rollout impact test** on the new multi‑step mobile stepper (release 4.12.0) to quantify any remaining tracking bias; owner: growth/engineering.  
3. **Optimize paid‑social creative performance** post‑swap (campaign 201 video_v1) and assess ROI; owner: marketing.  
4. **Review paid‑search budget allocation** after the Q4 rebalance (campaign 101) to align spend with signup goals; owner: marketing/finance.

## Caveats  
- Dashboard signups and backend accounts use different definitions (signup vs. account creation), so the gap is an approximation.  
- The measurement gap assumes the stepper redesign altered tracking; other undetected changes could contribute modestly.  
- Non‑paid softness is inferred from session counts; actual conversion may vary by user segment.  
- No user‑level data beyond channel groups is available, limiting granular attribution.
