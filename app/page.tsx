'use client';

import Image from 'next/image';
import { useCallback } from 'react';
import { releaseData } from '@/lib/config';

export default function Home() {
  const handlePlay = useCallback(() => {
    if (typeof window === 'undefined') return;

    // 前端快速触发 Pixel 事件
    window.fbq?.('track', 'Lead');

    // CAPI 异步上报，不阻塞跳转
    try {
      fetch('/api/track-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName: 'Lead' }),
      }).catch(() => undefined);
    } catch {
      // 静默兜底，避免影响跳转
    }

    const timer = window.setTimeout(() => {
      window.location.href = releaseData.spotifyWebLink;
    }, 500);

    const clear = () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', clear);
    };

    document.addEventListener('visibilitychange', clear);
    window.location.href = releaseData.spotifyDeepLink;
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 px-5 py-10">
      {/* 背景：轻量模糊封面 + 暗色渐变 */}
      <div className="absolute inset-0 -z-10">
        <Image
          src={releaseData.coverImage}
          alt="background"
          fill
          priority
          sizes="100vw"
          className="object-cover blur-3xl brightness-[0.35]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black" />
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="relative w-full overflow-hidden rounded-[28px] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          <Image
            src={releaseData.coverImage}
            alt={`${releaseData.trackTitle} Artwork`}
            width={900}
            height={900}
            sizes="(max-width: 768px) 90vw, 420px"
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
