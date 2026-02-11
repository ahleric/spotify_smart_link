import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  ANALYTICS_EVENTS,
  applyScopeToQuery,
  isScopeReady,
  normalizeScope,
  resolveRange,
} from '@/lib/analytics';

export const runtime = 'edge';

type CampaignBucket = {
  key: string;
  utmSource: string;
  utmMedium: string;
  adSetId: string;
  adId: string;
  view: number;
  click: number;
  openSuccess: number;
  qualified: number;
  openFallback: number;
};

function toRate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function getAdSetId(attr: any) {
  return (attr?.adset_id || attr?.utm_term || '').trim() || 'unknown';
}

function getAdId(attr: any) {
  return (attr?.ad_id || attr?.utm_content || '').trim() || 'unknown';
}

function getCampaignKey(attr: any) {
  const adSetId = getAdSetId(attr);
  const adId = getAdId(attr);
  return `${adSetId}::${adId}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = normalizeScope(url.searchParams);
    const range = resolveRange(url.searchParams);
    const limit = Math.min(200, Math.max(10, Number(url.searchParams.get('limit') || 50)));

    if (!isScopeReady(scope)) {
      return NextResponse.json({
        ok: true,
        empty: true,
        reason: 'scope_not_selected',
        message: '请选择艺人或歌曲以查看数据。',
        rows: [],
      });
    }

    const supabase = getSupabaseClient('service');
    let query = supabase
      .from('landing_page_events')
      .select('event_name, attribution')
      .in('event_name', [
        ANALYTICS_EVENTS.view,
        ANALYTICS_EVENTS.click,
        ANALYTICS_EVENTS.openSuccess,
        ANALYTICS_EVENTS.qualified,
        ANALYTICS_EVENTS.openFallback,
      ])
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .order('created_at', { ascending: false });

    query = applyScopeToQuery(query, scope);

    const { data, error } = await query.range(0, 100000);
    if (error) throw new Error(error.message);

    const buckets = new Map<string, CampaignBucket>();

    for (const row of data || []) {
      const attr = (row as any).attribution || {};
      const key = getCampaignKey(attr);
      const current = buckets.get(key) || {
        key,
        utmSource: (attr.utm_source || 'unknown') as string,
        utmMedium: (attr.utm_medium || 'unknown') as string,
        adSetId: getAdSetId(attr),
        adId: getAdId(attr),
        view: 0,
        click: 0,
        openSuccess: 0,
        qualified: 0,
        openFallback: 0,
      };

      if (row.event_name === ANALYTICS_EVENTS.view) current.view += 1;
      if (row.event_name === ANALYTICS_EVENTS.click) current.click += 1;
      if (row.event_name === ANALYTICS_EVENTS.openSuccess) current.openSuccess += 1;
      if (row.event_name === ANALYTICS_EVENTS.qualified) current.qualified += 1;
      if (row.event_name === ANALYTICS_EVENTS.openFallback) current.openFallback += 1;

      buckets.set(key, current);
    }

    const rows = Array.from(buckets.values())
      .map((row) => ({
        ...row,
        clickRatePct: toRate(row.click, row.view),
        openSuccessRatePct: toRate(row.openSuccess, row.click),
        qualifiedRatePct: toRate(row.qualified, row.click),
      }))
      .sort((a, b) => {
        if (b.qualified !== a.qualified) return b.qualified - a.qualified;
        if (b.openSuccess !== a.openSuccess) return b.openSuccess - a.openSuccess;
        return b.click - a.click;
      })
      .slice(0, limit);

    return NextResponse.json({ ok: true, scope, range, rows });
  } catch (error: any) {
    console.error('读取 analytics campaigns 失败', error);
    return NextResponse.json(
      { ok: false, error: error?.message || '读取失败' },
      { status: 500 },
    );
  }
}
