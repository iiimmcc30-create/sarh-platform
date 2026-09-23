FROM node:22-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Prisma generate needs URLs at build time; real values are injected at runtime.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV DIRECT_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV DIRECT_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

# Clear dummy URLs so runtime must provide real Supabase connection strings
ENV DATABASE_URL=""
ENV DIRECT_URL=""

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Local upload/log dirs are writable by the runtime user. Production media
# goes to Cloudinary; these paths cover dev fallbacks and health probes.
RUN addgroup -g 1001 -S nodejs \
  && adduser -S -u 1001 -G nodejs sarh \
  && mkdir -p /app/public/uploads /app/logs /tmp/npm-cache \
  && chown -R sarh:nodejs /app /tmp/npm-cache

ENV HOME=/tmp
ENV npm_config_cache=/tmp/npm-cache

USER sarh

# Render assigns PORT at runtime. Do not hardcode a listen port here.
EXPOSE 3001 3002

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["api"]
