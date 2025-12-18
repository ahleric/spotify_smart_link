import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { buildArtistSlug, normalizeSlug } from '@/lib/song-utils';
import type { ArtistRow } from '@/lib/types';

export const runtime = 'edge';

const ARTIST_BUCKET = 'artists';

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  try {
    const supabase = getSupabaseClient('service');
    const { data, error } = await supabase
      .from('artists')
      .select('id, slug, name, photo_url, meta_pixel_id, facebook_access_token, created_at')
      .eq('slug', params.slug)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || '未找到艺人' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('读取艺人异常', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? '未知错误' },
      { status: 500 },
    );
  }
}

// 更新指定 slug 的艺人信息
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  try {
    const supabase = getSupabaseClient('service');
    const formData = await request.formData();

    const name = (formData.get('name') ?? '').toString().trim();
    const newSlugInput = (formData.get('slug') ?? '').toString().trim();
    const metaPixelId = (formData.get('metaPixelId') ?? '').toString().trim();
    const facebookAccessToken = (formData.get('facebookAccessToken') ?? '').toString().trim();
    let photoUrl = (formData.get('photoUrl') ?? '').toString().trim();
    const photo = formData.get('photo') as File | null;

    const newSlug = normalizeSlug(newSlugInput || buildArtistSlug(name || params.slug));

    if (!name || !newSlug) {
      return NextResponse.json(
        { ok: false, error: '请填写艺人名称（slug 留空将自动生成）' },
        { status: 400 },
      );
    }

    // 查现有艺人
    const { data: current, error: currentError } = await supabase
      .from('artists')
      .select('id, slug, name, photo_url')
      .eq('slug', params.slug)
      .single();

    if (currentError || !current) {
      return NextResponse.json(
        { ok: false, error: currentError?.message || '未找到艺人' },
        { status: 404 },
      );
    }

    if (photo) {
      const getSafeExt = () => {
        const byName = photo.name?.includes('.') ? photo.name.split('.').pop() : '';
        const byType = photo.type?.includes('/') ? photo.type.split('/')[1] : '';
        const raw = (byName || byType || 'jpg')?.trim().toLowerCase() || 'jpg';
        const sanitized = raw.replace(/[^a-z0-9]/g, '');
        return sanitized || 'jpg';
      };
      const ext = getSafeExt();
      const filePath = `${newSlug || 'artist'}-${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(ARTIST_BUCKET)
        .upload(filePath, photo, {
          cacheControl: '3600',
          contentType: photo.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('上传艺人照片失败', uploadError);
        return NextResponse.json(
          { ok: false, error: `照片上传失败：${uploadError.message}` },
          { status: 500 },
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from(ARTIST_BUCKET)
        .getPublicUrl(uploadData.path);
      photoUrl = publicUrlData?.publicUrl ?? '';
    }

    const payload: Partial<ArtistRow> = {
      slug: newSlug,
      name,
      photo_url: photoUrl || current.photo_url || null,
      meta_pixel_id: metaPixelId || null,
      facebook_access_token: facebookAccessToken || null,
    };

    const { data, error } = await supabase
      .from('artists')
      .update(payload)
      .eq('slug', params.slug)
      .select()
      .single();

    if (error) {
      console.error('更新艺人失败', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('更新艺人异常', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? '未知错误' },
      { status: 500 },
    );
  }
}
