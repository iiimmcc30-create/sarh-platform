/** @type {import('next').NextConfig} */
function resolveApiOrigin() {
  let raw = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (!raw) raw = 'http://127.0.0.1:3001';
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  raw = raw.replace(/\/$/, '').replace(/\/api$/i, '');
  raw = raw.replace('localhost', '127.0.0.1');
  if (/:(3000|3002|3003)(\/|$)/.test(raw)) {
    raw = 'http://127.0.0.1:3001';
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (
      process.env.VERCEL &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

const apiUrl = resolveApiOrigin() ?? (process.env.VERCEL ? 'https://sarhsa.online' : null);

const butcherBasePath = (process.env.NEXT_PUBLIC_BUTCHER_BASE_PATH || '').replace(
  /\/$/,
  '',
);

const nextConfig = {
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  ...(butcherBasePath ? { basePath: butcherBasePath } : {}),
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          {
            key: 'Service-Worker-Allowed',
            value: butcherBasePath ? `${butcherBasePath}/` : '/',
          },
        ],
      },
    ];
  },
  async rewrites() {
    if (!apiUrl) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
