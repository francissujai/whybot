-- Exploratory queries, run live through Zetaris on 2026-10-27 (npm run zetaris:usl -- data/zetaris/explore_ads_pg.sql).
-- Full captured output: docs/zetaris-usl-output/explore_run.md

-- Q1. Did paid spend and clicks change between the prior week (5-11 Oct) and last week (12-18 Oct), by channel?
-- Result: paid_search spend fell 14,152.43 -> 9,910.83 USD (-30%) and clicks 7,926 -> 4,683 (-41%).
--         display (1,690 -> 1,651) and paid_social (5,714 -> 5,649) were flat.
SELECT c.channel,
       round(sum(CASE WHEN s.spend_date < DATE '2026-10-12' THEN s.spend_usd END), 2) AS spend_prior,
       round(sum(CASE WHEN s.spend_date >= DATE '2026-10-12' THEN s.spend_usd END), 2) AS spend_last,
       sum(CASE WHEN s.spend_date < DATE '2026-10-12' THEN s.clicks END) AS clicks_prior,
       sum(CASE WHEN s.spend_date >= DATE '2026-10-12' THEN s.clicks END) AS clicks_last
FROM ads_pg.ad_spend_daily s JOIN ads_pg.campaigns c ON s.campaign_id = c.campaign_id
WHERE s.spend_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
GROUP BY c.channel
ORDER BY c.channel;

-- Q2. What changed in the ad accounts during those two weeks?
-- Result: two changes. 13 Oct 09:12 Brand Search - North America daily_budget 1200 -> 500 (ops-bot,
--         Q4 budget rebalance); 14 Oct 11:45 Social - Retargeting creative carousel_v3 -> video_v1.
SELECT l.changed_at, c.campaign_name, l.change_type, l.old_value, l.new_value, l.changed_by
FROM ads_pg.ad_change_log l JOIN ads_pg.campaigns c ON l.campaign_id = c.campaign_id
WHERE to_date(l.changed_at) BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
ORDER BY l.changed_at;

-- Q3. Day by day, what did Brand Search (campaign 101) spend and earn in clicks around the change?
-- Result: about 1,080-1,190 USD and 776-968 clicks a day until Mon 12 Oct; from Tue 13 Oct 465-491 USD
--         and 331-368 clicks. CPC stays 1.23-1.44, so the clicks fell with the budget, not with price.
SELECT spend_date, date_format(spend_date, 'E') AS dow, spend_usd, clicks, round(spend_usd / clicks, 2) AS cpc
FROM ads_pg.ad_spend_daily
WHERE campaign_id = 101 AND spend_date BETWEEN DATE '2026-10-08' AND DATE '2026-10-16'
ORDER BY spend_date;
