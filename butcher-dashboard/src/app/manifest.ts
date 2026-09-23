import type { MetadataRoute } from 'next';
import { BUTCHER_BASE_PATH, withButcherBase } from '@/constants/butcherBasePath';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sarh Butcher Dashboard',
    short_name: 'Sarh',
    description: 'لوحة إدارة الملاحم في منصة سرح: الطلبات والمنتجات والمخزون من حسابك المعتمد.',
    lang: 'ar',
    dir: 'rtl',
    start_url: withButcherBase('/dashboard'),
    scope: BUTCHER_BASE_PATH ? `${BUTCHER_BASE_PATH}/` : '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#20B66F',
    background_color: '#0B1622',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
