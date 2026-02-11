'use client';

import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BarChart3, FolderKanban, Music3, UserRoundPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = '管理后台 - 落地页工具';
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
      setArtists((prev) => [saved, ...prev.filter((artist) => artist.slug !== saved.slug)]);
      setFormState({
        name: '',
        slug: '',
        metaPixelId: '',
        facebookAccessToken: '',
      });
      form.reset();
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const firstArtistSlug = artists[0]?.slug;
  const landingEntryHref: Route = firstArtistSlug ? (`/admin/${firstArtistSlug}` as Route) : '/admin';
  const analyticsEntryHref: Route = firstArtistSlug
    ? (`/admin/analytics/${firstArtistSlug}` as Route)
    : '/admin/analytics';

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-white/10 bg-slate-900/75 p-5 ring-1 ring-white/5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.16em] text-emerald-300">后台工具</p>
            <h1 className="mt-1 text-2xl font-semibold text-white md:text-3xl">落地页工具</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70 md:text-base">
              创建艺人档案，进入艺人页管理歌曲落地页。
            </p>
            {error ? <p className="mt-2 text-sm text-rose-400">错误：{error}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={landingEntryHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <FolderKanban className="h-4 w-4" />
              打开艺人落地页
            </Link>
            <Link
              href={analyticsEntryHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.28)] transition hover:brightness-105"
            >
              <BarChart3 className="h-4 w-4" />
              打开仪表盘
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/75 p-5 ring-1 ring-white/5"
        >
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-500/15 p-2 text-emerald-300">
              <UserRoundPlus className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold text-white">创建艺人档案</h2>
          </div>

          <label className="space-y-1">
            <span className="text-sm text-white/82">艺人名称</span>
            <input
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-800/85 px-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30"
              name="name"
              value={formState.name}
              onChange={(e) => setFormState((state) => ({ ...state, name: e.target.value }))}
              required
              placeholder="例如：Private Cinema"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-white/82">Slug（可空）</span>
            <input
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-800/85 px-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30"
              name="slug"
              value={formState.slug}
              onChange={(e) => setFormState((state) => ({ ...state, slug: e.target.value }))}
              placeholder="例如：private-cinema"
            />
            <p className="text-xs text-white/58">最终路径前缀：/{derivedSlug || '待生成'}</p>
          </label>

          <label className="space-y-1">
            <span className="text-sm text-white/82">Meta Pixel ID（可空）</span>
            <input
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-800/85 px-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30"
              name="metaPixelId"
              value={formState.metaPixelId}
              onChange={(e) => setFormState((state) => ({ ...state, metaPixelId: e.target.value }))}
              placeholder="13820..."
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm text-white/82">Conversions API Token（可空）</span>
            <input
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-800/85 px-3 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30"
              name="facebookAccessToken"
              value={formState.facebookAccessToken}
              onChange={(e) => setFormState((state) => ({ ...state, facebookAccessToken: e.target.value }))}
              placeholder="长 token"
            />
          </label>

          <div className="space-y-1">
            <span className="text-sm text-white/82">艺人头像图片</span>
            <input
              name="photo"
              type="file"
              accept="image/*"
              className="block min-h-11 w-full rounded-xl border border-white/10 bg-slate-800/85 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-950"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-slate-950 shadow-[0_10px_28px_rgba(16,185,129,0.3)] transition hover:brightness-105 disabled:opacity-60"
          >
            {saving ? '提交中...' : '创建艺人'}
          </button>
        </form>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/75 p-5 ring-1 ring-white/5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-cyan-400/15 p-2 text-cyan-300">
                <Music3 className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-semibold text-white">已有艺人</h2>
            </div>
            <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sm text-white/78">
              {loading ? '加载中...' : `${artists.length} 位`}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {!loading && artists.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">暂无艺人，请先创建。</p>
            ) : null}

            {artists.map((artist) => (
              <div
                key={artist.id}
                className="group flex gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-emerald-400/55 hover:bg-white/[0.05]"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-slate-800">
                  {artist.photo_url ? (
                    <Image src={artist.photo_url} alt={artist.name} fill sizes="64px" className="object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-white">{artist.name}</p>
                  <p className="truncate text-sm text-white/62">/{artist.slug}</p>
                  <p className="mt-1 text-xs text-emerald-300">Pixel：{artist.meta_pixel_id || '未填'}</p>
                  <p className="text-xs text-white/55">CAPI：{artist.facebook_access_token ? '已配置' : '未填'}</p>
                  <div className="mt-2 flex gap-2">
                    <Link
                      href={`/admin/${artist.slug}` as Route}
                      className="inline-flex min-h-8 items-center rounded-lg bg-emerald-500/88 px-2.5 text-xs font-semibold text-slate-950 transition hover:brightness-105"
                    >
                      进入落地页
                    </Link>
                    <Link
                      href={`/admin/analytics/${artist.slug}` as Route}
                      className="inline-flex min-h-8 items-center rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                      查看数据
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
