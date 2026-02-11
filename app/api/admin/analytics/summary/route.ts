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

function toRate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

async function countEvent(params: {
  eventName: string;
  startIso: string;
  endIso: string;
  scope: ReturnType<typeof normalizeScope>;
}) {
  const supabase = getSupabaseClient('service');
  let query = supabase
    .from('landing_page_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_name', params.eventName)
    .gte('created_at', params.startIso)
    .lt('created_at', params.endIso);
  query = applyScopeToQuery(query, params.scope);
  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return count || 0;
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
      });
    }

    const [
      viewCount,
      clickCount,
      openSuccessCount,
      qualifiedCount,
      openFallbackCount,
    ] = await Promise.all([
      countEvent({
        eventName: ANALYTICS_EVENTS.view,
        startIso: range.startIso,
        endIso: range.endIso,
        scope,
      }),
      countEvent({
        eventName: ANALYTICS_EVENTS.click,
        startIso: range.startIso,
        endIso: range.endIso,
        scope,
      }),
      countEvent({
        eventName: ANALYTICS_EVENTS.openSuccess,
        startIso: range.startIso,
        endIso: range.endIso,
        scope,
      }),
      countEvent({
        eventName: ANALYTICS_EVENTS.qualified,
        startIso: range.startIso,
        endIso: range.endIso,
        scope,
      }),
      countEvent({
        eventName: ANALYTICS_EVENTS.openFallback,
        startIso: range.startIso,
        endIso: range.endIso,
        scope,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      scope,
      range,
      totals: {
        view: viewCount,
        click: clickCount,
        openSuccess: openSuccessCount,
        qualified: qualifiedCount,
        openFallback: openFallbackCount,
      },
      rates: {
        clickRatePct: toRate(clickCount, viewCount),
        openSuccessRatePct: toRate(openSuccessCount, clickCount),
        qualifiedRatePct: toRate(qualifiedCount, clickCount),
      },
      windows: {
        openSuccessRateStart: range.startIso,
        qualifiedRateStart: range.startIso,
      },
      notes: {
        openSuccessRate: 'OpenSuccess rate is calculated directly within the selected range.',
        qualifiedRate: 'Qualified rate is calculated directly within the selected range.',
      },
    });
  } catch (error: any) {
    console.error('读取 analytics summary 失败', error);
    return NextResponse.json(
      { ok: false, error: error?.message || '读取失败' },
      { status: 500 },
    );
  }
}
