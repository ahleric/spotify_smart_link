/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    // 避免 edge 打包时报缺失 Node 内置模块
    serverComponentsExternalPackages: ['async_hooks'],
  },
  webpack: (config) => {
    // ESM 下使用 createRequire 获取 CJS 工具
    const { createRequire } = await import('module');
    const requireCjs = createRequire(import.meta.url);
    // 将 async_hooks 指向浏览端 stub，避免 edge 打包缺失 Node 内置模块
    const asyncStub = requireCjs('path').resolve('./lib/async_hooks_stub.js');
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      async_hooks: asyncStub,
    };
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      async_hooks: asyncStub,
    };
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
