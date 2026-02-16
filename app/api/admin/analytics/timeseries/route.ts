import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  ANALYTICS_EVENTS,
  applyScopeToQuery,
  enumerateDays,
  fetchAllPagedRows,
  isScopeReady,
  normalizeScope,
  resolveRange,
  toDayKey,
} from '@/lib/analytics';

export const runtime = 'edge';

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
        series: [],
      });
    }

    const supabase = getSupabaseClient('service');

    const loadPage = (from: number, to: number) => {
      let query = supabase
        .from('landing_page_events')
        .select('event_name, created_at')
        .in('event_name', [
          ANALYTICS_EVENTS.view,
          ANALYTICS_EVENTS.click,
          ANALYTICS_EVENTS.openSuccess,
          ANALYTICS_EVENTS.qualified,
          ANALYTICS_EVENTS.openFallback,
        ])
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso)
        .order('created_at', { ascending: true });
      query = applyScopeToQuery(query, scope);
      return query.range(from, to);
    };

    const data = await fetchAllPagedRows({
      fetchPage: loadPage,
      pageSize: 1000,
      maxRows: 250000,
    });

    const dayMap = new Map<string, {
      day: string;
      view: number;
      click: number;
      openSuccess: number;
      qualified: number;
      openFallback: number;
    }>();

    const dayKeys = enumerateDays(range);
    for (const day of dayKeys) {
      dayMap.set(day, {
        day,
        view: 0,
        click: 0,
        openSuccess: 0,
        qualified: 0,
        openFallback: 0,
      });
    }

    for (const row of data) {
      const day = toDayKey(row.created_at);
      const bucket = dayMap.get(day);
      if (!bucket) continue;
      if (row.event_name === ANALYTICS_EVENTS.view) bucket.view += 1;
      if (row.event_name === ANALYTICS_EVENTS.click) bucket.click += 1;
      if (row.event_name === ANALYTICS_EVENTS.openSuccess) bucket.openSuccess += 1;
      if (row.event_name === ANALYTICS_EVENTS.qualified) bucket.qualified += 1;
      if (row.event_name === ANALYTICS_EVENTS.openFallback) bucket.openFallback += 1;
    }

    const series = Array.from(dayMap.values()).map((item) => {
      return {
        ...item,
        clickRatePct: toRate(item.click, item.view),
        openSuccessRatePct: toRate(item.openSuccess, item.click),
        qualifiedRatePct: toRate(item.qualified, item.click),
      };
    });

    return NextResponse.json({
      ok: true,
      scope,
      range,
      windows: {
        openSuccessRateStart: range.startIso,
        qualifiedRateStart: range.startIso,
      },
      series,
    });
  } catch (error: any) {
    console.error('读取 analytics timeseries 失败', error);
    return NextResponse.json(
      { ok: false, error: error?.message || '读取失败' },
      { status: 500 },
    );
  }
}
