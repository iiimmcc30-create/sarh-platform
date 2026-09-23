FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
# Use install (not ci): Expo peer deps (@expo/metro-runtime etc.) can drift from lockfile.
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY . .

# Production web uses same-origin /api via the outer Hostinger nginx.
ARG EXPO_PUBLIC_WEB_SAME_ORIGIN=true
ARG EXPO_PUBLIC_API_URL=
ARG EXPO_PUBLIC_SOCKET_URL=https://sarhsa.online
ARG EXPO_PUBLIC_AGORA_ENABLED=false

ENV EXPO_PUBLIC_WEB_SAME_ORIGIN=$EXPO_PUBLIC_WEB_SAME_ORIGIN
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
ENV EXPO_PUBLIC_SOCKET_URL=$EXPO_PUBLIC_SOCKET_URL
ENV EXPO_PUBLIC_AGORA_ENABLED=$EXPO_PUBLIC_AGORA_ENABLED
ENV EXPO_NO_TELEMETRY=1
ENV CI=1

RUN npx expo export --platform web

FROM nginx:1.27-alpine AS runner

COPY nginx.web.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
