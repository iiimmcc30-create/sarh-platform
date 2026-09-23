import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { PwaProvider } from '@/components/pwa/PwaProvider';
import './globals.css';

const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sarh',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'سرح | لوحة الملاحم',
  description: 'لوحة إدارة الملاحم في منصة سرح: الطلبات والمنتجات والمخزون من حسابك المعتمد.',
  applicationName: 'Sarh',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sarh',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#20B66F',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={plex.variable}>
      <body className={`${plex.className} min-h-dvh antialiased`}>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
