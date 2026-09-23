# Daftra integration (Sarh)

```
Butcher
  └── ButcherDaftraIntegration (subdomain + AES-256-GCM API key)
        └── DaftraClient  →  https://{account}.daftra.com/api2
              ├── GET /api_key_info.json
              ├── GET /products.json
              ├── GET /products/{id}.json
              ├── POST /products.json   (client helper, not Sarh catalog CRUD)
              └── PUT  /products/{id}.json
```

## Secrets

- Per-butcher API key is stored in `ButcherDaftraIntegration` (`apiKeyCiphertext`, `apiKeyIv`, `apiKeyTag`).
- Encrypt/decrypt: `src/common/crypto/secret-encryption.ts` (AES-256-GCM).
- Key material: `SECRETS_ENCRYPTION_KEY` or a derived key from `JWT_SECRET`.
- The key is never returned to the frontend (masked last4 only), never emailed, and never logged.

## Client creation

`DaftraService.clientForButcher(butcherId)`:

1. Load the butcher row (404 if missing).
2. Load **that butcher’s** integration only (`where: { butcherId }`).
3. Decrypt the key in-process.
4. Build `DaftraClient` with `https://{accountIdentifier}.daftra.com`.

Callers never pass `apiKey` or `subdomain` from the client for data requests.

## Tenant isolation

- Butcher routes resolve the shop from `JWT.userId` → `Butcher.userId`.
- Admin routes take `butcherId` from the path and still load integration by that id only.
- `Butcher A` cannot decrypt or call with `Butcher B` credentials.
- Product links are unique on `(butcherId, daftraProductId)` and a Sarh product is verified to belong to the same butcher before linking.

## Connection test

`GET /api2/api_key_info.json` with either:

- header `APIKEY` (documented Method 1), or
- header `Authorization: Bearer <access_token>` (documented Method 2) — do not send both.

## Authentication (official Daftra docs)

1. **API Key** — primary Sarh path (`PUT` admin configure + `POST .../test`).
2. **OAuth2 password grant** — `POST /api2/oauth/token` with `grant_type=password` + client_id/secret + username/password. Tokens encrypted at rest. Service helper: `connectPasswordGrantForOwner`.

**Authorization Code / browser Redirect is NOT documented** by Daftra public API docs. Routes kept for Redirect URI registration only:

- `GET /api/butchers/daftra/oauth/start` → `501 oauth_authorization_code_unsupported`
- `GET /api/butchers/daftra/oauth/callback` → redirect with same reason (no token exchange)

Registered Redirect URI (ENV `DAFTRA_OAUTH_REDIRECT_URI`):

`https://sarhsa.online/api/butchers/daftra/oauth/callback`

## Caching

`daftra.cache.ts` defines tenant-prefixed keys (`daftra:{butcherId}:…`) for a later Redis cache. Reads currently go straight to Daftra with a 12s timeout. Do not cache across butcher ids.

## Adding a Daftra endpoint

1. Add the documented path to `daftra.constants.ts` (`DAFTRA_PATHS`).
2. Call it only through `DaftraClient` (`get/post/put/patch/delete`).
3. Map the JSON in `daftra.mappers.ts` — do not leak raw Daftra payloads (especially `data.key`).
4. Expose it from `DaftraService` after `clientForButcher`.

## Sarh HTTP routes

Admin (ADMIN only):

- `GET/PUT /api/admin/butchers/:id/daftra`
- `POST /api/admin/butchers/:id/daftra/test`
- `POST /api/admin/butchers/:id/daftra/disable`
- `GET /api/admin/butchers/:id/daftra/products`
- `POST /api/admin/butchers/:id/daftra/products/sync` — pull Daftra catalog into Sarh (upsert, no auto-delete)
- `GET /api/admin/butchers/:id/daftra/products/:productId`
- `GET /api/admin/butchers/:id/daftra/inventory`

Butcher (JWT owner shop only):

- `GET /api/butchers/daftra/status`
- `POST /api/butchers/daftra/test-connection`
- `GET /api/butchers/daftra/products`
- `GET /api/butchers/daftra/products/:id`
- `GET /api/butchers/daftra/inventory`
- `GET /api/butchers/daftra/inventory/:id`
- `GET/POST /api/butchers/daftra/product-links`

## Product sync (Daftra → Sarh)

`DaftraService.syncProductsFromDaftra`:

1. Paginate `GET /api2/products.json` via `listProducts`.
2. Map each row with `mapDaftraProductToSarhFields` (default category `special_orders`, cut `عام`).
3. Upsert on unique `(butcherId, daftraProductId)` in `ButcherDaftraProduct`.
4. Create or update the linked `ButcherProduct` — **never** delete Sarh products missing from Daftra.
5. Logs only counts/ids — never API keys.

### Automatic poll (worker)

`WorkerCronService.runDaftraProductSyncCron` every **10 minutes**:

- Loads all `ButcherDaftraIntegration` rows with `status = CONNECTED`.
- Acquires Redis lock `cron:daftra_products:{butcherId}` (TTL 9m) per butcher.
- Calls the same `syncProductsFromDaftra` engine (no second sync implementation).
- One butcher failure does not stop the rest.
- Admin manual `POST .../products/sync` remains as fallback.

`POST/PUT` Daftra product helpers exist on `DaftraService` for a later catalog flow and are **not** wired to Sarh `ButcherProduct` CRUD.

## Inventory note

No dedicated Daftra “list inventory” API2 path was found in the available docs. List inventory uses documented `Product.stock_balance` on `GET /products.json`. Per-product warehouse splits use `StockLevels` on `GET /products/{id}.json` when present.
