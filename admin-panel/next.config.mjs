/** @type {import('next').NextConfig} */
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001';
// Guard: proxy must target backend (:3001), never the admin dev server (:3000)
const apiUrl = rawApiUrl.includes(':3000')
  ? 'http://127.0.0.1:3001'
  : rawApiUrl.replace(/\/$/, '').replace('localhost', '127.0.0.1');

const adminBasePath = (process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || '').replace(
  /\/$/,
  '',
);

const nextConfig = {
  output: 'standalone',
  // Keep false: nginx must NOT redirect /admin → /admin/ or Next's 308 /admin/ → /admin loops.
  trailingSlash: false,
  ...(adminBasePath ? { basePath: adminBasePath } : {}),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
