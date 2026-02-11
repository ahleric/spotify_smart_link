'use client';

import Image from 'next/image';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  useSearchParams,
  type ReadonlyURLSearchParams,
} from 'next/navigation';
import PixelBase from '@/components/PixelBase';
import { pixelConfig, type ReleaseData } from '@/lib/config';

type SmartLinkPageProps = {
  releaseData: ReleaseData;
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
  const eventId = useMemo(
    () => testEventCode || `click-${Date.now()}`,
    [testEventCode],
  );
  const viewEventId = useMemo(
    () => `view-${Date.now()}`,
    [],
  );
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => {
    setMounted(true);
  }, []);

  // 单次发送 PageView，可携带 test_event_code，避免重复
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).__pageview_sent) return;
    (window as any).__pageview_sent = true;
    const payload = testEventCode
      ? { test_event_code: testEventCode }
      : {};
    // 先触发标准 PageView，确保 _fbp 写入，提升匹配质量
    window.fbq?.('track', 'PageView', undefined, { eventID: viewEventId });
    // 客户端自定义浏览事件
    window.fbq?.(
      'trackCustom',
      'SmartLinkView',
      payload,
      { eventID: viewEventId },
    );
    // CAPI 上报浏览事件（非阻塞）
    const viewBody = JSON.stringify({
      eventName: 'SmartLinkView',
      eventId: viewEventId,
      testEventCode,
      metaPixelId: pixelId,
      facebookAccessToken,
      eventSourceUrl: typeof window !== 'undefined' ? window.location.href : '',
      attribution,
    });
    const sendView = () => {
      const ok =
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function' &&
        navigator.sendBeacon('/api/track-event', viewBody);
      if (!ok) {
        fetch('/api/track-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: viewBody,
          keepalive: true,
        }).catch(() => undefined);
      }
    };
    sendView();
  }, [attribution, facebookAccessToken, pixelId, testEventCode, viewEventId]);

  const handlePlay = useCallback(() => {
    if (typeof window === 'undefined') return;

    // 前端触发 Pixel（附带 eventID 和 test_event_code 便于 Test Events/去重）
    window.fbq?.(
      'trackCustom',
      'SmartLinkClick',
      testEventCode ? { test_event_code: testEventCode } : {},
      { eventID: eventId },
    );

    // 组装 CAPI 负载
    const payload = JSON.stringify({
      eventName: 'SmartLinkClick',
      eventId,
      testEventCode,
      metaPixelId: pixelId,
      facebookAccessToken,
      eventSourceUrl: typeof window !== 'undefined' ? window.location.href : '',
      attribution,
    });

    // 优先 sendBeacon，回落 fetch keepalive，避免跳转时丢包
    const sendCapi = () => {
      const ok =
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function' &&
        navigator.sendBeacon('/api/track-event', payload);
      if (!ok) {
        fetch('/api/track-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => undefined);
      }
    };

    sendCapi();

    // 给像素/Beacon 留一小段时间，再触发深链
    window.setTimeout(() => {
      window.location.href = releaseData.spotifyDeepLink;
    }, 200);

    // 兜底跳转 Web 链接，避免 App 未响应
    const timer = window.setTimeout(() => {
      window.location.href = releaseData.spotifyWebLink;
    }, 800);

    const clear = () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', clear);
    };

    document.addEventListener('visibilitychange', clear);
  }, [
    eventId,
    facebookAccessToken,
    pixelId,
    releaseData.spotifyDeepLink,
    releaseData.spotifyWebLink,
    testEventCode,
    attribution,
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
