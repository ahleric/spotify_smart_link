'use client';

import { useEffect } from 'react';

type FbqFunction = (...args: any[]) => void;

type FbqInstance = FbqFunction & {
  callMethod?: FbqFunction;
  queue?: unknown[];
  push?: FbqFunction;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: FbqInstance;
  }
}

type PixelBaseProps = {
  pixelId?: string;
};

/**
 * Meta Pixel 初始化组件：轻量且仅初始化，不主动触发 PageView。
 */
export default function PixelBase({ pixelId }: PixelBaseProps) {
  useEffect(() => {
    if (!pixelId) return;
    if (typeof window === 'undefined') return;

    // 若已存在实例则仅追加初始化，避免重复插入脚本。
    if (window.fbq) {
      window.fbq('set', 'autoConfig', false, pixelId);
      window.fbq('init', pixelId, {}, { autoConfig: false });
      return;
    }

    // 原生 Meta Pixel 轻量化初始化。
    const fbqInstance: FbqInstance = (...args) => {
      window.fbq?.callMethod?.(...args) ?? window.fbq?.queue?.push(args);
    };

    window.fbq = fbqInstance;
    fbqInstance.queue = [];
    fbqInstance.loaded = true;
    fbqInstance.version = '2.0';
    fbqInstance.push = (...args: any[]) => fbqInstance(...args);

    const scriptId = 'facebook-pixel';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(script);
    }

    window.fbq('set', 'autoConfig', false, pixelId);
    window.fbq('init', pixelId, {}, { autoConfig: false });
  }, [pixelId]);

  return null;
}
