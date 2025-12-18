import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SmartLinkPage from '@/components/SmartLinkPage';
import { getSupabaseClient } from '@/lib/supabase';
import type { ReleaseData } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const getRelease = async (slugSegments: string[]): Promise<ReleaseData> => {
  const slug = slugSegments.join('/');
  if (!slug) notFound();

  const supabase = getSupabaseClient('service');
  const { data, error } = await supabase
    .from('songs')
    .select(
      'artist_name, track_title, cover_image_url, spotify_web_link, spotify_deep_link, meta_pixel_id, facebook_access_token, artist:artists!inner(meta_pixel_id, facebook_access_token, name, slug)',
    )
    .eq('slug', slug)
    .single();

  if (error || !data) {
    console.error('未找到歌曲或读取失败', error);
    notFound();
  }

  const artist = (data as any).artist?.[0] ?? (data as any).artist ?? {};
  const pixelId = data.meta_pixel_id ?? artist.meta_pixel_id ?? undefined;
  const fbToken = data.facebook_access_token ?? artist.facebook_access_token ?? undefined;

  return {
    artistName: data.artist_name,
    trackTitle: data.track_title,
    coverImage: data.cover_image_url,
    spotifyWebLink: data.spotify_web_link,
    spotifyDeepLink: data.spotify_deep_link,
    metaPixelId: pixelId,
    facebookAccessToken: fbToken,
  };
};

export async function generateMetadata({
  params,
}: {
  params: { slug: string[] };
}): Promise<Metadata> {
  const release = await getRelease(params.slug);
  return {
    title: `${release.artistName} - ${release.trackTitle}`,
    description: '高性能音乐 Smart Link，优化移动端体验与转化追踪。',
    openGraph: {
      title: `${release.artistName} - ${release.trackTitle}`,
      description: '高性能音乐 Smart Link，优化移动端体验与转化追踪。',
      images: release.coverImage
        ? [{ url: release.coverImage, alt: release.trackTitle }]
        : undefined,
    },
  };
}

export default async function DynamicReleasePage({
  params,
}: {
  params: { slug: string[] };
}) {
  const release = await getRelease(params.slug);
  return <SmartLinkPage releaseData={release} />;
}
