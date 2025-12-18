/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    // 避免 edge 打包时报缺失 Node 内置模块
    serverComponentsExternalPackages: ['async_hooks'],
  },
  webpack: (config) => {
    // 将 async_hooks 映射为 false，避免 edge 端打包时报缺失 Node 内置模块
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      async_hooks: false,
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
