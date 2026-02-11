# Supabase Safe Rollout (No-Downtime)

## Goal
Apply analytics upgrades without breaking existing landing pages or active ad traffic.

## What this rollout changes
1. Creates a new table: `public.landing_page_events`
2. Adds nullable extension columns on existing tables:
   - `public.songs.tracking_config`
   - `public.songs.routing_config`
   - `public.songs.attribution_window_days`
   - `public.artists.tracking_config`
   - `public.artists.routing_config`
   - `public.artists.attribution_window_days`
3. Keeps all existing read/write columns unchanged (`songs.slug`, `spotify_*`, pixel/token fields).

## Apply order
1. Run migration: `supabase/migrations/20260211_safe_analytics_upgrade.sql`
2. Run migration: `supabase/migrations/20260211_audience_views.sql`
3. Deploy app code (includes dual-write in `/api/track-event` and smart routing events)
4. Verify with SQL checks below

## Verification checks
```sql
-- table exists
select to_regclass('public.landing_page_events');

-- nullable columns exist
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('songs', 'artists')
  and column_name in ('tracking_config', 'routing_config', 'attribution_window_days')
order by table_name, column_name;

-- events are arriving
select event_name, count(*)
from public.landing_page_events
where created_at > now() - interval '30 minutes'
group by event_name
order by count(*) desc;

-- campaign metrics view works
select *
from public.landing_page_campaign_metrics_30d
order by qualified_count desc nulls last
limit 20;

-- high intent audience candidates are generated
select *
from public.landing_page_high_intent_audience_30d
order by last_seen_at desc
limit 20;
```

## Rollback
1. `supabase/migrations/20260211_audience_views.rollback.sql`
2. `supabase/migrations/20260211_safe_analytics_upgrade.rollback.sql`
