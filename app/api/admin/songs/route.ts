import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { deriveSpotifyDeepLink, normalizeSlug } from '@/lib/song-utils';
import type { SongRow } from '@/lib/types';

export const runtime = 'edge';

const BUCKET = 'covers';

export async function GET() {
  try {
    const supabase = getSupabaseClient('service');
    const { data, error } = await supabase
      .from('songs')
      .select(
        'id, slug, artist_name, track_title, spotify_web_link, spotify_deep_link, cover_image_url, meta_pixel_id, facebook_access_token, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('读取歌曲列表失败', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('读取歌曲列表异常', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? '未知错误' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient('service');
    const formData = await request.formData();

    const rawSlug = (formData.get('slug') ?? '').toString();
    const artistName = (formData.get('artistName') ?? '').toString().trim();
    const trackTitle = (formData.get('trackTitle') ?? '').toString().trim();
    const spotifyWebLink = (formData.get('spotifyWebLink') ?? '').toString().trim();
    const cover = formData.get('cover') as File | null;
    let coverImageUrl = (formData.get('coverImageUrl') ?? '').toString().trim();
    const metaPixelId = (formData.get('metaPixelId') ?? '').toString().trim();
    const facebookAccessToken = (formData.get('facebookAccessToken') ?? '').toString().trim();

    const slug = normalizeSlug(rawSlug || trackTitle);
    const spotifyDeepLink =
      deriveSpotifyDeepLink(spotifyWebLink) ||
      (formData.get('spotifyDeepLink') ?? '').toString().trim();

    if (!slug || !artistName || !trackTitle || !spotifyWebLink) {
      return NextResponse.json(
        { ok: false, error: '请填写 slug、Artist、Title 与 Spotify Web 链接' },
        { status: 400 },
      );
    }

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

    if (cover) {
      // 稳健获取文件扩展名，若缺失则回落 jpg，避免出现 .undefined
      const getSafeExt = () => {
        const byName = cover.name?.includes('.') ? cover.name.split('.').pop() : '';
        const byType = cover.type?.includes('/') ? cover.type.split('/')[1] : '';
        const raw = (byName || byType || 'jpg')?.trim().toLowerCase() || 'jpg';
        const sanitized = raw.replace(/[^a-z0-9]/g, '');
        return sanitized || 'jpg';
      };

      const ext = getSafeExt();
      const filePath = `${slug || 'cover'}-${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET)
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

      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path);
      coverImageUrl = publicUrlData?.publicUrl ?? '';
    }

    const payload: Omit<SongRow, 'id'> = {
      slug,
      artist_name: artistName,
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
