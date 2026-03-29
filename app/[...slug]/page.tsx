import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import SmartLinkPage from '@/components/SmartLinkPage';
import { getSupabaseClient } from '@/lib/supabase';
import type { ReleaseData } from '@/lib/config';
import { createTrackingAuthToken } from '@/lib/tracking-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const RELEASE_CACHE_TTL_MS = 60_000;
const RELEASE_CACHE_MAX_ENTRIES = 300;

type ReleaseCacheEntry = {
  expiresAt: number;
  value: Promise<ReleaseData>;
};

const releaseCache = new Map<string, ReleaseCacheEntry>();

function normalizeSlugSegments(slugSegments: string[]) {
  return slugSegments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')
    .toLowerCase();
}

function pruneReleaseCache(now: number) {
  for (const [key, entry] of Array.from(releaseCache.entries())) {
    if (entry.expiresAt <= now) {
      releaseCache.delete(key);
    }
  }

  if (releaseCache.size <= RELEASE_CACHE_MAX_ENTRIES) {
    return;
  }

  const overflow = releaseCache.size - RELEASE_CACHE_MAX_ENTRIES;
  let removed = 0;
  for (const key of Array.from(releaseCache.keys())) {
    releaseCache.delete(key);
    removed += 1;
    if (removed >= overflow) {
      break;
    }
  }
}

async function fetchReleaseFromSupabase(slug: string): Promise<ReleaseData> {
  if (!slug) notFound();

  const supabase = getSupabaseClient('service');
  const { data, error } = await supabase
    .from('songs')
    .select(
      'artist_name, track_title, cover_image_url, spotify_web_link, spotify_deep_link, meta_pixel_id, routing_config, tracking_config, artist:artists!inner(meta_pixel_id, name, slug, routing_config, tracking_config)',
    )
    .eq('slug', slug)
    .single();

  if (error || !data) {
    console.error('未找到歌曲或读取失败', error);
    notFound();
  }

  const artist = (data as any).artist?.[0] ?? (data as any).artist ?? {};
  const pixelId = data.meta_pixel_id ?? artist.meta_pixel_id ?? undefined;
  const routingConfig = data.routing_config ?? artist.routing_config ?? null;
  const trackingConfig = data.tracking_config ?? artist.tracking_config ?? null;
  const trackingAuthToken = await createTrackingAuthToken(`/${slug}`);

  return {
    artistName: data.artist_name,
    trackTitle: data.track_title,
    coverImage: data.cover_image_url,
    spotifyWebLink: data.spotify_web_link,
    spotifyDeepLink: data.spotify_deep_link,
    metaPixelId: pixelId,
    trackingAuthToken,
    routingConfig,
    trackingConfig,
  };
}

const getReleaseBySlug = cache(async (rawSlug: string): Promise<ReleaseData> => {
  const slug = rawSlug.trim().toLowerCase();
  if (!slug) notFound();

  const now = Date.now();
  const cached = releaseCache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached) {
    releaseCache.delete(slug);
  }

  pruneReleaseCache(now);

  const value = fetchReleaseFromSupabase(slug);
  releaseCache.set(slug, {
    value,
    expiresAt: now + RELEASE_CACHE_TTL_MS,
  });

  try {
    return await value;
  } catch (error) {
    releaseCache.delete(slug);
    throw error;
  }
});

async function getRelease(slugSegments: string[]): Promise<ReleaseData> {
  return getReleaseBySlug(normalizeSlugSegments(slugSegments));
}

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
