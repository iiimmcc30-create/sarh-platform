export type DaftraAuthMethodPublic = 'API_KEY' | 'OAUTH' | 'BOTH' | null;

export type DaftraPublicStatus = {
  butcherId: string;
  status: 'NOT_CONFIGURED' | 'CONNECTED' | 'CONNECTION_FAILED' | 'DISABLED';
  accountIdentifier: string | null;
  apiKeyMasked: string | null;
  authMethod: DaftraAuthMethodPublic;
  oauthConnected: boolean;
  lastConnectionTestAt: string | null;
  lastConnectionError: string | null;
  daftraLoginEmail: string | null;
  daftraLoginUrl: string | null;
  configured: boolean;
};

export type DaftraOAuthStatus = {
  connected: boolean;
  authenticationMethod: 'OAUTH' | null;
  accountIdentifier: string | null;
  expiresAt: string | null;
  scopes: string | null;
  provider: 'daftra' | null;
};

export type ConfigureDaftraInput = {
  accountIdentifier: string;
  apiKey?: string;
  daftraLoginEmail?: string | null;
  daftraLoginUrl?: string | null;
};

export type TestDaftraInput = {
  sendInvite?: boolean;
  invitePassword?: string;
};

export type DaftraConnectionPayload = {
  connected: boolean;
  reason?: string;
  messageAr: string;
};

export type LinkDaftraProductInput = {
  daftraProductId: number;
  sarhProductId?: string | null;
};

export type DaftraProductSyncResult = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  pages: number;
  errors: Array<{ daftraProductId: number | null; message: string }>;
};
