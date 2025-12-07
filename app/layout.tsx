import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { releaseData } from '@/lib/config';
import PixelBase from '@/components/PixelBase';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${releaseData.artistName} - ${releaseData.trackTitle}`,
  description: '高性能音乐 Smart Link，优化移动端体验与转化追踪。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hans">
      <body
        className={`${manrope.variable} min-h-screen bg-black text-white antialiased`}
      >
        {/* Meta Pixel 初始化（仅在配置存在时渲染） */}
        <PixelBase pixelId={releaseData.metaPixelId} />
        {children}
      </body>
    </html>
  );
}
