'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type Song = {
  id: string;
  slug: string;
  artist_name: string;
  song_title: string;
  cover_url: string;
  spotify_deep_link: string | null;
  spotify_web_link: string | null;
  pixel_id: string | null;
  capi_token: string | null;
};

type Props = {
  initialSongs: Song[];
};

export default function DashboardClient({ initialSongs }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [songs, setSongs] = useState<Song[]>(initialSongs);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const file = formData.get('cover') as File | null;
    const slug = (formData.get('slug') as string).trim();
    const artist = (formData.get('artist_name') as string).trim();
    const title = (formData.get('song_title') as string).trim();
    const spotifyDeep = (formData.get('spotify_deep_link') as string).trim();
    const spotifyWeb = (formData.get('spotify_web_link') as string).trim();
    const pixel = (formData.get('pixel_id') as string).trim();
    const capi = (formData.get('capi_token') as string).trim();

    if (!file) {
      setMessage('请先选择封面文件');
      setLoading(false);
      return;
    }
    if (!slug) {
      setMessage('请填写 slug（用于 URL，例如 my-song）');
      setLoading(false);
      return;
    }

    try {
      // 上传封面到 covers bucket
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${slug}.${ext}`;
      const { data: uploadRes, error: uploadErr } = await supabase.storage
        .from('covers')
        .upload(filePath, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const coverUrl =
        supabase.storage.from('covers').getPublicUrl(filePath).data.publicUrl;

      // 写入数据库
      const { data, error } = await supabase
        .from('songs')
        .insert({
          slug,
          artist_name: artist,
          song_title: title,
          cover_url: coverUrl,
          spotify_deep_link: spotifyDeep || null,
          spotify_web_link: spotifyWeb || null,
          pixel_id: pixel || null,
          capi_token: capi || null,
        })
        .select()
        .single();

      if (error) throw error;

      setSongs((prev) => [data as Song, ...prev]);
      setMessage('保存成功！');
      event.currentTarget.reset();
    } catch (err: any) {
      setMessage(err.message || '保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">已发布歌曲</h2>
          <span className="text-xs text-zinc-500">最新在最前</span>
        </div>
        <div className="space-y-3">
          {songs.length === 0 && (
            <p className="text-sm text-zinc-500">还没有歌曲，快去添加吧。</p>
          )}
          {songs.map((song) => (
            <div
              key={song.id}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3"
            >
              <div>
                <p className="text-sm text-emerald-300">/{song.slug}</p>
                <p className="text-base font-semibold text-white">
                  {song.song_title}
                </p>
                <p className="text-sm text-zinc-500">{song.artist_name}</p>
              </div>
              <a
                href={`/${song.slug}`}
                className="text-sm font-semibold text-emerald-400 hover:text-emerald-300"
                target="_blank"
                rel="noreferrer"
              >
                预览
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-700/50 bg-zinc-900/70 p-5 shadow-[0_10px_30px_rgba(16,185,129,0.2)]">
        <h2 className="text-lg font-semibold text-white">新增歌曲</h2>
        <p className="mb-4 text-sm text-zinc-400">填写信息并上传封面。</p>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            name="slug"
            placeholder="slug（URL路径，如 my-song）"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
            required
          />
          <input
            name="artist_name"
            placeholder="艺人名"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
            required
          />
          <input
            name="song_title"
            placeholder="歌曲名"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
            required
          />
          <input
            name="spotify_deep_link"
            placeholder="Spotify 深链（可选）"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
          />
          <input
            name="spotify_web_link"
            placeholder="Spotify Web 链接（可选）"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
          />
          <input
            name="pixel_id"
            placeholder="Meta Pixel ID（可选）"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
          />
          <input
            name="capi_token"
            placeholder="CAPI Token（可选）"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
          />
          <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
            <p className="mb-1 font-semibold text-white">上传封面（必选）</p>
            <input
              type="file"
              name="cover"
              accept="image/*"
              className="w-full text-sm text-zinc-300"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '保存中…' : '保存'}
          </button>
          {message && (
            <p className="text-sm text-amber-300">
              {message}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
