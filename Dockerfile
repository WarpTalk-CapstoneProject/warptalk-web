FROM node:22.17.1-alpine3.22@sha256:5539840ce9d013fa13e3b9814c9353024be7ac75aca5db6d039504a56c04ea59 AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --fetch-timeout=60000 --fetch-retries=5

FROM node:22.17.1-alpine3.22@sha256:5539840ce9d013fa13e3b9814c9353024be7ac75aca5db6d039504a56c04ea59 AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SIGNALR_URL
ARG NEXT_PUBLIC_LIVEKIT_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SIGNALR_URL=$NEXT_PUBLIC_SIGNALR_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22.17.1-alpine3.22@sha256:5539840ce9d013fa13e3b9814c9353024be7ac75aca5db6d039504a56c04ea59 AS final
# The explicit openssl floor is not redundant with `apk upgrade`. The release build pins
# this base image by digest and passes `--cache-from` against a registry BuildKit cache
# (scripts/build-release.sh), so this RUN layer is a cache hit on every rebuild and the
# upgrade never actually re-runs -- which is how CVE-2026-14456 (libcrypto3/libssl3
# 3.5.7-r0) survived a rebuild and blocked the release gate. Naming the fixed version
# changes this layer's cache key and fails the build loudly if it is unavailable, rather
# than silently reinstalling the vulnerable one. Raise the floor on the next advisory.
RUN apk upgrade --no-cache \
    && apk add --no-cache 'libcrypto3>=3.5.8-r0' 'libssl3>=3.5.8-r0' \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
USER node
CMD ["node", "server.js"]
