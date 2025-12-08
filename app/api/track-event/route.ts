import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { releaseData } from '@/lib/config';

// Cloudflare Pages 需 Edge Runtime，确保本路由在 Edge 环境下运行。
export const runtime = 'edge';

// CAPI 服务器端事件上报
export async function POST(request: Request) {
  const {
    eventName = 'Lead',
    eventId,
    testEventCode,
  } = (await request.json().catch(() => ({}))) as {
    eventName?: string;
    eventId?: string;
    testEventCode?: string;
  };

  const headerList = headers();
  const userAgent = headerList.get('user-agent') ?? '';
  const forwardedFor = headerList.get('x-forwarded-for');
  const cookie = headerList.get('cookie') ?? '';
  const fbp = cookie.match(/_fbp=([^;]+)/)?.[1];
  const fbc =
    cookie.match(/_fbc=([^;]+)/)?.[1] ??
    cookie.match(/fbclid=([^;]+)/)?.[1];
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

  if (!releaseData.metaPixelId) {
    console.warn('未配置 Pixel ID，跳过 CAPI 上报');
    return NextResponse.json({ ok: true, skipped: 'missing pixel id' });
  }

  const accessToken = releaseData.facebookAccessToken || process.env.FB_ACCESS_TOKEN;

  if (!accessToken) {
    console.warn('未配置 FB_ACCESS_TOKEN，跳过 CAPI 上报');
    return NextResponse.json({ ok: true, skipped: 'missing token' });
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: headerList.get('referer') ?? '',
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
      `https://graph.facebook.com/v18.0/${releaseData.metaPixelId}/events?access_token=${accessToken}`,
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
