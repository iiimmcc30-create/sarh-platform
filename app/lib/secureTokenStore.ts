/**
 * Where the session tokens live.
 *
 * - iOS / Android: expo-secure-store (Keychain / Keystore), readable after the
 *   first unlock so background refresh keeps working.
 * - Web: AsyncStorage (localStorage) as before — there is no secure store.
 *
 * Tokens written by older builds sit in AsyncStorage under the same keys. The
 * first read on a native build moves them into the secure store and deletes
 * the AsyncStorage copy, so the user stays signed in across the update. If the
 * secure store is unavailable the old storage keeps working (never a logout).
 */

export const TOKEN_KEYS = {
  ACCESS: 'safat_access_token',
  REFRESH: 'safat_refresh_token',
} as const;

export type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

export interface KeyValueSecureStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface KeyValueLegacyStore {
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

export type TokenStoreDeps = {
  /** null on web (or when the native module is missing): legacy storage only. */
  secure: () => KeyValueSecureStore | null;
  legacy: () => KeyValueLegacyStore;
};

const KEYS = [TOKEN_KEYS.ACCESS, TOKEN_KEYS.REFRESH] as const;

export function createTokenStore(deps: TokenStoreDeps) {
  let migration: Promise<StoredTokens> | null = null;

  async function readLegacy(): Promise<StoredTokens> {
    const rows = await deps.legacy().multiGet(KEYS);
    const get = (k: string) => rows.find((r) => r[0] === k)?.[1] ?? null;
    return { accessToken: get(TOKEN_KEYS.ACCESS), refreshToken: get(TOKEN_KEYS.REFRESH) };
  }

  async function writeSecure(secure: KeyValueSecureStore, tokens: StoredTokens) {
    if (tokens.accessToken) await secure.setItemAsync(TOKEN_KEYS.ACCESS, tokens.accessToken);
    if (tokens.refreshToken) await secure.setItemAsync(TOKEN_KEYS.REFRESH, tokens.refreshToken);
  }

  async function readAndMigrate(): Promise<StoredTokens> {
    const secure = deps.secure();
    if (!secure) return readLegacy();

    let fromSecure: StoredTokens;
    try {
      fromSecure = {
        accessToken: await secure.getItemAsync(TOKEN_KEYS.ACCESS),
        refreshToken: await secure.getItemAsync(TOKEN_KEYS.REFRESH),
      };
    } catch {
      return readLegacy();
    }
    if (fromSecure.refreshToken) return fromSecure;

    // One-time move from an older build: read old, write secure, delete old.
    const legacy = await readLegacy();
    if (!legacy.accessToken && !legacy.refreshToken) return fromSecure;
    try {
      await writeSecure(secure, legacy);
      await deps.legacy().multiRemove(KEYS);
    } catch {
      /* keep the legacy copy; it still works */
    }
    return legacy;
  }

  return {
    async getTokens(): Promise<StoredTokens> {
      if (!migration) {
        migration = readAndMigrate().finally(() => {
          migration = null;
        });
      }
      return migration;
    },

    async getRefreshToken(): Promise<string | null> {
      return (await this.getTokens()).refreshToken;
    },

    async setTokens(accessToken: string, refreshToken?: string | null): Promise<void> {
      const secure = deps.secure();
      if (secure) {
        try {
          await writeSecure(secure, { accessToken, refreshToken: refreshToken ?? null });
          await deps.legacy().multiRemove(KEYS).catch(() => undefined);
          return;
        } catch {
          /* fall through: never lose a fresh session */
        }
      }
      const pairs: [string, string][] = [[TOKEN_KEYS.ACCESS, accessToken]];
      if (refreshToken) pairs.push([TOKEN_KEYS.REFRESH, refreshToken]);
      await deps.legacy().multiSet(pairs);
    },

    async clearTokens(): Promise<void> {
      const secure = deps.secure();
      if (secure) {
        for (const key of KEYS) {
          await secure.deleteItemAsync(key).catch(() => undefined);
        }
      }
      await deps.legacy().multiRemove(KEYS).catch(() => undefined);
    },
  };
}

function loadSecureStore(): KeyValueSecureStore | null {
  try {
    // Lazy: keeps this module importable on web and in plain-node tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
    return {
      getItemAsync: (key) => SecureStore.getItemAsync(key, options),
      setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, options),
      deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, options),
    };
  } catch {
    // Native module missing (binary built before expo-secure-store): old storage.
    return null;
  }
}

function loadLegacyStore(): KeyValueLegacyStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as KeyValueLegacyStore;
}

let secureCache: KeyValueSecureStore | null | undefined;

export const tokenStore = createTokenStore({
  secure: () => {
    if (secureCache === undefined) secureCache = loadSecureStore();
    return secureCache;
  },
  legacy: loadLegacyStore,
});
