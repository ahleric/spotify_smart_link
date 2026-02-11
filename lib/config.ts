export type RoutingConfig = {
  deepLinkDelayMs?: number;
  fallbackDelayMs?: number;
  inAppFallbackExtraMs?: number;
  successSignalWindowMs?: number;
  preferWebOnDesktop?: boolean;
};

export type TrackingConfig = {
  qualifiedCooldownMs?: number;
};

export type ReleaseData = {
  artistName: string;
  trackTitle: string;
  coverImage: string;
  spotifyDeepLink: string;
  spotifyWebLink: string;
  metaPixelId?: string;
  facebookAccessToken?: string;
  routingConfig?: RoutingConfig | null;
  trackingConfig?: TrackingConfig | null;
};

// 静态默认值（仅用于根路径示例页），真实页面数据来自 Supabase。
export const fallbackReleaseData: ReleaseData = {
  artistName: 'Mola Oddity',
  trackTitle: 'HALF A SADDAY SAVING TIME',
  coverImage: '/cover.jpg',
  spotifyDeepLink: 'spotify://track/0dOp6hAL0Vf6lYk9UU3Uhn',
  spotifyWebLink: 'https://open.spotify.com/track/0dOp6hAL0Vf6lYk9UU3Uhn?si=fc784f6962fc424a',
  metaPixelId: '',
  facebookAccessToken: '',
  routingConfig: null,
  trackingConfig: null,
};

// Pixel & CAPI 配置（从环境变量读取）。
export const pixelConfig = {
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '',
  facebookAccessToken: process.env.FB_ACCESS_TOKEN ?? '',
} as const;

// Supabase 连接参数（写操作将优先使用服务密钥）。
export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
} as const;

// 简易 Basic Auth 用于保护 /admin 与相关 API。
export const adminAuthConfig = {
  username: process.env.ADMIN_USERNAME ?? '',
  password: process.env.ADMIN_PASSWORD ?? '',
} as const;

// 向后兼容导出（旧代码仍可引用 releaseData）。
export const releaseData = fallbackReleaseData;
