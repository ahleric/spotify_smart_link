'use client';

import Image from 'next/image';
import Link from 'next/link';
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
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">加载中...</div>
      </main>
    );
  }

  if (!artist) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">未找到艺人</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-800">
              {artist.photo_url ? (
                <Image
                  src={artist.photo_url}
                  alt={artist.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div>
              <p className="text-sm uppercase tracking-widest text-emerald-400">Artist Profile</p>
              <h1 className="text-3xl font-bold">{artist.name}</h1>
              <p className="text-sm text-white/70 truncate">/{artist.slug}</p>
              <p className="text-xs text-emerald-300">
                Pixel：{artist.meta_pixel_id || '（未填）'} · CAPI：{artist.facebook_access_token ? '已配置' : '（未填）'}
              </p>
              {error && <p className="text-sm text-rose-400">错误：{error}</p>}
            </div>
          </div>
          <Link
            href="/admin"
            className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-emerald-500/20"
          >
            返回艺人列表
          </Link>
        </header>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">落地页</h2>
          <Link
            href={`/admin/${artist.slug}/new`}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition hover:translate-y-px"
          >
            创建新落地页
          </Link>
        </div>

        <section className="rounded-2xl bg-slate-900/80 p-6 ring-1 ring-white/5">
          <div className="grid gap-4 sm:grid-cols-2">
            {songs.length === 0 && (
              <p className="text-sm text-white/60">暂无数据，点击右上角创建新落地页。</p>
            )}
            {songs.map((song) => (
              <div
                key={song.id}
                className="flex gap-3 rounded-xl border border-white/5 bg-slate-800/80 p-4 text-sm transition hover:border-emerald-400/60"
              >
                <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-700">
                  {song.cover_image_url ? (
                    <Image
                      src={song.cover_image_url}
                      alt={song.track_title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <div>
                    <p className="text-base font-semibold text-white">{song.track_title}</p>
                    <p className="text-xs uppercase tracking-wide text-emerald-300">
                      {song.artist_name}
                    </p>
                  </div>
                  <div className="text-[11px] text-white/70">
                    <span className="block truncate">{song.slug || '无 slug'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyLink(song.slug)}
                      className={`rounded px-2 py-0.5 text-[10px] transition ${
                        copiedSlug === song.slug
                          ? 'bg-emerald-500 text-slate-900'
                          : 'bg-white/10 text-emerald-300 hover:bg-emerald-500/20'
                      }`}
                    >
                      {copiedSlug === song.slug ? '√ 已复制' : '复制链接'}
                    </button>
                    <Link
                      href={`/admin/${artist.slug}/songs/${song.id}`}
                      className="rounded px-2 py-0.5 text-[10px] text-white transition bg-white/10 hover:bg-emerald-500/20"
                    >
                      编辑
                    </Link>
                    <a
                      href={`/${song.slug.replace(/^\/+/, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center rounded bg-white/10 px-2 py-0.5 text-[12px] text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-900"
                      title="打开落地页"
                      aria-label="打开落地页"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                        <path d="M21 14v7H3V3h7" />
                      </svg>
                    </a>
                  </div>
                  <p className="text-[11px] text-emerald-300">
                    Pixel：{song.meta_pixel_id || '（继承艺人或默认）'}
                  </p>
                  <p className="text-[11px] text-white/50">
                    CAPI Token：{song.facebook_access_token ? '已配置' : '（继承艺人或默认）'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
