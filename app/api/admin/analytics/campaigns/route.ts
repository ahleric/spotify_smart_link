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

type CampaignBucket = {
  key: string;
  utmSource: string;
  utmMedium: string;
  adSetId: string;
  adId: string;
  adSetName: string;
  adName: string;
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

function pickFirstString(
  source: any,
  keys: string[],
) {
  for (const key of keys) {
    const value = String(source?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function looksLikeMetaId(value: string) {
  return /^\d{8,24}$/.test(value.trim());
}

function getAdSetId(attr: any) {
  return (attr?.adset_id || attr?.utm_term || '').trim() || 'unknown';
}

function getAdId(attr: any) {
  return (attr?.ad_id || attr?.utm_content || '').trim() || 'unknown';
}

function getAdSetName(attr: any) {
  const explicit = pickFirstString(attr, [
    'adset_name',
    'ad_set_name',
    'utm_adset_name',
    'utm_adset',
    'adset',
    'ad_set',
  ]);
  if (explicit) return explicit.slice(0, 180);

  const term = String(attr?.utm_term || '').trim();
  if (term && !looksLikeMetaId(term)) return term.slice(0, 180);
  return '';
}

function getAdName(attr: any) {
  const explicit = pickFirstString(attr, [
    'ad_name',
    'utm_ad_name',
    'utm_ad',
    'ad',
  ]);
  if (explicit) return explicit.slice(0, 180);

  const content = String(attr?.utm_content || '').trim();
  if (content && !looksLikeMetaId(content)) return content.slice(0, 180);
  return '';
}

function getCampaignKey(attr: any) {
  const adSetId = getAdSetId(attr);
  const adId = getAdId(attr);
  return `${adSetId}::${adId}`;
}

async function resolveAdsReadToken(_scope: ReturnType<typeof normalizeScope>) {
  const envToken =
    process.env.META_ADS_READ_TOKEN ||
    process.env.META_ADS_ACCESS_TOKEN ||
    process.env.FB_ADS_READ_TOKEN ||
    '';
  return envToken;
}

async function fetchMetaObjectName(id: string, token: string) {
  const endpoint = `https://graph.facebook.com/v22.0/${encodeURIComponent(id)}?fields=name&access_token=${encodeURIComponent(token)}`;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 1200);
  try {
    const response = await fetch(endpoint, { method: 'GET', signal: abortController.signal });
    if (!response.ok) return '';
    const payload = await response.json().catch(() => null);
    return String(payload?.name || '').trim().slice(0, 180);
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichNamesFromMetaApi<T extends {
  adSetId: string;
  adId: string;
  adSetName: string;
  adName: string;
}>(
  rows: T[],
  token: string,
) {
  if (!token) return rows;

  const adSetIds = Array.from(new Set(rows
    .filter((row) => !row.adSetName && looksLikeMetaId(row.adSetId))
    .map((row) => row.adSetId))).slice(0, 20);
  const adIds = Array.from(new Set(rows
    .filter((row) => !row.adName && looksLikeMetaId(row.adId))
    .map((row) => row.adId))).slice(0, 20);

  const [adSetEntries, adEntries] = await Promise.all([
    Promise.all(adSetIds.map(async (id) => [id, await fetchMetaObjectName(id, token)] as const)),
    Promise.all(adIds.map(async (id) => [id, await fetchMetaObjectName(id, token)] as const)),
  ]);

  const adSetNameMap = new Map(adSetEntries.filter(([, name]) => Boolean(name)));
  const adNameMap = new Map(adEntries.filter(([, name]) => Boolean(name)));

  return rows.map((row) => ({
    ...row,
    adSetName: row.adSetName || adSetNameMap.get(row.adSetId) || '',
    adName: row.adName || adNameMap.get(row.adId) || '',
  }));
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
    const loadPage = async (from: number, to: number) => {
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
      const { data, error } = await query.range(from, to);
      return { data, error };
    };

    const data = await fetchAllPagedRows({
      fetchPage: loadPage,
      pageSize: 1000,
      maxRows: 250000,
    });

    const buckets = new Map<string, CampaignBucket>();

    for (const row of data) {
      const attr = (row as any).attribution || {};
      const key = getCampaignKey(attr);
      const current = buckets.get(key) || {
        key,
        utmSource: (attr.utm_source || 'unknown') as string,
        utmMedium: (attr.utm_medium || 'unknown') as string,
        adSetId: getAdSetId(attr),
        adId: getAdId(attr),
        adSetName: getAdSetName(attr),
        adName: getAdName(attr),
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

    let rows = Array.from(buckets.values())
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

    try {
      const token = await resolveAdsReadToken(scope);
      rows = await enrichNamesFromMetaApi(rows, token);
    } catch (lookupError) {
      console.warn('Meta 广告名称反查失败（已忽略）', lookupError);
    }

    return NextResponse.json({ ok: true, scope, range, rows });
  } catch (error: any) {
    console.error('读取 analytics campaigns 失败', error);
    return NextResponse.json(
      { ok: false, error: error?.message || '读取失败' },
      { status: 500 },
    );
  }
}
