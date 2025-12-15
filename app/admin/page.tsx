import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { SupabaseClient } from '@supabase/supabase-js';
import DashboardClient from './parts/DashboardClient';

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

const ADMIN_COOKIE = 'admin_authed';

async function verifyPassword(formData: FormData) {
  'use server';
  const pwd = formData.get('password')?.toString() ?? '';
  if (pwd === process.env.ADMIN_PASSWORD) {
    cookies().set(ADMIN_COOKIE, 'true', {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 8, // 8 小时
    });
    redirect('/admin');
  }
  redirect('/admin?error=1');
}

async function getSongs() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as Song[]) ?? [];
}

export default async function AdminPage() {
  const cookieStore = cookies();
  const authed = cookieStore.get(ADMIN_COOKIE)?.value === 'true';

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-10">
        <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-xl">
          <h1 className="text-xl font-semibold text-white">后台登录</h1>
          <p className="mt-2 text-sm text-zinc-400">
            请输入后台密码（保存在环境变量 ADMIN_PASSWORD）。
          </p>
          <form action={verifyPassword} className="mt-4 space-y-3">
            <input
              type="password"
              name="password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
              placeholder="输入密码"
              required
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
            >
              登录
            </button>
          </form>
          <p className="mt-3 text-xs text-zinc-500">
            登录成功后 8 小时内保持会话；若需退出，清理浏览器 cookie。
          </p>
        </div>
      </main>
    );
  }

  const songs = await getSongs();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8 md:px-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">后台管理</h1>
          <p className="text-sm text-zinc-400">
            新增歌曲、上传封面、填写链接后即可生成新的落地页。
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full bg-zinc-900 px-3 py-2 text-sm text-emerald-400 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          已登录
        </div>
      </header>

      <DashboardClient initialSongs={songs} />
    </main>
  );
}
