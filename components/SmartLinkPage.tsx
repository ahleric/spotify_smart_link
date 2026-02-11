'use client';

import Image from 'next/image';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useSearchParams,
  type ReadonlyURLSearchParams,
} from 'next/navigation';
import PixelBase from '@/components/PixelBase';
import { pixelConfig, type ReleaseData } from '@/lib/config';

type SmartLinkPageProps = {
  releaseData: ReleaseData;
};

type RoutingOs = 'ios' | 'android' | 'desktop' | 'unknown';
type InAppBrowser = 'instagram' | 'facebook' | 'tiktok' | 'other' | 'none';
type RoutingStrategy = 'deep-link-first' | 'web-only';

type RoutingContext = {
  os: RoutingOs;
  inAppBrowser: InAppBrowser;
  isMobile: boolean;
};

type RoutingPlan = {
  strategy: RoutingStrategy;
  deepLinkDelayMs: number;
  fallbackDelayMs: number;
  successSignalWindowMs: number;
  reason: string;
};

type DispatchTrackOptions = {
  eventId?: string;
  forwardToFacebook?: boolean;
  usePixel?: boolean;
  pixelPayload?: Record<string, unknown>;
  context?: Record<string, unknown>;
  route?: Record<string, unknown>;
  extraAttribution?: Record<string, string>;
};

const ATTR_PARAM_KEYS = [
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

const MAX_DELAY_MS = 10000;

function collectAttribution(searchParams: URLSearchParams | ReadonlyURLSearchParams) {
  const result: Record<string, string> = {};
  for (const key of ATTR_PARAM_KEYS) {
    const value = searchParams.get(key)?.trim();
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

function clampMs(
  value: unknown,
  minValue: number,
  maxValue: number,
  fallback: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maxValue, Math.max(minValue, Math.round(parsed)));
}

function createClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function readOrCreateStorageId(
  storage: Storage,
  key: string,
  prefix: string,
) {
  try {
    const existing = storage.getItem(key)?.trim();
    if (existing) return existing;
    const next = createClientId(prefix);
    storage.setItem(key, next);
    return next;
  } catch {
    return createClientId(prefix);
  }
}

function resolveIdentity() {
  if (typeof window === 'undefined') {
    return { anonymousId: undefined, sessionId: undefined };
  }

  const anonymousId = readOrCreateStorageId(
    window.localStorage,
    'sl_anon_id',
    'anon',
  );
  const sessionId = readOrCreateStorageId(
    window.sessionStorage,
    'sl_session_id',
    'session',
  );

  return { anonymousId, sessionId };
}

function detectRoutingContext(userAgent: string): RoutingContext {
  const ua = userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isMobile = isIOS || isAndroid;
  const inAppBrowser: InAppBrowser = /instagram/.test(ua)
    ? 'instagram'
    : /fban|fbav|facebook/.test(ua)
      ? 'facebook'
      : /tiktok/.test(ua)
        ? 'tiktok'
        : /wv|line|micromessenger/.test(ua)
          ? 'other'
          : 'none';

  return {
    os: isIOS ? 'ios' : isAndroid ? 'android' : isMobile ? 'unknown' : 'desktop',
    inAppBrowser,
    isMobile,
  };
}

function toEventContext(context: RoutingContext) {
  return {
    os: context.os,
    is_mobile: context.isMobile,
    in_app_browser: context.inAppBrowser,
  };
}

function buildRoutingPlan(
  releaseData: ReleaseData,
  context: RoutingContext,
): RoutingPlan {
  const routingConfig = releaseData.routingConfig || {};
  const preferWebOnDesktop = routingConfig.preferWebOnDesktop ?? true;
  const hasDeepLink = Boolean(releaseData.spotifyDeepLink?.trim());

  if (!hasDeepLink) {
    return {
      strategy: 'web-only',
      deepLinkDelayMs: 0,
      fallbackDelayMs: 0,
      successSignalWindowMs: 0,
      reason: 'missing-deep-link',
    };
  }

  if (!context.isMobile && preferWebOnDesktop) {
    return {
      strategy: 'web-only',
      deepLinkDelayMs: 0,
      fallbackDelayMs: 0,
      successSignalWindowMs: 0,
      reason: 'desktop-prefer-web',
    };
  }

  const baseDeepLinkDelay = context.os === 'ios' ? 180 : 120;
  const baseFallbackDelay = context.os === 'ios' ? 1200 : 900;
  const inAppExtra = context.inAppBrowser === 'none' ? 0 : 420;

  const deepLinkDelayMs = clampMs(
    routingConfig.deepLinkDelayMs,
    0,
    MAX_DELAY_MS,
    baseDeepLinkDelay,
  );
  const fallbackDelayMs = clampMs(
    routingConfig.fallbackDelayMs,
    300,
    MAX_DELAY_MS,
    baseFallbackDelay + clampMs(routingConfig.inAppFallbackExtraMs, 0, 3000, inAppExtra),
  );
  const successSignalWindowMs = clampMs(
    routingConfig.successSignalWindowMs,
    fallbackDelayMs + 200,
    MAX_DELAY_MS,
    Math.max(fallbackDelayMs + 1200, 2200),
  );

  return {
    strategy: 'deep-link-first',
    deepLinkDelayMs,
    fallbackDelayMs,
    successSignalWindowMs,
    reason: context.inAppBrowser === 'none' ? 'mobile-browser' : `in-app-${context.inAppBrowser}`,
  };
}

function shouldEmitQualified(pathname: string, cooldownMs: number) {
  if (typeof window === 'undefined') return true;
  const key = `sl-qualified:${pathname}`;
  const now = Date.now();
  try {
    const previousRaw = window.localStorage.getItem(key);
    const previous = previousRaw ? Number(previousRaw) : 0;
    if (Number.isFinite(previous) && previous > 0 && now - previous < cooldownMs) {
      return false;
    }
    window.localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}

function buildEventId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function PageContent({ releaseData }: SmartLinkPageProps) {
  const searchParams = useSearchParams();
  const pixelId = releaseData.metaPixelId || pixelConfig.metaPixelId;
  const facebookAccessToken =
    releaseData.facebookAccessToken || pixelConfig.facebookAccessToken;
  const testEventCode = useMemo(
    () =>
      searchParams.get('test_event_code')?.trim() ||
      searchParams.get('test_event')?.trim() ||
      '',
    [searchParams],
  );
  const attribution = useMemo(
    () => collectAttribution(searchParams),
    [searchParams],
  );
  const viewEventId = useMemo(
    () => buildEventId('view'),
    [],
  );
  const [mounted, setMounted] = useState(false);
  const openingRef = useRef(false);
  const qualifiedCooldownMs = useMemo(
    () => clampMs(releaseData.trackingConfig?.qualifiedCooldownMs, 60000, 604800000, 21600000),
    [releaseData.trackingConfig?.qualifiedCooldownMs],
  );
  const glowStyle = useMemo(
    () => ({
      backgroundImage:
        'radial-gradient(circle at 18% 12%, rgba(var(--glow-sky), 0.26), transparent 38%),' +
        'radial-gradient(circle at 82% 6%, rgba(var(--glow-amber), 0.18), transparent 34%),' +
        'radial-gradient(circle at 72% 82%, rgba(var(--glow-rose), 0.18), transparent 38%)',
    }),
    [],
  );
  const grainStyle = useMemo(
    () => ({
      backgroundImage:
        'radial-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1px)',
      backgroundSize: '3px 3px',
    }),
    [],
  );
  const fadeStyle = useMemo(
    () => ({
      backgroundImage:
        'linear-gradient(180deg, rgba(11, 17, 26, 0.32) 0%, rgba(0, 0, 0, 0.72) 55%, rgba(0, 0, 0, 1) 100%)',
    }),
    [],
  );

  const dispatchTrackEvent = useCallback((
    eventName: string,
    options: DispatchTrackOptions = {},
  ) => {
    if (typeof window === 'undefined') return;

    const eventId = options.eventId || buildEventId(eventName.toLowerCase());
    const routeContext = options.context || {};
    const routePayload = options.route || {};
    const payloadForPixel = {
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
      ...(options.pixelPayload || {}),
    };

    if (options.usePixel !== false) {
      window.fbq?.('trackCustom', eventName, payloadForPixel, { eventID: eventId });
    }

    const identity = resolveIdentity();
    const body = JSON.stringify({
      eventName,
      eventId,
      testEventCode,
      metaPixelId: pixelId,
      facebookAccessToken,
      eventSourceUrl: window.location.href,
      attribution: {
        ...attribution,
        ...(options.extraAttribution || {}),
      },
      context: routeContext,
      route: routePayload,
      identity,
      forwardToFacebook: options.forwardToFacebook ?? true,
    });

    const sent =
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/track-event', body);

    if (!sent) {
      fetch('/api/track-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  }, [attribution, facebookAccessToken, pixelId, testEventCode]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 单次发送 PageView 和 SmartLinkView
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).__pageview_sent) return;
    (window as any).__pageview_sent = true;

    window.fbq?.('track', 'PageView', undefined, { eventID: viewEventId });

    dispatchTrackEvent('SmartLinkView', {
      eventId: viewEventId,
      context: toEventContext(detectRoutingContext(navigator.userAgent || '')),
      route: { strategy: 'view', reason: 'page-load' },
      forwardToFacebook: true,
      usePixel: true,
    });
  }, [dispatchTrackEvent, viewEventId]);

  const handlePlay = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (openingRef.current) return;
    openingRef.current = true;

    const routingContext = detectRoutingContext(navigator.userAgent || '');
    const routingPlan = buildRoutingPlan(releaseData, routingContext);
    const sharedContext = toEventContext(routingContext);
    const sharedRoute = {
      strategy: routingPlan.strategy,
      deep_link_delay_ms: routingPlan.deepLinkDelayMs,
      fallback_delay_ms: routingPlan.fallbackDelayMs,
      success_signal_window_ms: routingPlan.successSignalWindowMs,
      reason: routingPlan.reason,
    };
    const clickEventId = testEventCode || buildEventId('click');

    dispatchTrackEvent('SmartLinkClick', {
      eventId: clickEventId,
      context: sharedContext,
      route: sharedRoute,
      forwardToFacebook: true,
      usePixel: true,
    });

    dispatchTrackEvent('SmartLinkRouteChosen', {
      context: sharedContext,
      route: sharedRoute,
      forwardToFacebook: false,
      usePixel: false,
    });

    if (routingPlan.strategy === 'web-only') {
      dispatchTrackEvent('SmartLinkOpenFallback', {
        context: sharedContext,
        route: { ...sharedRoute, fallback_target: 'spotify_web' },
        forwardToFacebook: false,
        usePixel: false,
      });
      openingRef.current = false;
      window.location.href = releaseData.spotifyWebLink;
      return;
    }

    let settled = false;
    let fallbackTimer = 0;
    let deepLinkTimer = 0;
    let safetyTimer = 0;

    const cleanup = () => {
      openingRef.current = false;
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(deepLinkTimer);
      window.clearTimeout(safetyTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      if (settled) return;
      settled = true;
      cleanup();

      dispatchTrackEvent('SmartLinkOpenSuccess', {
        context: sharedContext,
        route: { ...sharedRoute, open_target: 'spotify_app' },
        forwardToFacebook: true,
        usePixel: true,
      });

      if (shouldEmitQualified(window.location.pathname, qualifiedCooldownMs)) {
        dispatchTrackEvent('SmartLinkQualified', {
          context: sharedContext,
          route: { ...sharedRoute, audience_tier: 'high_intent' },
          forwardToFacebook: true,
          usePixel: true,
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    deepLinkTimer = window.setTimeout(() => {
      dispatchTrackEvent('SmartLinkOpenAttempt', {
        context: sharedContext,
        route: { ...sharedRoute, open_target: 'spotify_app' },
        forwardToFacebook: false,
        usePixel: false,
      });
      window.location.href = releaseData.spotifyDeepLink;
    }, routingPlan.deepLinkDelayMs);

    fallbackTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      dispatchTrackEvent('SmartLinkOpenFallback', {
        context: sharedContext,
        route: { ...sharedRoute, fallback_target: 'spotify_web' },
        forwardToFacebook: false,
        usePixel: false,
      });
      window.location.href = releaseData.spotifyWebLink;
    }, routingPlan.fallbackDelayMs);

    safetyTimer = window.setTimeout(() => {
      if (settled) return;
      cleanup();
    }, routingPlan.successSignalWindowMs);
  }, [
    dispatchTrackEvent,
    qualifiedCooldownMs,
    releaseData,
    testEventCode,
  ]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-start gap-6 px-5 pt-6 pb-32">
      {/* Pixel 初始化（优先使用每页配置，其次环境变量） */}
      <PixelBase pixelId={pixelId} />
      {/* 背景：轻量模糊封面 + 暗色渐变 */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'var(--bg-base)' }}
        />
        <Image
          src={releaseData.coverImage}
          alt="background"
          fill
          priority
          sizes="100vw"
          className="object-cover blur-3xl brightness-[0.38] saturate-125 contrast-[1.08]"
        />
        <div
          className="absolute inset-0 opacity-100"
          style={glowStyle}
        />
        <div className="absolute inset-0" style={fadeStyle} />
        <div
          className="absolute inset-0 opacity-[0.08] mix-blend-soft-light"
          style={grainStyle}
        />
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-5 mb-4">
        <div
          className={`relative w-full max-w-sm overflow-hidden rounded-[24px] shadow-[0_16px_36px_rgba(0,0,0,0.35)] transform-gpu transition duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: mounted ? '0ms' : '0ms' }}
        >
          <Image
            src={releaseData.coverImage}
            alt={`${releaseData.trackTitle} Artwork`}
            width={900}
            height={900}
            sizes="(max-width: 768px) 78vw, 420px"
            className="h-auto w-full object-cover"
            priority
            loading="eager"
          />
        </div>

        <div
          className={`text-center transform-gpu transition duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: mounted ? '80ms' : '0ms' }}
        >
          <h1 className="text-3xl font-extrabold uppercase tracking-tight text-white">
            {releaseData.trackTitle}
          </h1>
          <p className="mt-2 text-xl font-normal text-white/85">
            {releaseData.artistName}
          </p>
        </div>
      </div>

      <div
        className={`fixed bottom-6 left-4 right-4 mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl bg-white px-5 py-4 shadow-[0_12px_32px_rgba(0,0,0,0.25)] transform-gpu transition duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        style={{ transitionDelay: mounted ? '140ms' : '0ms' }}
      >
        <Image
          src="/spotify-logo.png"
          alt="Spotify"
          width={120}
          height={36}
          className="h-7 w-auto"
          priority
        />
        <button
          onClick={handlePlay}
          className="cta-ripple relative w-full rounded-2xl bg-[#1DB954] px-4 py-3 text-lg font-bold text-white shadow-[0_10px_24px_rgba(29,185,84,0.35)] transition transform-gpu active:scale-95 active:shadow-[inset_0_4px_12px_rgba(0,0,0,0.25)] active:brightness-95"
        >
          Play
        </button>
      </div>
    </main>
  );
}

export default function SmartLinkPage({ releaseData }: SmartLinkPageProps) {
  return (
    <Suspense fallback={null}>
      <PageContent releaseData={releaseData} />
    </Suspense>
  );
}
