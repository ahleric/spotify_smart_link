import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  buildSongSlug,
  deriveSpotifyDeepLink,
  normalizeSlug,
} from '@/lib/song-utils';
import type { SongRow } from '@/lib/types';

export const runtime = 'edge';

const COVER_BUCKET = 'covers';

async function getArtistBySlug(slug: string) {
  const supabase = getSupabaseClient('service');
  return supabase
    .from('artists')
    .select('id, slug, name, photo_url, meta_pixel_id, facebook_access_token')
    .eq('slug', slug)
    .single();
}

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } },
) {
  try {
    const supabase = getSupabaseClient('service');
    const { data: artist, error: artistError } = await getArtistBySlug(params.slug);
    if (artistError || !artist) {
      return NextResponse.json(
        { ok: false, error: artistError?.message || '未找到艺人' },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from('songs')
      .select(
        'id, artist_id, slug, artist_name, track_title, spotify_web_link, spotify_deep_link, cover_image_url, meta_pixel_id, facebook_access_token, created_at',
      )
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('读取歌曲列表失败', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data, artist });
  } catch (error: any) {
    console.error('读取歌曲列表异常', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? '未知错误' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  try {
    const supabase = getSupabaseClient('service');
    const { data: artist, error: artistError } = await getArtistBySlug(params.slug);
    if (artistError || !artist) {
      return NextResponse.json(
        { ok: false, error: artistError?.message || '未找到艺人' },
        { status: 404 },
      );
    }

    const formData = await request.formData();
    const trackTitle = (formData.get('trackTitle') ?? '').toString().trim();
    const spotifyWebLink = (formData.get('spotifyWebLink') ?? '').toString().trim();
    const customSongSlug = (formData.get('songSlug') ?? '').toString().trim();
    const cover = formData.get('cover') as File | null;
    let coverImageUrl = (formData.get('coverImageUrl') ?? '').toString().trim();
    const metaPixelId = (formData.get('metaPixelId') ?? '').toString().trim();
    const facebookAccessToken = (formData.get('facebookAccessToken') ?? '').toString().trim();

    if (!trackTitle || !spotifyWebLink) {
      return NextResponse.json(
        { ok: false, error: '请填写 Title 和 Spotify Web 链接' },
        { status: 400 },
      );
    }

    const spotifyDeepLink =
      (formData.get('spotifyDeepLink') ?? '').toString().trim() ||
      deriveSpotifyDeepLink(spotifyWebLink);

    if (!spotifyDeepLink) {
      return NextResponse.json(
        { ok: false, error: '无法从 Web 链接生成 spotify:// 深链，请检查链接格式' },
        { status: 400 },
      );
    }

    if (!cover && !coverImageUrl) {
      return NextResponse.json(
        { ok: false, error: '请上传封面，或提供 coverImageUrl' },
        { status: 400 },
      );
    }

    const songSlugPart = normalizeSlug(customSongSlug || buildSongSlug(trackTitle));
    const finalSlug = normalizeSlug(`${artist.slug}/${songSlugPart}`);

    if (cover) {
      const getSafeExt = () => {
        const byName = cover.name?.includes('.') ? cover.name.split('.').pop() : '';
        const byType = cover.type?.includes('/') ? cover.type.split('/')[1] : '';
        const raw = (byName || byType || 'jpg')?.trim().toLowerCase() || 'jpg';
        const sanitized = raw.replace(/[^a-z0-9]/g, '');
        return sanitized || 'jpg';
      };
      const ext = getSafeExt();
      const safeSlug = finalSlug.replace(/\//g, '-');
      const filePath = `${safeSlug}-${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(COVER_BUCKET)
        .upload(filePath, cover, {
          cacheControl: '3600',
          contentType: cover.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('上传封面失败', uploadError);
        return NextResponse.json(
          { ok: false, error: `封面上传失败：${uploadError.message}` },
          { status: 500 },
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from(COVER_BUCKET)
        .getPublicUrl(uploadData.path);
      coverImageUrl = publicUrlData?.publicUrl ?? '';
    }

    const payload: Omit<SongRow, 'id'> = {
      artist_id: artist.id,
      slug: finalSlug,
      artist_name: artist.name,
      track_title: trackTitle,
      spotify_web_link: spotifyWebLink,
      spotify_deep_link: spotifyDeepLink,
      cover_image_url: coverImageUrl,
      meta_pixel_id: metaPixelId || null,
      facebook_access_token: facebookAccessToken || null,
    };

    const { data, error } = await supabase
      .from('songs')
      .upsert(payload, { onConflict: 'slug' })
      .select()
      .single();

    if (error) {
      console.error('写入歌曲失败', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('创建歌曲异常', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? '未知错误' },
      { status: 500 },
    );
  }
}
