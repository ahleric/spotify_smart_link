'use client';
export const runtime = 'edge';

import type { Route } from 'next';
import Link from 'next/link';
import { ArrowLeft, Link2, Sparkles } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  buildArtistSlug,
  buildSongSlug,
  deriveSpotifyDeepLink,
  normalizeSlug,
} from '@/lib/song-utils';
import type { ArtistRow } from '@/lib/types';

export default function NewSongPage() {
  const params = useParams<{ artist: string }>();
  const artistSlug = params.artist;
  const router = useRouter();

  const [artist, setArtist] = useState<ArtistRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    trackTitle: '',
    spotifyWebLink: '',
    songSlug: '',
    coverImageUrl: '',
    metaPixelId: '',
    facebookAccessToken: '',
  });

  const derivedArtistSlug = useMemo(
    () => normalizeSlug(buildArtistSlug(artist?.slug || artistSlug)),
    [artist?.slug, artistSlug],
  );
  const derivedSongSlug = useMemo(
    () => normalizeSlug(formState.songSlug || buildSongSlug(formState.trackTitle)),
    [formState.songSlug, formState.trackTitle],
  );
  const derivedFullSongSlug = useMemo(
    () => normalizeSlug(`${derivedArtistSlug}/${derivedSongSlug || 'song'}`),
    [derivedArtistSlug, derivedSongSlug],
  );
  const derivedSongDeepLink = useMemo(
    () => deriveSpotifyDeepLink(formState.spotifyWebLink),
    [formState.spotifyWebLink],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/artists/${artistSlug}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || '加载艺人失败');
        setArtist(json.data);
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
    document.title = artist?.name ? `管理后台 - 新建歌曲 (${artist.name})` : '管理后台 - 新建歌曲';
  }, [artist?.name]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (derivedSongSlug) {
      formData.set('songSlug', derivedSongSlug);
    }
    try {
      const res = await fetch(`/api/admin/artists/${artistSlug}/songs`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || '保存失败');
      }
      router.push(`/admin/${artistSlug}` as Route);
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.15em] text-emerald-300">新建落地页</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">{artist.name}</h1>
            <p className="text-sm text-white/65">/{artist.slug}</p>
            {error ? <p className="mt-2 text-sm text-rose-400">错误：{error}</p> : null}
          </div>
          <Link
            href={`/admin/${artist.slug}` as Route}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            返回艺人页
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-slate-900/75 p-5 ring-1 ring-white/5">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Field
            label="歌曲名称"
            name="trackTitle"
            value={formState.trackTitle}
            onChange={(value) => setFormState((state) => ({ ...state, trackTitle: value }))}
            required
            placeholder="例如：Vicious Cycle"
          />
          <Field
            label="Spotify Web 链接"
            name="spotifyWebLink"
            value={formState.spotifyWebLink}
            onChange={(value) => setFormState((state) => ({ ...state, spotifyWebLink: value }))}
            required
            placeholder="https://open.spotify.com/track/..."
          />
          <Field
            label="自定义 Song Slug（可空）"
            name="songSlug"
            value={formState.songSlug}
            onChange={(value) => setFormState((state) => ({ ...state, songSlug: value }))}
            placeholder="例如：vicious-cycle"
          />
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/72">
            最终路径：/{derivedFullSongSlug}
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Meta Pixel ID（可空）"
              name="metaPixelId"
              value={formState.metaPixelId}
              onChange={(value) => setFormState((state) => ({ ...state, metaPixelId: value }))}
            />
            <Field
              label="Conversions API Token（可空）"
              name="facebookAccessToken"
              value={formState.facebookAccessToken}
              onChange={(value) => setFormState((state) => ({ ...state, facebookAccessToken: value }))}
            />
          </div>

          <Field
            label="封面直链（可选）"
            name="coverImageUrl"
            value={formState.coverImageUrl}
            onChange={(value) => setFormState((state) => ({ ...state, coverImageUrl: value }))}
            placeholder="https://..."
          />

          <div className="space-y-1">
            <label className="text-sm text-white/82">上传封面图片（优先）</label>
            <input
              name="cover"
              type="file"
              accept="image/*"
              className="block min-h-11 w-full rounded-xl border border-white/10 bg-slate-800/85 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-950"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-white/85">
            <span className="inline-flex items-center gap-1"><Link2 className="h-4 w-4 text-emerald-300" />深链状态</span>
            <span className="font-mono text-emerald-300">{derivedSongDeepLink || '无法生成，请检查链接'}</span>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-slate-950 shadow-[0_10px_28px_rgba(16,185,129,0.3)] transition hover:brightness-105 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {saving ? '提交中...' : '创建歌曲落地页'}
          </button>
        </form>
      </section>
    </div>
  );
}

type FieldProps = {
  label: string;
  name: string;
  placeholder?: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
};

function Field({ label, name, placeholder, value, onChange, required }: FieldProps) {
  return (
    <label className="space-y-1">
      <span className="block text-sm text-white/82">
        {label}
        {required ? <span className="text-rose-300"> *</span> : null}
      </span>
      <input
        className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-800/85 px-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30"
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
