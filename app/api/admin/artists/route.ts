import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { buildArtistSlug, normalizeSlug } from '@/lib/song-utils';
import type { ArtistRow } from '@/lib/types';

export const runtime = 'edge';

const ARTIST_BUCKET = 'artists';

export async function GET() {
  try {
    const supabase = getSupabaseClient('service');
    const { data, error } = await supabase
      .from('artists')
      .select('id, slug, name, photo_url, meta_pixel_id, facebook_access_token, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('读取艺人列表失败', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('读取艺人列表异常', error);
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

    const name = (formData.get('name') ?? '').toString().trim();
    const slugInput = (formData.get('slug') ?? '').toString().trim();
    const metaPixelId = (formData.get('metaPixelId') ?? '').toString().trim();
    const facebookAccessToken = (formData.get('facebookAccessToken') ?? '').toString().trim();
    let photoUrl = (formData.get('photoUrl') ?? '').toString().trim();
    const photo = formData.get('photo') as File | null;

    const slug = normalizeSlug(slugInput || buildArtistSlug(name));

    if (!name || !slug) {
      return NextResponse.json(
        { ok: false, error: '请填写艺人名称（slug 留空将自动生成）' },
        { status: 400 },
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
      const filePath = `${slug || 'artist'}-${Date.now()}.${ext}`;
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

    const payload: Omit<ArtistRow, 'id'> = {
      slug,
      name,
      photo_url: photoUrl || null,
      meta_pixel_id: metaPixelId || null,
      facebook_access_token: facebookAccessToken || null,
    };

    const { data, error } = await supabase
      .from('artists')
      .upsert(payload, { onConflict: 'slug' })
      .select()
      .single();

    if (error) {
      console.error('写入艺人失败', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('创建艺人异常', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? '未知错误' },
      { status: 500 },
    );
  }
}
