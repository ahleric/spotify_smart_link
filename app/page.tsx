'use client';

import Image from 'next/image';
import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { releaseData } from '@/lib/config';

function PageContent() {
  const searchParams = useSearchParams();
  const testEventCode = useMemo(
    () =>
      searchParams.get('test_event_code')?.trim() ||
      searchParams.get('test_event')?.trim() ||
      '',
    [searchParams],
  );
  const eventId = useMemo(
    () => testEventCode || `lead-${Date.now()}`,
    [testEventCode],
  );

  // 单次发送 PageView，可携带 test_event_code，避免重复
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).__pageview_sent) return;
    (window as any).__pageview_sent = true;
    const payload = testEventCode ? { test_event_code: testEventCode } : {};
    window.fbq?.('track', 'PageView', payload);
  }, [testEventCode]);

  const handlePlay = useCallback(() => {
    if (typeof window === 'undefined') return;

    // 前端触发 Pixel（附带 eventID 和 test_event_code 便于 Test Events/去重）
    window.fbq?.(
      'track',
      'Lead',
      testEventCode ? { test_event_code: testEventCode } : {},
      { eventID: eventId },
    );

    // 组装 CAPI 负载
    const payload = JSON.stringify({
      eventName: 'Lead',
      eventId,
      testEventCode,
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
  }, [eventId, testEventCode]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-start gap-6 px-5 pt-6 pb-32">
      {/* 背景：轻量模糊封面 + 暗色渐变 */}
      <div className="absolute inset-0 -z-10">
        <Image
          src={releaseData.coverImage}
          alt="background"
          fill
          priority
          sizes="100vw"
          className="object-cover blur-3xl brightness-[0.55] saturate-125"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/50 via-black/65 to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(52,211,153,0.25),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.2),transparent_30%)]" />
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-5 mb-4">
        <div className="relative w-full max-w-sm overflow-hidden rounded-[24px] shadow-[0_16px_36px_rgba(0,0,0,0.35)]">
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

        <div className="text-center">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-white">
            {releaseData.trackTitle}
          </h1>
          <p className="mt-2 text-lg text-white/85">{releaseData.artistName}</p>
        </div>
      </div>

      <div className="fixed bottom-6 left-4 right-4 mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl bg-white px-5 py-4 shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
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
          className="w-full rounded-2xl bg-[#1DB954] px-4 py-3 text-lg font-bold text-white shadow-[0_10px_24px_rgba(29,185,84,0.35)] transition active:scale-[0.99]"
        >
          Play
        </button>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <PageContent />
    </Suspense>
  );
}
