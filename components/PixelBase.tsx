'use client';

import { useEffect } from 'react';

type FbqFunction = (...args: any[]) => void;

declare global {
  interface Window {
    fbq?: FbqFunction & {
      callMethod?: FbqFunction;
      queue?: unknown[];
      push?: FbqFunction;
      loaded?: boolean;
      version?: string;
    };
  }
}

type PixelBaseProps = {
  pixelId?: string;
};

/**
 * Meta Pixel 初始化组件：优先保证轻量与一次性装载。
 */
export default function PixelBase({ pixelId }: PixelBaseProps) {
  useEffect(() => {
    if (!pixelId) return;
    if (typeof window === 'undefined') return;

    // 若已存在实例则仅追加初始化，避免重复插入脚本。
    if (window.fbq) {
      window.fbq('init', pixelId);
      window.fbq('track', 'PageView');
      return;
    }

    // 原生 Meta Pixel 轻量化初始化。
    const fbq: FbqFunction = (...args) => {
      (window.fbq as any)?.callMethod?.(...args) ??
        (window.fbq as any)?.queue?.push(args);
    };

    window.fbq = fbq as typeof window.fbq;
    (window.fbq as any).queue = [];
    (window.fbq as any).loaded = true;
    (window.fbq as any).version = '2.0';
    (window.fbq as any).push = (...args: any[]) => fbq(...args);

    const scriptId = 'facebook-pixel';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(script);
    }

    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }, [pixelId]);

  if (!pixelId) return null;

  // noscript 像素用于兜底（不增加体积，保持可访问性）
  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: 'none' }}
        src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}
