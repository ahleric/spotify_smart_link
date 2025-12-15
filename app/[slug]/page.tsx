import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

type Song = {
  slug: string;
  artist_name: string;
  song_title: string;
  cover_url: string;
  spotify_deep_link: string | null;
  spotify_web_link: string | null;
  pixel_id: string | null;
};

function createSupabaseEdgeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch },
    },
  );
}

export default async function SongPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createSupabaseEdgeClient();
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('slug', params.slug)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const song = data as Song;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-start gap-6 px-5 pt-8 pb-32">
      <div className="absolute inset-0 -z-10">
        <Image
          src={song.cover_url}
          alt="background"
          fill
          priority
          sizes="100vw"
          className="object-cover blur-3xl brightness-[0.55] saturate-125"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/50 via-black/65 to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(52,211,153,0.25),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.2),transparent_30%)]" />
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-5 mb-4">
        <div className="relative w-full max-w-sm overflow-hidden rounded-[24px] shadow-[0_16px_36px_rgba(0,0,0,0.35)]">
          <Image
            src={song.cover_url}
            alt={`${song.song_title} Artwork`}
            width={900}
            height={900}
            sizes="(max-width: 768px) 78vw, 420px"
            className="h-auto w-full object-cover"
            priority
            loading="eager"
          />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-white">
            {song.song_title}
          </h1>
          <p className="mt-2 text-lg text-white/85">{song.artist_name}</p>
        </div>
      </div>

      <div className="fixed bottom-6 left-4 right-4 mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl bg-white px-5 py-4 shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
        {song.spotify_web_link || song.spotify_deep_link ? (
          <a
            href={song.spotify_deep_link || song.spotify_web_link || '#'}
            className="w-full rounded-2xl bg-[#1DB954] px-4 py-3 text-lg font-bold text-white shadow-[0_10px_24px_rgba(29,185,84,0.35)] transition active:scale-[0.99]"
          >
            Play
          </a>
        ) : (
          <p className="text-sm text-zinc-600">未提供 Spotify 链接</p>
        )}
      </div>
    </main>
  );
}
