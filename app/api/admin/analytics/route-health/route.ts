import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  ANALYTICS_EVENTS,
  applyScopeToQuery,
  fetchAllPagedRows,
  isScopeReady,
  normalizeScope,
  parseContext,
  parseRoute,
  resolveRange,
} from '@/lib/analytics';

export const runtime = 'edge';

type RouteBucket = {
  key: string;
  os: string;
  inAppBrowser: string;
  strategy: string;
  reason: string;
  click: number;
  openAttempt: number;
  openSuccess: number;
  openFallback: number;
};

function toRate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = normalizeScope(url.searchParams);
    const range = resolveRange(url.searchParams);

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
    const loadPage = async (from: number, to: number) => {
      let query = supabase
        .from('landing_page_events')
        .select('event_name, payload')
        .in('event_name', [
          ANALYTICS_EVENTS.click,
          ANALYTICS_EVENTS.openAttempt,
          ANALYTICS_EVENTS.openSuccess,
          ANALYTICS_EVENTS.openFallback,
        ])
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso)
        .order('created_at', { ascending: false });

      query = applyScopeToQuery(query, scope);
      const { data, error } = await query.range(from, to);
      return { data, error };
    };

    const data = await fetchAllPagedRows({
      fetchPage: loadPage,
      pageSize: 1000,
      maxRows: 250000,
    });

    const buckets = new Map<string, RouteBucket>();

    for (const row of data) {
      const payload = (row as any).payload || {};
      const context = parseContext(payload);
      const route = parseRoute(payload);
      const key = `${context.os}::${context.inAppBrowser}::${route.strategy}::${route.reason}`;
      const current = buckets.get(key) || {
        key,
        os: context.os,
        inAppBrowser: context.inAppBrowser,
        strategy: route.strategy,
        reason: route.reason,
        click: 0,
        openAttempt: 0,
        openSuccess: 0,
        openFallback: 0,
      };

      if (row.event_name === ANALYTICS_EVENTS.click) current.click += 1;
      if (row.event_name === ANALYTICS_EVENTS.openAttempt) current.openAttempt += 1;
      if (row.event_name === ANALYTICS_EVENTS.openSuccess) current.openSuccess += 1;
      if (row.event_name === ANALYTICS_EVENTS.openFallback) current.openFallback += 1;

      buckets.set(key, current);
    }

    const rows = Array.from(buckets.values())
      .map((row) => ({
        ...row,
        openSuccessRatePct: toRate(row.openSuccess, row.click),
        fallbackRatePct: toRate(row.openFallback, row.click),
      }))
      .sort((a, b) => {
        if (b.openSuccess !== a.openSuccess) return b.openSuccess - a.openSuccess;
        return b.click - a.click;
      });

    return NextResponse.json({ ok: true, scope, range, rows });
  } catch (error: any) {
    console.error('读取 analytics route-health 失败', error);
    return NextResponse.json(
      { ok: false, error: error?.message || '读取失败' },
      { status: 500 },
    );
  }
}
