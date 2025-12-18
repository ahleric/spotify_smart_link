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

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = getSupabaseClient('service');
    const { data, error } = await supabase
      .from('songs')
      .select(
        'id, artist_id, slug, artist_name, track_title, spotify_web_link, spotify_deep_link, cover_image_url, meta_pixel_id, facebook_access_token, artists (slug, name, meta_pixel_id, facebook_access_token)',
      )
      .eq('id', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || '未找到歌曲' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('读取歌曲异常', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? '未知错误' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseClient('service');

    // 先取当前歌曲及艺人信息
    const { data: current, error: currentError } = await supabase
      .from('songs')
      .select('id, artist_id, slug, artist_name, track_title, artists (slug, name)')
      .eq('id', params.id)
      .single();

    if (currentError || !current) {
      return NextResponse.json(
        { ok: false, error: currentError?.message || '未找到歌曲' },
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

    const artistRel = Array.isArray((current as any).artists)
      ? (current as any).artists[0]
      : (current as any).artists;
    const artistSlug = artistRel?.slug || current.slug.split('/')[0] || '';
    const songSlugPart = normalizeSlug(customSongSlug || buildSongSlug(trackTitle));
    const finalSlug = normalizeSlug(`${artistSlug}/${songSlugPart}`);

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

    const payload: Partial<SongRow> = {
      slug: finalSlug,
      track_title: trackTitle,
      spotify_web_link: spotifyWebLink,
      spotify_deep_link: spotifyDeepLink,
      cover_image_url: coverImageUrl || current.cover_image_url,
      meta_pixel_id: metaPixelId || null,
      facebook_access_token: facebookAccessToken || null,
    };

    const { data, error } = await supabase
      .from('songs')
      .update(payload)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('更新歌曲失败', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('更新歌曲异常', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? '未知错误' },
      { status: 500 },
    );
  }
}
