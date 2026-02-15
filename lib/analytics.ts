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
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDayKey(dayKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const [yearText, monthText, dayText] = dayKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utcMs = Date.UTC(year, month - 1, day);
  const normalized = formatDayKey(new Date(utcMs));
  if (normalized !== dayKey) return null;
  return { year, month, day };
}

function dayKeyToUtcMs(dayKey: string) {
  const parsed = parseDayKey(dayKey);
  if (!parsed) return null;
  return Date.UTC(parsed.year, parsed.month - 1, parsed.day);
}

function addDays(dayKey: string, days: number) {
  const utcMs = dayKeyToUtcMs(dayKey);
  if (utcMs === null) return dayKey;
  return formatDayKey(new Date(utcMs + days * DAY_MS));
}

function diffDaysInclusive(startDay: string, endDay: string) {
  const startMs = dayKeyToUtcMs(startDay);
  const endMs = dayKeyToUtcMs(endDay);
  if (startMs === null || endMs === null || startMs > endMs) return 0;
  return Math.floor((endMs - startMs) / DAY_MS) + 1;
}

function dayKeyNowBeijing() {
  return formatDayKey(new Date(Date.now() + BEIJING_OFFSET_MS));
}

function beijingDayStartIso(dayKey: string) {
  const utcMs = dayKeyToUtcMs(dayKey);
  if (utcMs === null) return new Date().toISOString();
  return new Date(utcMs - BEIJING_OFFSET_MS).toISOString();
}

function beijingDayKeyFromIso(iso: string) {
  const timeMs = new Date(iso).getTime();
  if (!Number.isFinite(timeMs)) return iso.slice(0, 10);
  return formatDayKey(new Date(timeMs + BEIJING_OFFSET_MS));
}

export function buildRange(days: number): AnalyticsRange {
  const safeDays = Math.max(1, Math.round(days || DEFAULT_DAYS));
  const endDate = dayKeyNowBeijing();
  const startDate = addDays(endDate, -(safeDays - 1));
  const endExclusiveDate = addDays(endDate, 1);
  return {
    range: safeDays === 1 ? 'today' : safeDays === 7 ? 'week' : safeDays === 30 ? 'month' : 'custom',
    days: safeDays,
    startIso: beijingDayStartIso(startDate),
    endIso: beijingDayStartIso(endExclusiveDate),
    startDate,
    endDate,
  };
}

export function resolveRange(searchParams: URLSearchParams): AnalyticsRange {
  const rangeRaw = (searchParams.get('range') || '').trim().toLowerCase();
  const fallbackDays = resolveDays(searchParams);

  // backward compatibility: if no explicit range and custom days passed, keep old behavior
  if (!rangeRaw && searchParams.get('days')) {
    return buildRange(fallbackDays);
  }

  const today = dayKeyNowBeijing();

  if (rangeRaw === 'today' || rangeRaw === 'day') {
    const startDate = today;
    const endExclusiveDate = addDays(startDate, 1);
    return {
      range: 'today',
      days: 1,
      startIso: beijingDayStartIso(startDate),
      endIso: beijingDayStartIso(endExclusiveDate),
      startDate,
      endDate: startDate,
    };
  }

  if (rangeRaw === 'yesterday') {
    const startDate = addDays(today, -1);
    const endExclusiveDate = today;
    return {
      range: 'yesterday',
      days: 1,
      startIso: beijingDayStartIso(startDate),
      endIso: beijingDayStartIso(endExclusiveDate),
      startDate,
      endDate: startDate,
    };
  }

  if (rangeRaw === 'month' || rangeRaw === 'last_30d') {
    const endDate = today;
    const startDate = addDays(endDate, -29);
    const endExclusiveDate = addDays(endDate, 1);
    return {
      range: 'month',
      days: 30,
      startIso: beijingDayStartIso(startDate),
      endIso: beijingDayStartIso(endExclusiveDate),
      startDate,
      endDate,
    };
  }

  if (rangeRaw === 'custom') {
    const startRaw = (searchParams.get('start_date') || '').trim();
    const endRaw = (searchParams.get('end_date') || '').trim();
    const startDate = parseDayKey(startRaw) ? startRaw : '';
    const endDate = parseDayKey(endRaw) ? endRaw : '';
    if (startDate && endDate && startDate <= endDate) {
      const days = diffDaysInclusive(startDate, endDate);
      const boundedDays = Math.min(MAX_CUSTOM_RANGE_DAYS, Math.max(1, days));
      const boundedEndDate = addDays(startDate, boundedDays - 1);
      const endExclusiveDate = addDays(boundedEndDate, 1);
      return {
        range: 'custom',
        days: boundedDays,
        startIso: beijingDayStartIso(startDate),
        endIso: beijingDayStartIso(endExclusiveDate),
        startDate,
        endDate: boundedEndDate,
      };
    }
  }

  if (rangeRaw === 'week' || rangeRaw === 'last_7d') {
    const endDate = today;
    const startDate = addDays(endDate, -6);
    const endExclusiveDate = addDays(endDate, 1);
    return {
      range: 'week',
      days: 7,
      startIso: beijingDayStartIso(startDate),
      endIso: beijingDayStartIso(endExclusiveDate),
      startDate,
      endDate,
    };
  }

  // default: past 7 days
  const endDate = today;
  const startDate = addDays(endDate, -6);
  const endExclusiveDate = addDays(endDate, 1);
  return {
    range: 'week',
    days: 7,
    startIso: beijingDayStartIso(startDate),
    endIso: beijingDayStartIso(endExclusiveDate),
    startDate,
    endDate,
  };
}

export function enumerateDays(range: AnalyticsRange) {
  const result: string[] = [];
  if (!parseDayKey(range.startDate)) return result;
  for (let i = 0; i < range.days; i += 1) {
    result.push(addDays(range.startDate, i));
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
  return beijingDayKeyFromIso(iso);
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
