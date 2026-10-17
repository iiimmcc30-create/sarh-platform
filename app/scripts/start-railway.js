/**
 * Dev against the production API (no local backend required).
 * Usage: npm run start:railway
 */
const PRODUCTION_API = 'https://getsarh.com';
const PRODUCTION_SOCKET = 'https://getsarh.com';

process.env.EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_URL || PRODUCTION_API;
process.env.EXPO_PUBLIC_SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || PRODUCTION_SOCKET;
// Prevent web-only same-origin flag from leaking into native Metro bundles.
process.env.EXPO_PUBLIC_WEB_SAME_ORIGIN = 'false';

require('./start-qr');
