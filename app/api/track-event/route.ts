import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { pixelConfig } from '@/lib/config';
import { getSupabaseClient } from '@/lib/supabase';
import { isTrackingSignatureEnabled, verifyTrackingAuthToken } from '@/lib/tracking-auth';

// Cloudflare Pages 需 Edge Runtime，确保本路由在 Edge 环境下运行。
export const runtime = 'edge';

type TrackEventBody = {
  eventName?: string;
  eventId?: string;
  testEventCode?: string;
  eventSourceUrl?: string;
  trackingAuthToken?: string;
  attribution?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  route?: Record<string, unknown> | null;
  identity?: {
    anonymousId?: string;
    sessionId?: string;
  } | null;
  forwardToFacebook?: boolean;
};

type ForwardStatus =
  | 'queued'
  | 'ok'
  | 'error'
  | 'skipped_missing_pixel'
  | 'skipped_missing_token'
  | 'skipped_no_event_name'
  | 'skipped_internal_only'
  | 'skipped_invalid_event'
  | 'skipped_invalid_signature';

type ResolvedTrackingConfig = {
  pixelId: string;
  accessToken: string;
  source: 'song' | 'artist' | 'env' | 'none';
};

const TRACKING_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const trackingConfigCache = new Map<string, {
  expiresAt: number;
  value: ResolvedTrackingConfig;
}>();

const ALLOWED_EVENT_NAMES = new Set([
  'SmartLinkView',
  'SmartLinkClick',
  'SmartLinkRouteChosen',
  'SmartLinkOpenAttempt',
  'SmartLinkOpenFallback',
  'SmartLinkOpenSuccess',
  'SmartLinkQualified',
]);

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

function normalizeEventName(value: unknown) {
  return String(value || '').trim().slice(0, 80);
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
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

function normalizePathSlug(pathname: string | null) {
  if (!pathname) return '';
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === '/') return '';
  return trimmed.replace(/^\/+|\/+$/g, '');
}

function getCachedTrackingConfig(cacheKey: string) {
  const cached = trackingConfigCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    trackingConfigCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedTrackingConfig(cacheKey: string, value: ResolvedTrackingConfig) {
  trackingConfigCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + TRACKING_CONFIG_CACHE_TTL_MS,
  });
}

function buildEnvFallbackConfig(): ResolvedTrackingConfig {
  const pixelId = pixelConfig.metaPixelId || '';
  const accessToken = pixelConfig.facebookAccessToken || process.env.FB_ACCESS_TOKEN || '';
  return {
    pixelId,
    accessToken,
    source: pixelId || accessToken ? 'env' : 'none',
  };
}

async function resolveTrackingConfigForPath(
  supabase: ReturnType<typeof getSupabaseClient>,
  requestPath: string | null,
): Promise<ResolvedTrackingConfig> {
  const fallbackConfig = buildEnvFallbackConfig();
  const slug = normalizePathSlug(requestPath);
  if (!slug) return fallbackConfig;

  const cached = getCachedTrackingConfig(slug);
  if (cached) return cached;

  try {
    const { data: songData } = await supabase
      .from('songs')
      .select('meta_pixel_id, facebook_access_token, artist:artists!inner(meta_pixel_id, facebook_access_token)')
      .eq('slug', slug)
      .maybeSingle();

    if (songData) {
      const artist = (songData as any).artist?.[0] ?? (songData as any).artist ?? {};
      const resolved: ResolvedTrackingConfig = {
        pixelId: (songData as any).meta_pixel_id || artist.meta_pixel_id || fallbackConfig.pixelId,
        accessToken: (songData as any).facebook_access_token || artist.facebook_access_token || fallbackConfig.accessToken,
        source: 'song',
      };
      setCachedTrackingConfig(slug, resolved);
      return resolved;
    }
  } catch (error) {
    console.warn('按歌曲路径解析 tracking config 失败（已回退）', error);
  }

  const artistSlug = slug.split('/')[0] || '';
  if (!artistSlug) return fallbackConfig;

  try {
    const { data: artistData } = await supabase
      .from('artists')
      .select('meta_pixel_id, facebook_access_token')
      .eq('slug', artistSlug)
      .maybeSingle();

    if (artistData) {
      const resolved: ResolvedTrackingConfig = {
        pixelId: (artistData as any).meta_pixel_id || fallbackConfig.pixelId,
        accessToken: (artistData as any).facebook_access_token || fallbackConfig.accessToken,
        source: 'artist',
      };
      setCachedTrackingConfig(slug, resolved);
      return resolved;
    }
  } catch (error) {
    console.warn('按艺人路径解析 tracking config 失败（已回退）', error);
  }

  return fallbackConfig;
}

async function sha256Hex(value: string) {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', input);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((item) => item.toString(16).padStart(2, '0')).join('');
}

// CAPI 服务器端事件上报
export async function POST(request: Request) {
  const rawBody = (await request.json().catch(() => ({}))) as TrackEventBody;
  const eventName = normalizeEventName(rawBody.eventName || 'SmartLinkClick');
  const eventId = normalizeText(rawBody.eventId, 120);
  const testEventCode = normalizeText(rawBody.testEventCode, 120);
  const eventSourceUrl = normalizeText(rawBody.eventSourceUrl, 4096);
  const trackingAuthToken = normalizeText(rawBody.trackingAuthToken, 4096);
  const attribution = rawBody.attribution;
  const context = rawBody.context;
  const route = rawBody.route;
  const identity = rawBody.identity;
  const forwardToFacebook = rawBody.forwardToFacebook ?? true;

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
  const anonymousId = normalizeText(identity?.anonymousId, 120);
  const sessionId = normalizeText(identity?.sessionId, 120);
  const externalIdSeed = anonymousId || eventId || '';
  const externalIdHash = externalIdSeed
    ? await sha256Hex(externalIdSeed.toLowerCase())
    : undefined;
  const supabase = getSupabaseClient('service');
  const signatureEnabled = isTrackingSignatureEnabled();
  const resolvedTrackingConfig = await resolveTrackingConfigForPath(supabase, requestPath);
  const activePixelId = resolvedTrackingConfig.pixelId;
  const activeAccessToken = resolvedTrackingConfig.accessToken;
  const signatureResult = await verifyTrackingAuthToken(
    trackingAuthToken,
    requestPath || '',
  );
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
        meta_pixel_id: activePixelId || null,
        facebook_forward_status: status,
        facebook_forward_error: error,
        attribution: normalizedAttribution,
        payload: {
          eventName,
          eventId,
          testEventCode,
          eventSourceUrl: normalizedEventSourceUrl,
          context: context || null,
          route: route || null,
          identity: {
            anonymousId: anonymousId || null,
            sessionId: sessionId || null,
          },
          trackingAuth: {
            enabled: signatureEnabled,
            verify: signatureResult.reason,
            source: resolvedTrackingConfig.source,
            hasToken: Boolean(trackingAuthToken),
          },
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
          meta_pixel_id: activePixelId || null,
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

  if (!eventName) {
    forwardStatus = 'skipped_no_event_name';
    forwardError = 'missing event name';
    await insertEventLog(forwardStatus, forwardError);
    return NextResponse.json(
      { ok: false, error: '缺少事件名称' },
      { status: 400 },
    );
  }

  if (!ALLOWED_EVENT_NAMES.has(eventName)) {
    forwardStatus = 'skipped_invalid_event';
    forwardError = 'event_not_allowed';
    await insertEventLog(forwardStatus, forwardError);
    return NextResponse.json(
      { ok: false, error: `不允许的事件: ${eventName}` },
      { status: 400 },
    );
  }

  if (signatureEnabled && !signatureResult.ok) {
    forwardStatus = 'skipped_invalid_signature';
    forwardError = signatureResult.reason;
    await insertEventLog(forwardStatus, forwardError);
    return NextResponse.json(
      { ok: false, error: '事件签名校验失败', detail: signatureResult.reason },
      { status: 401 },
    );
  }

  await insertEventLog(forwardStatus, null);

  if (!forwardToFacebook) {
    forwardStatus = 'skipped_internal_only';
    await updateEventLog(forwardStatus, null);
    return NextResponse.json({
      ok: true,
      skipped: 'internal only',
      eventLogId,
    });
  }

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
        event_id: eventId || undefined,
        user_data: {
          client_user_agent: userAgent,
          client_ip_address: ip,
          fbp,
          fbc,
          external_id: externalIdHash,
        },
      },
    ],
    test_event_code: testEventCode || undefined,
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

