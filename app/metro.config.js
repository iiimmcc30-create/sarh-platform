const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Windows: avoid workspace-wide watching and sibling-project resolution.
if (process.platform === 'win32') {
  config.projectRoot = projectRoot;
  config.watchFolders = [projectRoot];
  config.resolver = {
    ...config.resolver,
    unstable_enableSymlinks: false,
    blockList: [
      ...(Array.isArray(config.resolver.blockList)
        ? config.resolver.blockList
        : config.resolver.blockList
          ? [config.resolver.blockList]
          : []),
      /backend-nest[\\/].*/,
      /admin-panel[\\/].*/,
      /arc-esports-website[\\/].*/,
    ],
  };
  config.watcher = {
    ...config.watcher,
    useWatchman: false,
    healthCheck: {
      enabled: true,
      interval: 30000,
      timeout: 120000,
    },
  };
  config.maxWorkers = 2;
  // Dev client only — skip web SSR bundles that thrash the watcher on Windows.
  config.resolver.platforms = ['ios', 'android', 'native'];

  const upstream = config.server?.enhanceMiddleware;
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware, metroServer) => {
      const base =
        typeof upstream === 'function'
          ? upstream(middleware, metroServer)
          : middleware;
      return (req, res, next) => {
        const url = req.url ?? '';
        // Block web/SSR only — Expo Router Android dev client needs transform.routerRoot=app.
        if (
          url.includes('platform=web') ||
          url.includes('expo-router/node/render')
        ) {
          res.statusCode = 404;
          res.end('web disabled (dev-client)');
          return;
        }
        return base(req, res, next);
      };
    },
  };
}

// `npx expo run:android` starts Metro — set up adb reverse so 127.0.0.1 reaches the PC.
if (!process.env.CI && process.env.EXPO_PUBLIC_SKIP_ADB !== 'true') {
  try {
    const { trySetupUsbReverse } = require('./scripts/start-usb.js');
    void trySetupUsbReverse().then((urls) => {
      if (urls) {
        console.log(`[safat] USB adb reverse OK — API ${urls.apiUrl}, socket ${urls.socketUrl}`);
      }
    });
  } catch {
    // adb optional when no device is connected yet
  }
}

module.exports = config;
