'use client';

import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { BarChart3, Loader2, Mic2, Plus, RadioTower, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type ArtistNavItem = {
  id: string;
  slug: string;
  name: string;
  photo_url?: string | null;
};

function normalizePathSegments(pathname: string) {
  return pathname.split('/').filter(Boolean);
}

function getCurrentArtistSlug(
  pathname: string,
  searchParams: { get: (name: string) => string | null },
) {
  const segments = normalizePathSegments(pathname);
  const isDashboard = pathname.startsWith('/admin/analytics');
  if (isDashboard) {
    return (
      searchParams.get('artist_slug') ||
      (segments[2] ? decodeURIComponent(segments[2]) : '')
    );
  }
  if (segments[0] !== 'admin') return '';
  if (!segments[1] || segments[1] === 'analytics') return '';
  return decodeURIComponent(segments[1]);
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [artists, setArtists] = useState<ArtistNavItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isDashboard = pathname.startsWith('/admin/analytics');
  const currentArtistSlug = useMemo(
    () => getCurrentArtistSlug(pathname, searchParams),
    [pathname, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/admin/artists')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || '加载艺人失败');
        if (!cancelled) {
          setArtists((json.data || []).map((artist: any) => ({
            id: artist.id,
            slug: artist.slug,
            name: artist.name,
            photo_url: artist.photo_url || null,
          })));
        }
      })
      .catch(() => {
        if (!cancelled) setArtists([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackArtistSlug = currentArtistSlug || artists[0]?.slug || '';
  const landingRootHref: Route = fallbackArtistSlug ? (`/admin/${fallbackArtistSlug}` as Route) : '/admin';
  const dashboardRootHref: Route = fallbackArtistSlug
    ? (`/admin/analytics/${fallbackArtistSlug}` as Route)
    : '/admin/analytics';

  return (
    <div className="flex h-full flex-col gap-3 p-3 lg:gap-4 lg:p-4">
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 ring-1 ring-white/5">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
            <RadioTower className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] tracking-[0.16em] text-emerald-300">PEAKTIDE</p>
            <p className="text-sm font-semibold text-white">后台工作台</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-[170px] basis-[32%] flex-col gap-2 rounded-2xl border border-white/10 bg-slate-900/75 p-3 ring-1 ring-white/5">
        <p className="text-xs font-medium text-white/65">工具导航</p>
        <Link
          href={landingRootHref}
          className={`group inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
            !isDashboard
              ? 'bg-emerald-500 text-slate-950 shadow-[0_10px_26px_rgba(16,185,129,0.35)]'
              : 'bg-white/5 text-white/82 hover:bg-white/10'
          }`}
        >
          <Mic2 className="h-4 w-4" />
          落地页工具
        </Link>
        <Link
          href={dashboardRootHref}
          className={`group inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
            isDashboard
              ? 'bg-emerald-500 text-slate-950 shadow-[0_10px_26px_rgba(16,185,129,0.35)]'
              : 'bg-white/5 text-white/82 hover:bg-white/10'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          仪表盘
        </Link>
      </div>

      <div className="min-h-0 basis-[68%] rounded-2xl border border-white/10 bg-slate-900/75 p-3 ring-1 ring-white/5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium text-white/65">艺人列表</p>
          <Link
            href="/admin"
            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 text-xs text-white/80 transition hover:bg-emerald-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            新建
          </Link>
        </div>

        <div className="max-h-[52vh] space-y-2 overflow-auto pr-1 lg:max-h-[calc(100vh-300px)]">
          {loading ? (
            <div className="flex min-h-24 items-center justify-center text-white/65">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : null}

          {!loading && artists.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-white/60">
              还没有艺人，先点“新建”创建。
            </div>
          ) : null}

          {!loading
            ? artists.map((artist) => {
              const href: Route = isDashboard
                ? (`/admin/analytics/${artist.slug}` as Route)
                : (`/admin/${artist.slug}` as Route);
              const active = artist.slug === currentArtistSlug;
              return (
                <Link
                  key={artist.id}
                  href={href}
                  className={`group flex min-h-12 items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
                    active
                      ? 'border-emerald-400/55 bg-emerald-500/18 shadow-[0_10px_24px_rgba(16,185,129,0.2)]'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/20 bg-slate-800">
                    {artist.photo_url ? (
                      <Image
                        src={artist.photo_url}
                        alt={artist.name}
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/55">
                        <UserRound className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <p className="flex-1 truncate text-sm font-medium text-white">{artist.name}</p>
                </Link>
              );
            })
            : null}
        </div>
      </div>
    </div>
  );
}
