const API_PORT = 3001;
const SOCKET_PORT = 3002;
const PRODUCTION_API = 'https://sarhsa.online';
const PRODUCTION_SOCKET = 'https://sarhsa.online';
// Back-compat alias — Railway is decommissioned.
const RAILWAY_API = PRODUCTION_API;

function isRemoteUrl(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url.trim());
}

async function probeApiHealth(baseUrl, timeoutMs = 3000) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/health`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** Sync fallback — used where async probe is not available. */
function resolveDevApiUrls(lanIp) {
  const envApi = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  const envSocket = process.env.EXPO_PUBLIC_SOCKET_URL?.trim().replace(/\/$/, '');

  if (envApi && isRemoteUrl(envApi)) {
    return {
      apiUrl: envApi,
      socketUrl: envSocket && isRemoteUrl(envSocket) ? envSocket : envApi,
      mode: 'remote',
    };
  }

  const host = lanIp || '127.0.0.1';
  return {
    apiUrl: envApi || `http://${host}:${API_PORT}`,
    socketUrl: envSocket || `http://${host}:${SOCKET_PORT}`,
    mode: lanIp ? 'lan' : 'localhost',
  };
}

/**
 * Probe local backend health and fall back to Railway when unavailable.
 * Wi‑Fi dev: prefers LAN IP; localhost-only backend → Railway for the phone.
 */
async function resolveDevApiUrlsAsync(lanIp) {
  const envApi = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  const envSocket = process.env.EXPO_PUBLIC_SOCKET_URL?.trim().replace(/\/$/, '');

  if (envApi && isRemoteUrl(envApi)) {
    return {
      apiUrl: envApi,
      socketUrl: envSocket && isRemoteUrl(envSocket) ? envSocket : envApi,
      mode: 'remote',
    };
  }

  if (envApi && !isRemoteUrl(envApi)) {
    if (await probeApiHealth(envApi)) {
      const socketHost = envApi.replace(/:\d+$/, `:${SOCKET_PORT}`);
      return {
        apiUrl: envApi,
        socketUrl: envSocket || socketHost,
        mode: envApi.includes('127.0.0.1') ? 'localhost' : 'lan',
      };
    }
    console.warn('[dev-api] EXPO_PUBLIC_API_URL unreachable:', envApi);
  }

  if (lanIp) {
    const lanApi = `http://${lanIp}:${API_PORT}`;
    if (await probeApiHealth(lanApi)) {
      return {
        apiUrl: lanApi,
        socketUrl: envSocket || `http://${lanIp}:${SOCKET_PORT}`,
        mode: 'lan',
      };
    }
  }

  const loopbackApi = `http://127.0.0.1:${API_PORT}`;
  const loopbackOk = await probeApiHealth(loopbackApi);

  if (loopbackOk && lanIp) {
    console.warn(
      '[dev-api] Backend on localhost only — phone cannot reach it. Using production (Render).',
    );
    return {
      apiUrl: PRODUCTION_API,
      socketUrl: PRODUCTION_SOCKET,
      mode: 'render-fallback',
    };
  }

  if (loopbackOk) {
    return {
      apiUrl: loopbackApi,
      socketUrl: envSocket || `http://127.0.0.1:${SOCKET_PORT}`,
      mode: 'localhost',
    };
  }

  console.warn('[dev-api] No local backend — using production (Render).');
  return {
    apiUrl: PRODUCTION_API,
    socketUrl: PRODUCTION_SOCKET,
    mode: 'render-fallback',
  };
}

module.exports = {
  resolveDevApiUrls,
  resolveDevApiUrlsAsync,
  probeApiHealth,
  PRODUCTION_API,
  RAILWAY_API,
  API_PORT,
  SOCKET_PORT,
};
