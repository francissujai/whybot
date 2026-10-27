-- Exploratory queries, run live through Zetaris on 2026-10-27 (npm run zetaris:usl -- data/zetaris/explore_holidays.sql).
-- Full captured output: docs/zetaris-usl-output/explore_run.md

-- Q1. Which Canadian public holidays fall in the investigation window (Sep-Nov 2026), and are they federal?
-- Result: Labour Day (Mon 7 Sep), National Day for Truth and Reconciliation and Orange Shirt Day (both Wed 30 Sep),
--         Thanksgiving (Mon 12 Oct, federal), Remembrance Day (Wed 11 Nov). Only Thanksgiving is in the two weeks.
SELECT holiday_date, date_format(holiday_date, 'E') AS dow, holiday_name, is_federal
FROM whybot.ca_holidays
WHERE holiday_date BETWEEN DATE '2026-09-01' AND DATE '2026-11-30'
ORDER BY holiday_date;

-- Q2. How many holiday rows does the live API return per month, and how many are federal?
-- Result: 31 holidays for 2026 across 12 months, 12 of them federal. Several dates carry more than one
--         holiday (31 rows, 21 distinct dates), which matters when holiday_date is used as a key in the USL.
SELECT month(holiday_date) AS month, count(*) AS holidays, sum(CASE WHEN is_federal = 1 THEN 1 ELSE 0 END) AS federal
FROM whybot.ca_holidays
GROUP BY month(holiday_date)
ORDER BY month;

-- Q3. Cross-source: daily backend accounts in the two weeks, flagged with any holiday that day (app_pg x holidays_rest).
-- Result: weekdays run 301-369 accounts; Thanksgiving Monday (12 Oct) has 278, then Tue-Fri recover to
--         301-328. The holiday explains a one-day dip, not the week-long drop.
SELECT to_date(a.created_at) AS day, date_format(to_date(a.created_at), 'E') AS dow, count(*) AS accounts, max(h.holiday_name) AS holiday
FROM app_pg.accounts a LEFT JOIN whybot.ca_holidays h ON to_date(a.created_at) = h.holiday_date
WHERE to_date(a.created_at) BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
GROUP BY to_date(a.created_at)
ORDER BY day;
