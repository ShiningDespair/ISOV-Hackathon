# ---------------------------------------------------------------------
# ISOV-Hackathon backend — Node 22 / Alpine
# ---------------------------------------------------------------------
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Bagimliliklar once kopyalanir ki kaynak degisince katman cache'i bozulmasin.
COPY package.json package-lock.json* ./
# package-lock.json varsa deterministik `npm ci`, yoksa `npm install`.
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi \
 && npm cache clean --force

COPY . .

# node:22-alpine imajinda hazir gelen 'node' kullanicisi — root ile calistirmiyoruz.
RUN chown -R node:node /app
USER node

EXPOSE 5005

CMD ["node", "src/server.js"]
