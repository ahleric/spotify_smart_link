'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildArtistSlug, normalizeSlug } from '@/lib/song-utils';
import type { ArtistRow } from '@/lib/types';

type ArtistListItem = Pick<
  ArtistRow,
  'id' | 'slug' | 'name' | 'photo_url' | 'meta_pixel_id' | 'facebook_access_token' | 'created_at'
>;

export default function AdminHome() {
  const [artists, setArtists] = useState<ArtistListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    name: '',
    slug: '',
    metaPixelId: '',
    facebookAccessToken: '',
    photoUrl: '',
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = '管理后台 - 艺人列表';
    }
    fetch('/api/admin/artists')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || '加载失败');
        setArtists(json.data ?? []);
      })
      .catch((err) => setError(err.message || '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  const derivedSlug = useMemo(
    () => normalizeSlug(formState.slug || buildArtistSlug(formState.name)),
    [formState.name, formState.slug],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    if (derivedSlug) {
      formData.set('slug', derivedSlug);
    }

    try {
      const res = await fetch('/api/admin/artists', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || '保存失败');
      }
      const saved: ArtistListItem = json.data;
      setArtists((prev) => [saved, ...prev.filter((a) => a.slug !== saved.slug)]);
      setFormState({
        name: '',
        slug: '',
        metaPixelId: '',
        facebookAccessToken: '',
        photoUrl: '',
      });
      form.reset();
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-emerald-400">Admin Panel</p>
          <h1 className="text-3xl font-bold">Artist Profiles</h1>
          <p className="text-sm text-white/70">先创建艺人 Profile，再在艺人页里创建歌曲落地页。</p>
          {error && <p className="text-sm text-rose-400">错误：{error}</p>}
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl bg-slate-900/80 p-6 ring-1 ring-white/5 lg:col-span-1"
          >
            <div className="space-y-2">
              <label className="text-sm text-white/80">
                艺人名称 *
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 transition focus:ring-2"
                  name="name"
                  value={formState.name}
                  onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                  required
                  placeholder="例如：Mola Oddity"
                />
              </label>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/80">
                Slug（可空，留空自动生成）
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 transition focus:ring-2"
                  name="slug"
                  value={formState.slug}
                  onChange={(e) => setFormState((s) => ({ ...s, slug: e.target.value }))}
                  placeholder="例如：mola-oddity"
                />
              </label>
              <p className="text-xs text-white/60">将作为路径前缀：/{derivedSlug || '待生成'}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/80">
                Meta Pixel ID（可空）
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 transition focus:ring-2"
                  name="metaPixelId"
                  value={formState.metaPixelId}
                  onChange={(e) => setFormState((s) => ({ ...s, metaPixelId: e.target.value }))}
                  placeholder="13820..."
                />
              </label>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/80">
                Conversions API Token（可空，仅 CAPI）
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 transition focus:ring-2"
                  name="facebookAccessToken"
                  value={formState.facebookAccessToken}
                  onChange={(e) => setFormState((s) => ({ ...s, facebookAccessToken: e.target.value }))}
                  placeholder="长 token"
                />
              </label>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/80">艺人照片（头像/形象图）</label>
              <input
                name="photo"
                type="file"
                accept="image/*"
                className="block w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-900"
              />
              <p className="text-xs text-white/50">会上传到 Storage bucket: artists。</p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-900 shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition hover:translate-y-px disabled:opacity-60"
            >
              {saving ? '提交中...' : '创建 Artist Profile'}
            </button>
          </form>

          <div className="lg:col-span-2 space-y-4 rounded-2xl bg-slate-900/80 p-5 ring-1 ring-white/5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">所有艺人</h2>
              {loading && <span className="text-xs text-white/60">加载中...</span>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {artists.length === 0 && !loading && (
                <p className="text-sm text-white/60">暂无艺人，先创建一个吧。</p>
              )}
              {artists.map((artist) => (
                <div
                  key={artist.id}
                  className="flex gap-3 rounded-xl border border-white/5 bg-slate-800/80 p-4 text-sm transition hover:border-emerald-400/60"
                >
                  <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-700">
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
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">{artist.name}</p>
                        <p className="text-[11px] text-white/60 truncate">/{artist.slug}</p>
                      </div>
                      <Link
                        href={`/admin/${artist.slug}`}
                        className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-white/80 hover:bg-emerald-500/70 hover:text-slate-900"
                      >
                        管理
                      </Link>
                    </div>
                    <p className="text-[11px] text-emerald-300">
                      Pixel：{artist.meta_pixel_id || '（未填）'}
                    </p>
                    <p className="text-[11px] text-white/50">
                      CAPI Token：{artist.facebook_access_token ? '已配置' : '（未填）'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
