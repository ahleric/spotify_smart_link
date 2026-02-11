-- Audience and campaign analytics views for Spotify smart links

begin;

create or replace view public.landing_page_campaign_metrics_30d as
select
  coalesce(nullif(attribution->>'utm_source', ''), 'unknown') as utm_source,
  coalesce(nullif(attribution->>'utm_medium', ''), 'unknown') as utm_medium,
  coalesce(nullif(attribution->>'utm_campaign', ''), 'unknown') as utm_campaign,
  coalesce(nullif(attribution->>'utm_content', ''), 'unknown') as utm_content,
  coalesce(nullif(attribution->>'utm_term', ''), 'unknown') as utm_term,
  count(*) filter (where event_name = 'SmartLinkView') as view_count,
  count(*) filter (where event_name = 'SmartLinkClick') as click_count,
  count(*) filter (where event_name = 'SmartLinkOpenSuccess') as open_success_count,
  count(*) filter (where event_name = 'SmartLinkQualified') as qualified_count,
  round(
    100 *
      count(*) filter (where event_name = 'SmartLinkClick')::numeric /
      nullif(count(*) filter (where event_name = 'SmartLinkView'), 0),
    2
  ) as click_rate_pct,
  round(
    100 *
      count(*) filter (where event_name = 'SmartLinkQualified')::numeric /
      nullif(count(*) filter (where event_name = 'SmartLinkClick'), 0),
    2
  ) as qualified_rate_pct
from public.landing_page_events
where created_at >= now() - interval '30 days'
group by 1, 2, 3, 4, 5;

create or replace view public.landing_page_high_intent_audience_30d as
with grouped as (
  select
    coalesce(
      nullif(payload->'identity'->>'anonymousId', ''),
      nullif(fbp, ''),
      nullif(fbc, ''),
      nullif(event_id, '')
    ) as audience_key,
    max(created_at) as last_seen_at,
    max(created_at) filter (where event_name = 'SmartLinkQualified') as last_qualified_at,
    max(nullif(attribution->>'utm_source', '')) as utm_source,
    max(nullif(attribution->>'utm_medium', '')) as utm_medium,
    max(nullif(attribution->>'utm_campaign', '')) as utm_campaign,
    max(nullif(attribution->>'utm_content', '')) as utm_content,
    max(nullif(attribution->>'utm_term', '')) as utm_term,
    count(*) filter (where event_name = 'SmartLinkView') as view_count,
    count(*) filter (where event_name = 'SmartLinkClick') as click_count,
    count(*) filter (where event_name = 'SmartLinkOpenSuccess') as open_success_count,
    count(*) filter (where event_name = 'SmartLinkQualified') as qualified_count
  from public.landing_page_events
  where created_at >= now() - interval '30 days'
  group by 1
)
select
  audience_key,
  last_seen_at,
  last_qualified_at,
  coalesce(utm_source, 'unknown') as utm_source,
  coalesce(utm_medium, 'unknown') as utm_medium,
  coalesce(utm_campaign, 'unknown') as utm_campaign,
  coalesce(utm_content, 'unknown') as utm_content,
  coalesce(utm_term, 'unknown') as utm_term,
  view_count,
  click_count,
  open_success_count,
  qualified_count,
  case
    when qualified_count > 0 then 'qualified'
    when open_success_count > 0 and click_count > 0 then 'warm'
    when click_count > 0 then 'clicker'
    else 'viewer'
  end as audience_tier
from grouped
where audience_key is not null
  and (
    qualified_count > 0
    or (view_count > 0 and click_count > 0 and open_success_count > 0)
  );

comment on view public.landing_page_campaign_metrics_30d is
  '30-day UTM campaign performance view for SmartLinkView/Click/OpenSuccess/Qualified.';

comment on view public.landing_page_high_intent_audience_30d is
  '30-day high-intent audience candidates keyed by anonymousId/fbp/fbc/event_id.';

commit;
