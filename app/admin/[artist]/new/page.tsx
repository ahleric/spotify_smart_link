'use client';
export const runtime = 'edge';

import Link from 'next/link';
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
      router.push(`/admin/${artistSlug}`);
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-emerald-400">新建落地页</p>
            <h1 className="text-2xl font-bold">{artist.name}</h1>
            <p className="text-sm text-white/70 truncate">/{artist.slug}</p>
            {error && <p className="text-sm text-rose-400">错误：{error}</p>}
          </div>
          <Link
            href={`/admin/${artist.slug}`}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-emerald-500/20"
          >
            返回该艺人
          </Link>
        </header>

        <section className="rounded-2xl bg-slate-900/80 p-6 ring-1 ring-white/5">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <Field
              label="Title *"
              name="trackTitle"
              value={formState.trackTitle}
              onChange={(value) => setFormState((s) => ({ ...s, trackTitle: value }))}
              required
            />
            <Field
              label="Spotify Web 链接 *"
              name="spotifyWebLink"
              value={formState.spotifyWebLink}
              onChange={(value) => setFormState((s) => ({ ...s, spotifyWebLink: value }))}
              required
            />
            <Field
              label="自定义 Song Slug（可空，默认用 Title 生成）"
              name="songSlug"
              value={formState.songSlug}
              onChange={(value) => setFormState((s) => ({ ...s, songSlug: value }))}
              placeholder="例如：my-song"
            />
            <p className="text-xs text-white/60">最终路径：/{derivedFullSongSlug}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field
                label="Meta Pixel ID（可空，若填则覆盖艺人配置）"
                name="metaPixelId"
                value={formState.metaPixelId}
                onChange={(value) => setFormState((s) => ({ ...s, metaPixelId: value }))}
              />
              <Field
                label="Conversions API Token（可空，若填则覆盖艺人配置）"
                name="facebookAccessToken"
                value={formState.facebookAccessToken}
                onChange={(value) => setFormState((s) => ({ ...s, facebookAccessToken: value }))}
              />
            </div>
            <Field
              label="封面直链（可选：若复用已有图）"
              name="coverImageUrl"
              value={formState.coverImageUrl}
              onChange={(value) => setFormState((s) => ({ ...s, coverImageUrl: value }))}
              placeholder="https://..."
            />
            <div className="space-y-1">
              <label className="text-sm text-white/80">上传封面（优先级最高）</label>
              <input
                name="cover"
                type="file"
                accept="image/*"
                className="block w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-900"
              />
              <p className="text-xs text-white/50">会上传到 Storage bucket: covers。</p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-800/60 px-4 py-3 text-sm text-white/80 ring-1 ring-white/5">
              <span>深链状态：{derivedSongDeepLink ? '已生成 ✔' : '未生成'}</span>
              {derivedSongDeepLink && (
                <span className="font-mono text-emerald-300">{derivedSongDeepLink}</span>
              )}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-900 shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition hover:translate-y-px disabled:opacity-60"
            >
              {saving ? '提交中...' : '创建歌曲落地页'}
            </button>
          </form>
        </section>
      </div>
    </main>
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
      <span className="block text-sm text-white/80">
        {label}
        {required && <span className="text-rose-300"> *</span>}
      </span>
      <input
        className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 transition focus:ring-2"
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
