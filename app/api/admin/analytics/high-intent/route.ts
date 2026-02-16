import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  ANALYTICS_EVENTS,
  applyScopeToQuery,
  fetchAllPagedRows,
  isScopeReady,
  normalizeScope,
  resolveRange,
} from '@/lib/analytics';

export const runtime = 'edge';

type AudienceBucket = {
  audienceKey: string;
  lastSeenAt: string;
  lastQualifiedAt: string | null;
  utmSource: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  view: number;
  click: number;
  openSuccess: number;
  qualified: number;
};

function extractAudienceKey(row: any) {
  const payload = row?.payload || {};
  const identity = payload.identity || {};
  return (
    (identity.anonymousId || '').trim() ||
    (row?.fbp || '').trim() ||
    (row?.fbc || '').trim() ||
    (row?.event_id || '').trim() ||
    ''
  );
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
    const loadPage = (from: number, to: number) => {
      let query = supabase
        .from('landing_page_events')
        .select('event_name, event_id, created_at, fbp, fbc, attribution, payload')
        .in('event_name', [
          ANALYTICS_EVENTS.view,
          ANALYTICS_EVENTS.click,
          ANALYTICS_EVENTS.openSuccess,
          ANALYTICS_EVENTS.qualified,
        ])
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso)
        .order('created_at', { ascending: false });

      query = applyScopeToQuery(query, scope);
      return query.range(from, to);
    };

    const data = await fetchAllPagedRows({
      fetchPage: loadPage,
      pageSize: 1000,
      maxRows: 250000,
    });

    const buckets = new Map<string, AudienceBucket>();

    for (const row of data) {
      const key = extractAudienceKey(row);
      if (!key) continue;
      const attr = (row as any).attribution || {};

      const current = buckets.get(key) || {
        audienceKey: key,
        lastSeenAt: row.created_at,
        lastQualifiedAt: null,
        utmSource: (attr.utm_source || 'unknown') as string,
        utmCampaign: (attr.utm_campaign || 'unknown') as string,
        utmContent: (attr.utm_content || 'unknown') as string,
        utmTerm: (attr.utm_term || 'unknown') as string,
        view: 0,
        click: 0,
        openSuccess: 0,
        qualified: 0,
      };

      if (new Date(row.created_at).getTime() > new Date(current.lastSeenAt).getTime()) {
        current.lastSeenAt = row.created_at;
      }

      if (row.event_name === ANALYTICS_EVENTS.view) current.view += 1;
      if (row.event_name === ANALYTICS_EVENTS.click) current.click += 1;
      if (row.event_name === ANALYTICS_EVENTS.openSuccess) current.openSuccess += 1;
      if (row.event_name === ANALYTICS_EVENTS.qualified) {
        current.qualified += 1;
        if (!current.lastQualifiedAt || new Date(row.created_at).getTime() > new Date(current.lastQualifiedAt).getTime()) {
          current.lastQualifiedAt = row.created_at;
        }
      }

      buckets.set(key, current);
    }

    const rows = Array.from(buckets.values())
      .filter((row) => row.qualified > 0 || (row.click > 0 && row.openSuccess > 0))
      .sort((a, b) => {
        if (b.qualified !== a.qualified) return b.qualified - a.qualified;
        return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      })
      .slice(0, limit)
      .map((row) => ({
        ...row,
        audienceTier:
          row.qualified > 0
            ? 'qualified'
            : row.openSuccess > 0 && row.click > 0
              ? 'warm'
              : 'clicker',
      }));

    return NextResponse.json({ ok: true, scope, range, rows });
  } catch (error: any) {
    console.error('读取 analytics high-intent 失败', error);
    return NextResponse.json(
      { ok: false, error: error?.message || '读取失败' },
      { status: 500 },
    );
  }
}
