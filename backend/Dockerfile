# ---------------------------------------------------------------------
# ISOV-Hackathon backend — Node 22 / Debian slim
#
# NEDEN alpine DEGIL: semantik tekillestirme `onnxruntime-node` kullaniyor ve
# bu paket yalnizca glibc icin onceden derlenmis ikili dagitiyor. musl uzerinde
# "Error loading shared library ld-linux-x86-64.so.2" ile yukleniyor ve
# embedding katmani sessizce devre disi kaliyor. glibc tabanli imaj sart.
# ---------------------------------------------------------------------
FROM node:22-slim

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

# Model onbellegi klasoru IMAJDA olusturulmali: named volume ilk baglandiginda
# icerigi ve sahipligi imajdaki klasorden alir. Olmazsa volume root'a ait olur
# ve 'node' kullanicisi model indiremez (embedding katmani sessizce kapanir).
RUN mkdir -p /app/.cache/models

# node:22-slim imajinda hazir gelen 'node' kullanicisi — root ile calistirmiyoruz.
RUN chown -R node:node /app
USER node

EXPOSE 5005

CMD ["node", "src/server.js"]
