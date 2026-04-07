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
  /** 价值优化（VBO）：额外发送的标准事件 ID */
  vboEventId?: string;
  /** 价值优化（VBO）：标准事件名称，如 ViewContent / InitiateCheckout / Lead */
  vboEventName?: string;
  /** 价值优化（VBO）：事件价值 */
  vboValue?: number;
};

type RetryPromptState = {
  deepLinkTarget: string;
  openTarget: string;
  context: Record<string, unknown>;
  route: Record<string, unknown>;
  hint: string;
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

  const isAndroidInstagram =
    context.os === 'android' && context.inAppBrowser === 'instagram';
  const isAndroidFacebook =
    context.os === 'android' && context.inAppBrowser === 'facebook';
  const isAndroid = context.os === 'android';
  const isIOSFacebook = context.os === 'ios' && context.inAppBrowser === 'facebook';
  const isFacebookInApp = context.inAppBrowser === 'facebook';

  const baseDeepLinkDelay =
    isAndroid || isIOSFacebook
      ? 0
      : context.os === 'ios'
        ? 180
        : 120;
  const baseFallbackDelay =
    isAndroidInstagram || isAndroidFacebook
      ? 3800
      : isAndroid
        ? 1500
      : isIOSFacebook
        ? 2400
        : context.os === 'ios'
          ? 1200
          : 900;
  const inAppExtra =
    isAndroidInstagram || isAndroidFacebook
      ? 0
      : context.inAppBrowser === 'facebook'
        ? 900
        : context.inAppBrowser === 'none'
          ? 0
          : 420;

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
    isAndroidInstagram || isAndroidFacebook
      ? Math.max(fallbackDelayMs + 3600, 7600)
      : isAndroid
        ? Math.max(fallbackDelayMs + 1800, 3200)
      : isFacebookInApp
        ? Math.max(fallbackDelayMs + 2200, 5600)
      : Math.max(fallbackDelayMs + 1200, 2200),
  );

  return {
    strategy: 'deep-link-first',
    deepLinkDelayMs,
    fallbackDelayMs,
    successSignalWindowMs,
    reason: context.inAppBrowser === 'none' ? 'mobile-browser' : `in-app-${context.inAppBrowser}`,
  };
}

function buildAndroidSpotifyIntentUrl(deepLink: string, webLink: string) {
  const trimmed = deepLink.trim();
  if (!trimmed) return deepLink;
  const basePath = trimmed.startsWith('spotify://')
    ? trimmed.slice('spotify://'.length)
    : trimmed.startsWith('spotify:')
      ? trimmed.slice('spotify:'.length).replace(/:/g, '/')
      : '';
  if (!basePath) return deepLink;
  const fallbackUrl = encodeURIComponent(webLink.trim());
  return `intent://${basePath}#Intent;scheme=spotify;package=com.spotify.music;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${fallbackUrl};end`;
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
  const [retryPrompt, setRetryPrompt] = useState<RetryPromptState | null>(null);
  const [openInBrowserUrl, setOpenInBrowserUrl] = useState<string | null>(null);
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
        'linear-gradient(180deg, rgba(11, 17, 26, 0.14) 0%, rgba(0, 0, 0, 0.48) 58%, rgba(0, 0, 0, 0.84) 100%)',
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
      eventSourceUrl: window.location.href,
      trackingAuthToken: releaseData.trackingAuthToken || '',
      attribution: {
        ...attribution,
        ...(options.extraAttribution || {}),
      },
      context: routeContext,
      route: routePayload,
      identity,
      forwardToFacebook: options.forwardToFacebook ?? true,
      ...(options.vboEventName ? {
        vbo: {
          eventId: options.vboEventId,
          eventName: options.vboEventName,
          value: options.vboValue,
          currency: 'USD',
        },
      } : {}),
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
  }, [attribution, releaseData.trackingAuthToken, testEventCode]);

  useEffect(() => {
    setMounted(true);
    const ctx = detectRoutingContext(navigator.userAgent || '');
    if (ctx.os === 'android' && ctx.inAppBrowser === 'facebook') {
      const loc = window.location;
      setOpenInBrowserUrl(
        `intent://${loc.host}${loc.pathname}${loc.search}#Intent;scheme=https;action=android.intent.action.VIEW;end`
      );
    }
  }, []);

  const handleRetryOpen = useCallback(() => {
    if (!retryPrompt) return;

    dispatchTrackEvent('SmartLinkOpenAttempt', {
      context: retryPrompt.context,
      route: {
        ...retryPrompt.route,
        open_target: retryPrompt.openTarget,
        retry_attempt: true,
      },
      forwardToFacebook: false,
      usePixel: false,
    });

    setRetryPrompt(null);
    window.location.assign(retryPrompt.deepLinkTarget);
  }, [dispatchTrackEvent, retryPrompt]);

  // 单次发送 PageView 和 SmartLinkView
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).__pageview_sent) return;
    (window as any).__pageview_sent = true;

    window.fbq?.('track', 'PageView', undefined, { eventID: viewEventId });

    // 标准事件：ViewContent（带价值分数，用于广告价值优化）
    const viewVboId = buildEventId('vbo-view');
    window.fbq?.('track', 'ViewContent', { value: 0.5, currency: 'USD', content_name: 'SmartLinkView' }, { eventID: viewVboId });

    dispatchTrackEvent('SmartLinkView', {
      eventId: viewEventId,
      context: toEventContext(detectRoutingContext(navigator.userAgent || '')),
      route: { strategy: 'view', reason: 'page-load' },
      forwardToFacebook: true,
      usePixel: true,
      vboEventId: viewVboId,
      vboEventName: 'ViewContent',
      vboValue: 0.5,
    });
  }, [dispatchTrackEvent, viewEventId]);

  const handlePlay = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (openingRef.current) return;
    openingRef.current = true;
    setRetryPrompt(null);

    const routingContext = detectRoutingContext(navigator.userAgent || '');
    const routingPlan = buildRoutingPlan(releaseData, routingContext);
    const useAndroidInAppIntent =
      routingContext.os === 'android'
      && (routingContext.inAppBrowser === 'instagram' || routingContext.inAppBrowser === 'facebook');
    const shouldPreserveUserGesture = routingContext.inAppBrowser === 'facebook';
    const deepLinkTarget = useAndroidInAppIntent
      ? buildAndroidSpotifyIntentUrl(releaseData.spotifyDeepLink, releaseData.spotifyWebLink)
      : releaseData.spotifyDeepLink;
    const openTarget = useAndroidInAppIntent ? 'spotify_intent' : 'spotify_app';
    const deepLinkInvocation =
      shouldPreserveUserGesture || routingPlan.deepLinkDelayMs <= 0 ? 'sync' : 'timer';
    const sharedContext = toEventContext(routingContext);
    const sharedRoute = {
      strategy: routingPlan.strategy,
      deep_link_delay_ms: routingPlan.deepLinkDelayMs,
      fallback_delay_ms: routingPlan.fallbackDelayMs,
      success_signal_window_ms: routingPlan.successSignalWindowMs,
      deep_link_invocation: deepLinkInvocation,
      reason: routingPlan.reason,
    };
    const clickEventId = testEventCode || buildEventId('click');

    // 标准事件：InitiateCheckout（带价值分数，用于广告价值优化）
    const clickVboId = buildEventId('vbo-click');
    window.fbq?.('track', 'InitiateCheckout', { value: 1, currency: 'USD', content_name: 'SmartLinkClick' }, { eventID: clickVboId });

    dispatchTrackEvent('SmartLinkClick', {
      eventId: clickEventId,
      context: sharedContext,
      route: sharedRoute,
      forwardToFacebook: true,
      usePixel: true,
      vboEventId: clickVboId,
      vboEventName: 'InitiateCheckout',
      vboValue: 1,
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
    let blurSignalTimer = 0;
    let retryPromptTimer = 0;

    const cleanup = () => {
      openingRef.current = false;
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(deepLinkTimer);
      window.clearTimeout(safetyTimer);
      window.clearTimeout(blurSignalTimer);
      window.clearTimeout(retryPromptTimer);
      setRetryPrompt(null);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('blur', handleWindowBlur);
    };

    // 为 OpenSuccess 预生成 VBO 事件 ID（闭包内共享，确保只发一次）
    const openSuccessVboId = buildEventId('vbo-lead');

    const markOpenSuccess = (signal: 'visibilitychange' | 'pagehide' | 'blur') => {
      if (settled) return;
      settled = true;
      cleanup();

      // 标准事件：Lead（带价值分数，用于广告价值优化）
      window.fbq?.('track', 'Lead', { value: 5, currency: 'USD', content_name: 'SmartLinkOpenSuccess' }, { eventID: openSuccessVboId });

      dispatchTrackEvent('SmartLinkOpenSuccess', {
        context: sharedContext,
        route: { ...sharedRoute, open_target: openTarget, success_signal: signal },
        forwardToFacebook: true,
        usePixel: true,
        vboEventId: openSuccessVboId,
        vboEventName: 'Lead',
        vboValue: 5,
      });

      if (shouldEmitQualified(window.location.pathname, qualifiedCooldownMs)) {
        dispatchTrackEvent('SmartLinkQualified', {
          context: sharedContext,
          route: { ...sharedRoute, audience_tier: 'high_intent', success_signal: signal },
          forwardToFacebook: true,
          usePixel: true,
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      markOpenSuccess('visibilitychange');
    };

    const handlePageHide = () => {
      markOpenSuccess('pagehide');
    };

    const shouldUseBlurSignal =
      useAndroidInAppIntent || routingContext.inAppBrowser === 'facebook';
    const handleWindowBlur = () => {
      if (!shouldUseBlurSignal) return;
      blurSignalTimer = window.setTimeout(() => {
        if (settled) return;
        if (document.visibilityState === 'hidden' || !document.hasFocus()) {
          markOpenSuccess('blur');
        }
      }, 160);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('blur', handleWindowBlur);

    const attemptDeepLinkOpen = () => {
      dispatchTrackEvent('SmartLinkOpenAttempt', {
        context: sharedContext,
        route: { ...sharedRoute, open_target: openTarget },
        forwardToFacebook: false,
        usePixel: false,
      });
      window.location.assign(deepLinkTarget);
    };

    if (deepLinkInvocation === 'sync') {
      attemptDeepLinkOpen();
    } else {
      deepLinkTimer = window.setTimeout(attemptDeepLinkOpen, routingPlan.deepLinkDelayMs);
    }

    const shouldSurfaceRetryPrompt =
      routingContext.os === 'android' || routingContext.inAppBrowser === 'facebook';
    if (shouldSurfaceRetryPrompt) {
      retryPromptTimer = window.setTimeout(() => {
        if (settled) return;
        if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
        setRetryPrompt({
          deepLinkTarget,
          openTarget,
          context: sharedContext,
          route: sharedRoute,
          hint:
            routingContext.inAppBrowser === 'facebook'
              ? 'If Spotify did not open, Facebook may need a second tap.'
              : 'If Spotify did not open, tap again to retry.',
        });
      }, 900);
    }

    fallbackTimer = window.setTimeout(() => {
      if (settled) return;
      // Some in-app browsers keep the document visible state stale while losing focus.
      // Treat this as likely app handoff and avoid false fallback redirects.
      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        markOpenSuccess('blur');
        return;
      }
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
    setRetryPrompt,
    testEventCode,
  ]);

  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-start gap-6 px-5 pt-6 pb-32">
      {/* Pixel 初始化（优先使用每页配置，其次环境变量） */}
      <PixelBase pixelId={pixelId} />
      {/* 背景：轻量模糊封面 + 暗色渐变 */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'var(--bg-base)' }}
        />
        <Image
          src={releaseData.coverImage}
          alt=""
          fill
          quality={28}
          sizes="100vw"
          aria-hidden="true"
          className="object-cover scale-110 blur-2xl md:blur-3xl brightness-[0.72] md:brightness-[0.44] saturate-125 contrast-[1.08]"
        />
        <div
          className="absolute inset-0 opacity-[0.86] md:opacity-100"
          style={glowStyle}
        />
        <div className="absolute inset-0 opacity-[0.56] md:opacity-100" style={fadeStyle} />
        <div
          className="absolute inset-0 opacity-[0.05] md:opacity-[0.08] mix-blend-soft-light"
          style={grainStyle}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.2),transparent_52%)] opacity-60 md:opacity-35" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 mb-4">
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
            sizes="(max-width: 768px) 76vw, 380px"
            quality={82}
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
        } z-20`}
        style={{ transitionDelay: mounted ? '140ms' : '0ms' }}
      >
        <Image
          src="/spotify-logo.png"
          alt="Spotify"
          width={120}
          height={36}
          className="h-7 w-auto"
        />
        <button
          onClick={handlePlay}
          className="cta-ripple relative w-full rounded-2xl bg-[#1DB954] px-4 py-3 text-lg font-bold text-white shadow-[0_10px_24px_rgba(29,185,84,0.35)] transition transform-gpu active:scale-95 active:shadow-[inset_0_4px_12px_rgba(0,0,0,0.25)] active:brightness-95 touch-action-manipulation"
          style={{ touchAction: 'manipulation' }}
        >
          Play
        </button>
        {openInBrowserUrl ? (
          <a
            href={openInBrowserUrl}
            className="mt-1 text-xs font-medium text-black/45 underline underline-offset-2 transition active:text-black/70"
          >
            Open in browser instead
          </a>
        ) : null}
        {retryPrompt ? (
          <div className="w-full rounded-2xl border border-black/10 bg-black/[0.04] px-3 py-3 text-center">
            <p className="text-xs font-medium text-black/65">
              {retryPrompt.hint}
            </p>
            <button
              onClick={handleRetryOpen}
              className="mt-2 w-full rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white transition active:scale-[0.98]"
            >
              Open Spotify Again
            </button>
          </div>
        ) : null}
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
