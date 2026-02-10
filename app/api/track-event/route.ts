import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { pixelConfig } from '@/lib/config';

// Cloudflare Pages 需 Edge Runtime，确保本路由在 Edge 环境下运行。
export const runtime = 'edge';

// CAPI 服务器端事件上报
export async function POST(request: Request) {
  const {
    eventName = 'SmartLinkClick',
    eventId,
    testEventCode,
    metaPixelId,
    facebookAccessToken,
    eventSourceUrl,
  } = (await request.json().catch(() => ({}))) as {
    eventName?: string;
    eventId?: string;
    testEventCode?: string;
    metaPixelId?: string;
    facebookAccessToken?: string;
    eventSourceUrl?: string;
  };

  const headerList = headers();
  const userAgent = headerList.get('user-agent') ?? '';
  const forwardedFor = headerList.get('x-forwarded-for');
  const cookie = headerList.get('cookie') ?? '';
  const fbp = cookie.match(/_fbp=([^;]+)/)?.[1];
  const referer = headerList.get('referer') ?? '';

  const extractFbclid = (value?: string | null) => {
    if (!value) return null;
    try {
      return new URL(value).searchParams.get('fbclid');
    } catch {
      try {
        return new URL(value, 'https://fallback.local').searchParams.get('fbclid');
      } catch {
        return null;
      }
    }
  };

  const cookieFbc = cookie.match(/_fbc=([^;]+)/)?.[1];
  const cookieFbclid = cookie.match(/fbclid=([^;]+)/)?.[1];
  const queryFbclid =
    extractFbclid(eventSourceUrl) ?? extractFbclid(referer) ?? null;
  const fbclid = cookieFbclid || queryFbclid;
  const fbc =
    cookieFbc ??
    (fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}` : undefined);
  const ip =
    forwardedFor?.split(',')[0]?.trim() ??
    headerList.get('x-real-ip') ??
    '0.0.0.0';

  if (!eventName) {
    return NextResponse.json(
      { ok: false, error: '缺少事件名称' },
      { status: 400 },
    );
  }

  const activePixelId = metaPixelId || pixelConfig.metaPixelId;
  const activeAccessToken = facebookAccessToken || pixelConfig.facebookAccessToken || process.env.FB_ACCESS_TOKEN;

  if (!activePixelId) {
    console.warn('未配置 Pixel ID，跳过 CAPI 上报');
    return NextResponse.json({ ok: true, skipped: 'missing pixel id' });
  }
  if (!activeAccessToken) {
    console.warn('未配置 FB_ACCESS_TOKEN，跳过 CAPI 上报');
    return NextResponse.json({ ok: true, skipped: 'missing token' });
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: eventSourceUrl || referer || '',
        event_id: eventId,
        user_data: {
          client_user_agent: userAgent,
          client_ip_address: ip,
          fbp,
          fbc,
          external_id: eventId,
        },
      },
    ],
    test_event_code: testEventCode,
  };

  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/v18.0/${activePixelId}/events?access_token=${activeAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!fbRes.ok) {
      const detail = await fbRes.text();
      console.error('CAPI 请求失败:', detail);
      return NextResponse.json(
        { ok: false, error: 'CAPI 请求失败', detail },
        { status: fbRes.status },
      );
    }

    const result = await fbRes.json();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error('CAPI 请求异常:', error);
    return NextResponse.json(
      { ok: false, error: 'CAPI 请求异常' },
      { status: 500 },
    );
  }
}
