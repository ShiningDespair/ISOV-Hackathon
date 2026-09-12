# syntax=docker/dockerfile:1

###############################################################################
# ISOV Frontend — çok aşamalı derleme (deps → builder → runner)
# Derleme sırasında backend'e ERİŞİLMEZ; tüm veri çekimi istek anında yapılır
# (her sayfa `export const dynamic = "force-dynamic"`).
###############################################################################

# --------------------------------------------------------------------------
# 1) Bağımlılıklar
# --------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# glibc uyumluluğu için (bazı native modüller ister)
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# --------------------------------------------------------------------------
# 2) Derleme
# --------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Tarayıcıya gömülen tek değişken — proxy üzerinden /api
ARG NEXT_PUBLIC_API_BASE_URL=/api
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm run build

# --------------------------------------------------------------------------
# 3) Çalıştırma — standalone çıktı, root olmayan kullanıcı
# --------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Root olmayan kullanıcı
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nextjs

# Standalone sunucu + statik varlıklar
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static      ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public            ./public

USER nextjs

EXPOSE 3000

# Basit sağlık kontrolü — Next sunucusu ayakta mı?
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
