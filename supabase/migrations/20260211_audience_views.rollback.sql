-- Rollback for 20260211_audience_views.sql

begin;

drop view if exists public.landing_page_high_intent_audience_30d;
drop view if exists public.landing_page_campaign_metrics_30d;

commit;
