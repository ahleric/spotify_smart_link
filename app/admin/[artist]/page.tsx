'use client';
export const runtime = 'edge';

import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BarChart3, ExternalLink, Link2, Plus, SquarePen } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ArtistRow, SongRow } from '@/lib/types';

type SongListItem = Pick<
  SongRow,
  | 'id'
  | 'slug'
  | 'artist_name'
  | 'track_title'
  | 'spotify_web_link'
  | 'spotify_deep_link'
  | 'cover_image_url'
  | 'meta_pixel_id'
  | 'facebook_access_token'
  | 'created_at'
>;

export default function ArtistDetailPage() {
  const params = useParams<{ artist: string }>();
  const artistSlug = params.artist;

  const [artist, setArtist] = useState<ArtistRow | null>(null);
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/artists/${artistSlug}/songs`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || '加载失败');
        setArtist(json.artist);
        setSongs(json.data ?? []);
      } catch (err: any) {
        setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [artistSlug]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = artist?.name ? `管理后台 - ${artist.name}` : '管理后台 - 艺人';
  }, [artist?.name]);

  const buildLink = (slug: string) => {
    if (typeof window === 'undefined') return slug;
    const clean = slug.replace(/^\/+/, '');
    return `${window.location.origin}/${clean}`;
  };

  const handleCopyLink = (slug: string) => {
    const link = buildLink(slug);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).catch(() => undefined);
    }
    setCopiedSlug(slug);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedSlug(null), 1500);
  };

  if (loading) {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-white/75">加载中...</div>;
  }

  if (!artist) {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-white/75">未找到艺人</div>;
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-white/10 bg-slate-900/75 p-5 ring-1 ring-white/5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/15 bg-slate-800">
              {artist.photo_url ? (
                <Image src={artist.photo_url} alt={artist.name} fill sizes="80px" className="object-cover" />
              ) : null}
            </div>
            <div>
              <p className="text-xs tracking-[0.15em] text-emerald-300">艺人落地页管理</p>
              <h1 className="text-2xl font-semibold text-white md:text-3xl">{artist.name}</h1>
              <p className="text-sm text-white/65">/{artist.slug}</p>
              <p className="mt-1 text-sm text-white/68">
                Pixel：{artist.meta_pixel_id || '未填'} · CAPI：{artist.facebook_access_token ? '已配置' : '未填'}
              </p>
              {error ? <p className="mt-2 text-sm text-rose-400">错误：{error}</p> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/analytics/${artist.slug}` as Route}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <BarChart3 className="h-4 w-4" />
              查看仪表盘
            </Link>
            <Link
              href={`/admin/${artist.slug}/new` as Route}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.3)] transition hover:brightness-105"
            >
              <Plus className="h-4 w-4" />
              新建落地页
            </Link>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-slate-900/75 p-4 ring-1 ring-white/5 md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">该艺人的歌曲落地页</h2>
          <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sm text-white/80">
            {songs.length} 首
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {songs.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/62">
              暂无落地页，点击右上角“新建落地页”。
            </p>
          ) : null}

          {songs.map((song) => (
            <div
              key={song.id}
              className="group flex gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-emerald-400/55 hover:bg-white/[0.05]"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-slate-800">
                {song.cover_image_url ? (
                  <Image src={song.cover_image_url} alt={song.track_title} fill sizes="64px" className="object-cover" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">{song.track_title}</p>
                <p className="truncate text-sm text-white/62">/{song.slug}</p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyLink(song.slug)}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition ${
                      copiedSlug === song.slug
                        ? 'bg-emerald-500 text-slate-950'
                        : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                    }`}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {copiedSlug === song.slug ? '已复制' : '复制链接'}
                  </button>

                  <Link
                    href={`/admin/${artist.slug}/songs/${song.id}` as Route}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                    编辑
                  </Link>

                  <a
                    href={`/${song.slug.replace(/^\/+/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/28"
                    aria-label="打开落地页"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    打开
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
