export type AnalyticsMode = 'artist' | 'song';

export type AnalyticsScope = {
  mode: AnalyticsMode;
  artistSlug: string;
  songSlug: string;
};

export type AnalyticsRange = {
  range: AnalyticsRangePreset;
  days: number;
  startIso: string;
  endIso: string; // exclusive end
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (inclusive display)
};

export type AnalyticsRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export const ANALYTICS_EVENTS = {
  view: 'SmartLinkView',
  click: 'SmartLinkClick',
  routeChosen: 'SmartLinkRouteChosen',
  openAttempt: 'SmartLinkOpenAttempt',
  openFallback: 'SmartLinkOpenFallback',
  openSuccess: 'SmartLinkOpenSuccess',
  qualified: 'SmartLinkQualified',
} as const;

export const DEFAULT_DAYS = 7;
export const VALID_DAY_OPTIONS = [7, 14, 30] as const;
export const MAX_CUSTOM_RANGE_DAYS = 180;

export function normalizeScope(
  searchParams: URLSearchParams,
): AnalyticsScope {
  const modeRaw = (searchParams.get('mode') || 'artist').trim().toLowerCase();
  const mode: AnalyticsMode = modeRaw === 'song' ? 'song' : 'artist';
  const artistSlug = (searchParams.get('artist_slug') || '').trim().replace(/^\/+|\/+$/g, '');
  const songSlug = (searchParams.get('song_slug') || '').trim().replace(/^\/+|\/+$/g, '');
  return { mode, artistSlug, songSlug };
}

export function resolveDays(searchParams: URLSearchParams) {
  const raw = Number(searchParams.get('days') || DEFAULT_DAYS);
  if (!Number.isFinite(raw)) return DEFAULT_DAYS;
  const rounded = Math.round(raw);
  return VALID_DAY_OPTIONS.includes(rounded as (typeof VALID_DAY_OPTIONS)[number])
    ? rounded
    : DEFAULT_DAYS;
}

export function buildRange(days: number): AnalyticsRange {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = new Date(end.getTime() - 1).toISOString().slice(0, 10);
  return {
    range: days === 1 ? 'today' : days === 7 ? 'week' : days === 30 ? 'month' : 'custom',
    days,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate,
    endDate,
  };
}

function parseIsoDate(dateText: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const d = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function diffDaysInclusive(start: Date, endInclusive: Date) {
  const diff = endInclusive.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

export function resolveRange(searchParams: URLSearchParams): AnalyticsRange {
  const rangeRaw = (searchParams.get('range') || '').trim().toLowerCase();
  const fallbackDays = resolveDays(searchParams);

  // backward compatibility: if no explicit range and custom days passed, keep old behavior
  if (!rangeRaw && searchParams.get('days')) {
    return buildRange(fallbackDays);
  }

  const now = new Date();
  const nowStart = startOfUtcDay(now);

  if (rangeRaw === 'today' || rangeRaw === 'day') {
    const start = nowStart;
    const end = addUtcDays(start, 1);
    return {
      range: 'today',
      days: 1,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      startDate: start.toISOString().slice(0, 10),
      endDate: start.toISOString().slice(0, 10),
    };
  }

  if (rangeRaw === 'yesterday') {
    const start = addUtcDays(nowStart, -1);
    const end = nowStart;
    return {
      range: 'yesterday',
      days: 1,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      startDate: start.toISOString().slice(0, 10),
      endDate: start.toISOString().slice(0, 10),
    };
  }

  if (rangeRaw === 'month' || rangeRaw === 'last_30d') {
    const start = addUtcDays(nowStart, -29);
    const end = addUtcDays(nowStart, 1);
    return {
      range: 'month',
      days: 30,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      startDate: start.toISOString().slice(0, 10),
      endDate: nowStart.toISOString().slice(0, 10),
    };
  }

  if (rangeRaw === 'custom') {
    const startRaw = (searchParams.get('start_date') || '').trim();
    const endRaw = (searchParams.get('end_date') || '').trim();
    const start = parseIsoDate(startRaw);
    const endInclusive = parseIsoDate(endRaw);
    if (start && endInclusive && start.getTime() <= endInclusive.getTime()) {
      const days = diffDaysInclusive(start, endInclusive);
      const boundedDays = Math.min(MAX_CUSTOM_RANGE_DAYS, Math.max(1, days));
      const boundedEndInclusive = addUtcDays(start, boundedDays - 1);
      const endExclusive = addUtcDays(boundedEndInclusive, 1);
      return {
        range: 'custom',
        days: boundedDays,
        startIso: start.toISOString(),
        endIso: endExclusive.toISOString(),
        startDate: start.toISOString().slice(0, 10),
        endDate: boundedEndInclusive.toISOString().slice(0, 10),
      };
    }
  }

  if (rangeRaw === 'week' || rangeRaw === 'last_7d') {
    const start = addUtcDays(nowStart, -6);
    const end = addUtcDays(nowStart, 1);
    return {
      range: 'week',
      days: 7,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      startDate: start.toISOString().slice(0, 10),
      endDate: nowStart.toISOString().slice(0, 10),
    };
  }

  // default: past 7 days
  const start = addUtcDays(nowStart, -6);
  const end = addUtcDays(nowStart, 1);
  return {
    range: 'week',
    days: 7,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: nowStart.toISOString().slice(0, 10),
  };
}

export function enumerateDays(range: AnalyticsRange) {
  const result: string[] = [];
  const start = parseIsoDate(range.startDate);
  if (!start) return result;
  for (let i = 0; i < range.days; i += 1) {
    const d = addUtcDays(start, i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

export function isScopeReady(scope: AnalyticsScope) {
  if (scope.mode === 'song') return Boolean(scope.songSlug);
  return Boolean(scope.artistSlug);
}

export function applyScopeToQuery<T>(query: T, scope: AnalyticsScope): T {
  const mutable = query as any;
  if (scope.mode === 'song' && scope.songSlug) {
    return mutable.eq('request_path', `/${scope.songSlug}`);
  }
  if (scope.mode === 'artist' && scope.artistSlug) {
    return mutable.like('request_path', `/${scope.artistSlug}/%`);
  }
  return query;
}

export function maxIso(isoA: string, isoB?: string | null) {
  if (!isoB) return isoA;
  return new Date(isoB).getTime() > new Date(isoA).getTime() ? isoB : isoA;
}

export function toDayKey(iso: string) {
  return iso.slice(0, 10);
}

export function parseContext(payload: any) {
  const context = payload?.context ?? {};
  return {
    os: (context.os || 'unknown') as string,
    inAppBrowser: (context.in_app_browser || context.inAppBrowser || 'unknown') as string,
    isMobile: Boolean(context.is_mobile ?? context.isMobile ?? false),
  };
}

export function parseRoute(payload: any) {
  const route = payload?.route ?? {};
  return {
    strategy: (route.strategy || 'unknown') as string,
    reason: (route.reason || '') as string,
    fallbackDelayMs: Number(route.fallback_delay_ms || 0),
    deepLinkDelayMs: Number(route.deep_link_delay_ms || 0),
  };
}
