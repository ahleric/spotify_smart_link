-- Rollback for 20260211_safe_analytics_upgrade.sql
-- Use only if rollout has to be reverted immediately.

begin;

alter table public.songs
  drop constraint if exists songs_attribution_window_days_check;

alter table public.artists
  drop constraint if exists artists_attribution_window_days_check;

alter table public.songs
  drop column if exists tracking_config,
  drop column if exists routing_config,
  drop column if exists attribution_window_days;

alter table public.artists
  drop column if exists tracking_config,
  drop column if exists routing_config,
  drop column if exists attribution_window_days;

drop table if exists public.landing_page_events;

commit;
