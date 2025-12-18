import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { fallbackReleaseData } from '@/lib/config';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${fallbackReleaseData.artistName} - ${fallbackReleaseData.trackTitle}`,
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
        {children}
      </body>
    </html>
  );
}
