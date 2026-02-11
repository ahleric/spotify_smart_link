'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import KpiCards from '@/components/admin/analytics/KpiCards';
import FunnelCard from '@/components/admin/analytics/FunnelCard';
import TrendChart from '@/components/admin/analytics/TrendChart';
import CampaignTable from '@/components/admin/analytics/CampaignTable';
import RouteHealthTable from '@/components/admin/analytics/RouteHealthTable';
import HighIntentTable from '@/components/admin/analytics/HighIntentTable';
import type {
  AnalyticsMode,
  AnalyticsRangePreset,
  CampaignsResponse,
  HighIntentResponse,
  RouteHealthResponse,
  SummaryResponse,
  TimeseriesResponse,
} from '@/components/admin/analytics/types';

type ArtistOption = {
  id: string;
  slug: string;
  name: string;
  photo_url?: string | null;
};

type SongOption = {
  id: string;
  slug: string;
  track_title: string;
  cover_image_url?: string | null;
};

type Filters = {
  mode: AnalyticsMode;
  artistSlug: string;
  songSlug: string;
  rangePreset: AnalyticsRangePreset;
  startDate: string;
  endDate: string;
};

const DEFAULT_FILTERS: Filters = {
  mode: 'artist',
  artistSlug: '',
  songSlug: '',
  rangePreset: 'week',
  startDate: '',
  endDate: '',
};

const RANGE_OPTIONS: Array<{ value: AnalyticsRangePreset; label: string }> = [
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: 'week', label: '过去一周' },
  { value: 'month', label: '过去一个月' },
  { value: 'custom', label: '自定义时间' },
];

function fetchJson<T>(url: string): Promise<T> {
  return fetch(url).then(async (res) => {
    const json = await res.json();
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || '请求失败');
    }
    return json as T;
  });
}

function parseInitialFiltersFromUrl(): Partial<Filters> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const modeRaw = (params.get('mode') || '').trim();
  const rangeRaw = (params.get('range') || '').trim();

  const mode: AnalyticsMode = modeRaw === 'song' ? 'song' : 'artist';
  const validRanges: AnalyticsRangePreset[] = ['today', 'yesterday', 'week', 'month', 'custom'];
  const mappedRange = rangeRaw === 'day'
    ? 'today'
    : rangeRaw === 'last_7d'
      ? 'week'
      : rangeRaw === 'last_30d'
        ? 'month'
        : rangeRaw;
  const rangePreset: AnalyticsRangePreset = validRanges.includes(mappedRange as AnalyticsRangePreset)
    ? (mappedRange as AnalyticsRangePreset)
    : 'week';

  return {
    mode,
    rangePreset,
    artistSlug: (params.get('artist_slug') || '').trim(),
    songSlug: (params.get('song_slug') || '').trim(),
    startDate: (params.get('start_date') || '').trim(),
    endDate: (params.get('end_date') || '').trim(),
  };
}

function buildQueryString(filters: Filters) {
  const params = new URLSearchParams();
  params.set('mode', filters.mode);
  params.set('range', filters.rangePreset);
  if (filters.artistSlug) params.set('artist_slug', filters.artistSlug);
  if (filters.mode === 'song' && filters.songSlug) params.set('song_slug', filters.songSlug);
  if (filters.rangePreset === 'custom') {
    if (filters.startDate) params.set('start_date', filters.startDate);
    if (filters.endDate) params.set('end_date', filters.endDate);
  }
  return params.toString();
}

function getCustomRangeError(filters: Filters) {
  if (filters.rangePreset !== 'custom') return null;
  if (!filters.startDate || !filters.endDate) return '自定义时间需要同时选择开始和结束日期。';
  if (new Date(filters.startDate).getTime() > new Date(filters.endDate).getTime()) {
    return '开始日期不能晚于结束日期。';
  }
  return null;
}

export default function AnalyticsDashboardPage() {
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [songs, setSongs] = useState<SongOption[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignsResponse | null>(null);
  const [routeHealth, setRouteHealth] = useState<RouteHealthResponse | null>(null);
  const [highIntent, setHighIntent] = useState<HighIntentResponse | null>(null);

  const queryString = useMemo(() => buildQueryString(filters), [filters]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = '管理后台 - 数据仪表盘';
    }
    const initial = parseInitialFiltersFromUrl();
    setFilters((prev) => ({ ...prev, ...initial }));
  }, []);

  useEffect(() => {
    fetchJson<{ ok: boolean; data: ArtistOption[] }>('/api/admin/artists')
      .then((res) => {
        const list = res.data || [];
        setArtists(list);
        setFilters((prev) => {
          const currentValid = prev.artistSlug && list.some((artist) => artist.slug === prev.artistSlug);
          return {
            ...prev,
            artistSlug: currentValid ? prev.artistSlug : (list[0]?.slug || ''),
          };
        });
      })
      .catch((err: any) => setError(err?.message || '加载艺人失败'));
  }, []);

  useEffect(() => {
    if (!filters.artistSlug) {
      setSongs([]);
      setFilters((prev) => ({ ...prev, songSlug: '' }));
      return;
    }

    let cancelled = false;
    fetchJson<{ ok: boolean; data: SongOption[] }>(`/api/admin/artists/${filters.artistSlug}/songs`)
      .then((res) => {
        if (cancelled) return;
        const list = res.data || [];
        setSongs(list);
        setFilters((prev) => {
          if (prev.artistSlug !== filters.artistSlug) return prev;
          if (prev.songSlug && list.some((song) => song.slug === prev.songSlug)) return prev;
          return { ...prev, songSlug: list[0]?.slug || '' };
        });
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || '加载歌曲失败');
      });

    return () => {
      cancelled = true;
    };
  }, [filters.artistSlug]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = buildQueryString(filters);
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState({}, '', nextUrl);
  }, [filters]);

  useEffect(() => {
    const customRangeError = getCustomRangeError(filters);
    if (customRangeError) {
      setValidationError(customRangeError);
      return;
    }

    if (filters.mode === 'song' && !filters.songSlug) {
      setValidationError('歌曲视角下请先选择一首歌曲。');
      return;
    }

    if (!filters.artistSlug) {
      setValidationError('请先选择艺人。');
      return;
    }

    setValidationError(null);
    setLoading(true);
    setError(null);

    Promise.all([
      fetchJson<SummaryResponse>(`/api/admin/analytics/summary?${queryString}`),
      fetchJson<TimeseriesResponse>(`/api/admin/analytics/timeseries?${queryString}`),
      fetchJson<CampaignsResponse>(`/api/admin/analytics/campaigns?${queryString}`),
      fetchJson<RouteHealthResponse>(`/api/admin/analytics/route-health?${queryString}`),
      fetchJson<HighIntentResponse>(`/api/admin/analytics/high-intent?${queryString}`),
    ])
      .then(([summaryRes, timeseriesRes, campaignsRes, routeRes, audienceRes]) => {
        setSummary(summaryRes);
        setTimeseries(timeseriesRes);
        setCampaigns(campaignsRes);
        setRouteHealth(routeRes);
        setHighIntent(audienceRes);
      })
      .catch((err: any) => setError(err?.message || '读取分析数据失败'))
      .finally(() => setLoading(false));
  }, [filters, queryString]);

  const selectedArtist = artists.find((item) => item.slug === filters.artistSlug);
  const selectedSong = songs.find((song) => song.slug === filters.songSlug);

  const currentArtistImage = selectedArtist?.photo_url || selectedSong?.cover_image_url || '';
  const currentArtistName = selectedArtist?.name || '未选择艺人';

  function updateFilters(next: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_rgba(2,6,23,1)_44%),linear-gradient(180deg,_#020617_0%,_#020617_100%)] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 md:px-6 md:py-7">
        <header className="rounded-xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-emerald-300">数据仪表盘</p>
              <h1 className="mt-1 text-xl font-bold md:text-2xl">艺人/歌曲投放看板</h1>
              {error ? <p className="mt-2 text-sm text-rose-400">错误：{error}</p> : null}
              {validationError ? <p className="mt-2 text-sm text-amber-300">提示：{validationError}</p> : null}
            </div>
            <Link
              href="/admin"
              className="inline-flex min-h-10 items-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500/20"
            >
              返回管理后台
            </Link>
          </div>
        </header>

        <section className="rounded-xl border border-white/10 bg-slate-900/75 p-3 ring-1 ring-white/5 md:p-4">
          <div className="grid gap-3 xl:grid-cols-[1fr_220px]">
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">查看维度</p>
                <div className="inline-flex rounded-lg border border-white/10 bg-slate-950/70 p-1">
                  <button
                    type="button"
                    onClick={() => updateFilters({ mode: 'artist' })}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium transition ${
                      filters.mode === 'artist'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-white/75 hover:text-white'
                    }`}
                  >
                    按艺人
                  </button>
                  <button
                    type="button"
                    onClick={() => updateFilters({ mode: 'song' })}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium transition ${
                      filters.mode === 'song'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-white/75 hover:text-white'
                    }`}
                  >
                    按歌曲
                  </button>
                </div>
              </div>

              <div className={`grid gap-3 ${filters.mode === 'song' ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                <label className="space-y-1">
                  <span className="text-sm text-white/80">艺人</span>
                  <select
                    value={filters.artistSlug}
                    onChange={(e) => updateFilters({ artistSlug: e.target.value })}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-800 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    {artists.map((artist) => (
                      <option key={artist.id} value={artist.slug}>{artist.name}</option>
                    ))}
                  </select>
                </label>

                {filters.mode === 'song' ? (
                  <label className="space-y-1">
                    <span className="text-sm text-white/80">歌曲</span>
                    <select
                      value={filters.songSlug}
                      onChange={(e) => updateFilters({ songSlug: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-800 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      {songs.map((song) => (
                        <option key={song.id} value={song.slug}>{song.track_title}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">时间范围</p>
                <div className="flex flex-wrap gap-2">
                  {RANGE_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => updateFilters({ rangePreset: item.value })}
                      className={`min-h-9 rounded-lg border px-3 text-sm transition ${
                        filters.rangePreset === item.value
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                          : 'border-white/10 bg-white/5 text-white/75 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {filters.rangePreset === 'custom' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm text-white/80">起始日期</span>
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => updateFilters({ startDate: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-800 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm text-white/80">结束日期</span>
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => updateFilters({ endDate: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-800 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <aside className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 p-2.5">
              <div className="overflow-hidden rounded-md border border-white/20 bg-slate-800 shadow-[0_8px_20px_rgba(0,0,0,0.32)]">
                <div
                  className="aspect-square w-full bg-slate-700 bg-cover bg-center"
                  style={currentArtistImage ? { backgroundImage: `url(${currentArtistImage})` } : undefined}
                >
                  {!currentArtistImage ? (
                    <div className="flex h-full w-full items-center justify-center text-sm text-white/55">暂无头像</div>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 truncate text-base font-semibold text-white">{currentArtistName}</p>
            </aside>
          </div>
        </section>

        <KpiCards summary={summary} loading={loading} />

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <TrendChart data={timeseries} loading={loading} />
          </div>
          <div>
            <FunnelCard summary={summary} loading={loading} />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <CampaignTable data={campaigns} loading={loading} />
          <RouteHealthTable data={routeHealth} loading={loading} />
        </div>

        <HighIntentTable data={highIntent} loading={loading} />
      </div>
    </main>
  );
}
