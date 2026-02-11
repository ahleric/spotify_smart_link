import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { pixelConfig } from '@/lib/config';
import { getSupabaseClient } from '@/lib/supabase';

// Cloudflare Pages 需 Edge Runtime，确保本路由在 Edge 环境下运行。
export const runtime = 'edge';

type TrackEventBody = {
  eventName?: string;
  eventId?: string;
  testEventCode?: string;
  metaPixelId?: string;
  facebookAccessToken?: string;
  eventSourceUrl?: string;
  attribution?: Record<string, unknown> | null;
};

type ForwardStatus =
  | 'queued'
  | 'ok'
  | 'error'
  | 'skipped_missing_pixel'
  | 'skipped_missing_token'
  | 'skipped_no_event_name';

const ATTR_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'campaign_id',
  'adset_id',
  'ad_id',
  'fbclid',
  'gclid',
  'ttclid',
  'msclkid',
] as const;

function safeParseUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(value, 'https://fallback.local');
    } catch {
      return null;
    }
  }
}

function extractFbclid(value?: string | null) {
  return safeParseUrl(value)?.searchParams.get('fbclid') ?? null;
}

function normalizeAttribution(
  raw: Record<string, unknown> | null | undefined,
) {
  const cleaned: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return cleaned;
  for (const [key, value] of Object.entries(raw)) {
    if (!key || value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    cleaned[key] = normalized.slice(0, 256);
  }
  return cleaned;
}

function buildAttribution(
  eventSourceUrl: string,
  referer: string,
  rawAttribution: Record<string, unknown> | null | undefined,
  fbclid: string | null,
) {
  const sourceUrl = safeParseUrl(eventSourceUrl);
  const refererUrl = safeParseUrl(referer);
  const queryAttribution: Record<string, string> = {};

  for (const key of ATTR_QUERY_KEYS) {
    const value =
      sourceUrl?.searchParams.get(key) ??
      refererUrl?.searchParams.get(key) ??
      null;
    if (value) {
      queryAttribution[key] = value.slice(0, 256);
    }
  }

  const manualAttribution = normalizeAttribution(rawAttribution);
  return {
    ...queryAttribution,
    ...manualAttribution,
    ...(fbclid ? { fbclid } : {}),
  };
}

function deriveRequestPath(eventSourceUrl: string, referer: string) {
  return (
    safeParseUrl(eventSourceUrl)?.pathname ||
    safeParseUrl(referer)?.pathname ||
    null
  );
}

// CAPI 服务器端事件上报
export async function POST(request: Request) {
  const {
    eventName = 'SmartLinkClick',
    eventId,
    testEventCode,
    metaPixelId,
    facebookAccessToken,
    eventSourceUrl,
    attribution,
  } = (await request.json().catch(() => ({}))) as TrackEventBody;

  const headerList = headers();
  const userAgent = headerList.get('user-agent') ?? '';
  const forwardedFor = headerList.get('x-forwarded-for');
  const cookie = headerList.get('cookie') ?? '';
  const fbp = cookie.match(/_fbp=([^;]+)/)?.[1];
  const referer = headerList.get('referer') ?? '';

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
  const normalizedEventSourceUrl = eventSourceUrl || '';
  const normalizedAttribution = buildAttribution(
    normalizedEventSourceUrl,
    referer,
    attribution,
    fbclid,
  );
  const requestPath = deriveRequestPath(normalizedEventSourceUrl, referer);
  const supabase = getSupabaseClient('service');
  let eventLogId: number | null = null;
  let forwardStatus: ForwardStatus = 'queued';
  let forwardError: string | null = null;

  const insertEventLog = async (status: ForwardStatus, error: string | null) => {
    try {
      const payload = {
        event_name: eventName || 'UNKNOWN',
        event_id: eventId || null,
        event_source_url: normalizedEventSourceUrl || null,
        referer: referer || null,
        request_path: requestPath,
        user_agent: userAgent || null,
        ip_address: ip || null,
        fbp: fbp || null,
        fbc: fbc || null,
        fbclid: fbclid || null,
        test_event_code: testEventCode || null,
        meta_pixel_id: metaPixelId || null,
        facebook_forward_status: status,
        facebook_forward_error: error,
        attribution: normalizedAttribution,
        payload: {
          eventName,
          eventId,
          testEventCode,
          metaPixelId,
          eventSourceUrl: normalizedEventSourceUrl,
        },
      };
      const { data, error: insertError } = await supabase
        .from('landing_page_events')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) {
        console.warn('事件写入本地仓失败（不中断）:', insertError.message);
        return;
      }
      eventLogId = data?.id ?? null;
    } catch (logError) {
      console.warn('事件写入本地仓异常（不中断）:', logError);
    }
  };

  const updateEventLog = async (status: ForwardStatus, error: string | null) => {
    if (!eventLogId) return;
    try {
      const { error: updateError } = await supabase
        .from('landing_page_events')
        .update({
          facebook_forward_status: status,
          facebook_forward_error: error,
        })
        .eq('id', eventLogId);
      if (updateError) {
        console.warn('事件状态回写失败（不中断）:', updateError.message);
      }
    } catch (updateErr) {
      console.warn('事件状态回写异常（不中断）:', updateErr);
    }
  };

  await insertEventLog(forwardStatus, null);

  if (!eventName) {
    forwardStatus = 'skipped_no_event_name';
    forwardError = 'missing event name';
    await updateEventLog(forwardStatus, forwardError);
    return NextResponse.json(
      { ok: false, error: '缺少事件名称' },
      { status: 400 },
    );
  }

  const activePixelId = metaPixelId || pixelConfig.metaPixelId;
  const activeAccessToken = facebookAccessToken || pixelConfig.facebookAccessToken || process.env.FB_ACCESS_TOKEN;

  if (!activePixelId) {
    forwardStatus = 'skipped_missing_pixel';
    await updateEventLog(forwardStatus, null);
    console.warn('未配置 Pixel ID，跳过 CAPI 上报');
    return NextResponse.json({
      ok: true,
      skipped: 'missing pixel id',
      eventLogId,
    });
  }
  if (!activeAccessToken) {
    forwardStatus = 'skipped_missing_token';
    await updateEventLog(forwardStatus, null);
    console.warn('未配置 FB_ACCESS_TOKEN，跳过 CAPI 上报');
    return NextResponse.json({
      ok: true,
      skipped: 'missing token',
      eventLogId,
    });
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: normalizedEventSourceUrl || referer || '',
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
      forwardStatus = 'error';
      forwardError = detail?.slice(0, 2000) || 'facebook api error';
      await updateEventLog(forwardStatus, forwardError);
      console.error('CAPI 请求失败:', detail);
      return NextResponse.json(
        { ok: false, error: 'CAPI 请求失败', detail, eventLogId },
        { status: fbRes.status },
      );
    }

    const result = await fbRes.json();
    forwardStatus = 'ok';
    await updateEventLog(forwardStatus, null);
    return NextResponse.json({ ok: true, result, eventLogId });
  } catch (error) {
    forwardStatus = 'error';
    forwardError = error instanceof Error ? error.message : 'CAPI request exception';
    await updateEventLog(forwardStatus, forwardError);
    console.error('CAPI 请求异常:', error);
    return NextResponse.json(
      { ok: false, error: 'CAPI 请求异常', eventLogId },
      { status: 500 },
    );
  }
}
