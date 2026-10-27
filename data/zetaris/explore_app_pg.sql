-- Exploratory queries, run live through Zetaris on 2026-10-27 (npm run zetaris:usl -- data/zetaris/explore_app_pg.sql).
-- Full captured output: docs/zetaris-usl-output/explore_run.md

-- Q1. Does the dashboard metric (trial_signup analytics events) agree with the backend (accounts actually created), by device and week?
-- Result: desktop tracked 1,309 -> 1,171 vs created 1,334 -> 1,200 (gap 25 -> 29, normal).
--         mobile tracked 851 -> 600 but created 871 -> 800: the gap jumps from 20 to 200 last week.
SELECT t.device, t.week, t.tracked, a.created, a.created - t.tracked AS gap
FROM (SELECT device, CASE WHEN signup_date < DATE '2026-10-12' THEN 'prior' ELSE 'last' END AS week, sum(signups) AS tracked
      FROM app_pg.trial_signups_daily
      WHERE signup_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
      GROUP BY device, CASE WHEN signup_date < DATE '2026-10-12' THEN 'prior' ELSE 'last' END) t
JOIN (SELECT device, CASE WHEN to_date(created_at) < DATE '2026-10-12' THEN 'prior' ELSE 'last' END AS week, count(*) AS created
      FROM app_pg.accounts
      WHERE to_date(created_at) BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
      GROUP BY device, CASE WHEN to_date(created_at) < DATE '2026-10-12' THEN 'prior' ELSE 'last' END) a
  ON t.device = a.device AND t.week = a.week
ORDER BY t.device, t.week DESC;

-- Q2. Where in the signup funnel does mobile lose events? Form submits vs trial_signup events per week.
-- Result: mobile signup_form_submit 871 -> 800 (in line with accounts) but mobile trial_signup 851 -> 600.
--         Desktop events move together (submit 1,334 -> 1,200, trial_signup 1,309 -> 1,171).
SELECT device, event_name,
       sum(CASE WHEN event_date < DATE '2026-10-12' THEN event_count END) AS prior_week,
       sum(CASE WHEN event_date >= DATE '2026-10-12' THEN event_count END) AS last_week
FROM app_pg.tracking_events_daily
WHERE event_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
GROUP BY device, event_name
ORDER BY device, event_name;

-- Q3. What shipped in October, and did pricing change recently?
-- Result: 4.12.0 signup-web "new multi-step mobile stepper" shipped 13 Oct 15:40; 4.12.1 (16 Oct) was a
--         pricing-copy fix. Prices last changed 1 Jun 2026 (starter 29, pro 79), so pricing is not a cause.
SELECT 'release' AS kind, CAST(released_at AS STRING) AS at, concat(version, ' ', component, ': ', description) AS what
FROM app_pg.release_log WHERE to_date(released_at) >= DATE '2026-10-01'
UNION ALL
SELECT 'price', CAST(effective_date AS STRING), concat(plan, ' = $', CAST(monthly_price_usd AS STRING))
FROM app_pg.pricing_history
ORDER BY at;
