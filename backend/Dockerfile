# ---------------------------------------------------------------------
# ISOV-Hackathon backend — Node 22 / Debian slim
#
# NEDEN alpine DEGIL: semantik tekillestirme `onnxruntime-node` kullaniyor ve
# bu paket yalnizca glibc icin onceden derlenmis ikili dagitiyor. musl uzerinde
# "Error loading shared library ld-linux-x86-64.so.2" ile yukleniyor ve
# embedding katmani sessizce devre disi kaliyor. glibc tabanli imaj sart.
#
# CHROMIUM (sunucu tarafi PDF): Debian deposundan `chromium` paketi kurulur.
# NEDEN puppeteer'in indirdigi ikili DEGIL: indirilen Chrome'un paylasimli
# kutuphane listesini (libnss3, libatk, libcups, libdrm, libgbm, libasound...)
# elle kurmak gerekiyor ve eksik bir .so CALISMA ANINDA "Failed to launch the
# browser process" olarak cikiyor. apt paketi bu bagimliliklari kendi getirir,
# bu yuzden `puppeteer-core` + `PUPPETEER_EXECUTABLE_PATH` kullaniliyor.
#
# FONTLAR — TURKCE ICIN ZORUNLU: node:22-slim'de HIC TrueType font yok.
# Font olmadan Chromium son cikis olarak bitmap font kullanir ve Turkce
# harfler (İ Ğ Ü Ş Ö Ç ı ğ ü ş ö ç) kutu/soru isareti olarak basilir.
#   fonts-liberation   -> Liberation Serif/Sans (Times/Arial metrik esdegeri),
#                         PDF sablonunun serif basligi ve sans kicker'i
#   fonts-dejavu-core  -> DejaVu Serif/Sans, yedek aile
#   fonts-freefont-ttf -> genis Unicode kapsami (para birimi, ok, madde imi)
# Ucu de tam Latin-5/Turkce kapsar. "İĞÜŞÖÇ" cikisinin dogrulugu imaj
# kurulduktan sonra pdftotext ile GERCEKTEN olculdu.
#
# Imaj bu yuzden ~400 MB buyuyor; bilincli takas.
# ---------------------------------------------------------------------
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# --- sistem paketleri -------------------------------------------------
# --no-install-recommends: onerilen paketler imaji gereksiz buyutur, ama
# chromium'un GERCEK bagimliliklari "Depends" oldugu icin yine gelir.
# poppler-utils: `pdftotext` — PDF metin katmanini dogrulama araci
# (Turkce karakter testi konteyner icinde kosulabilsin).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-freefont-ttf \
      ca-certificates \
      poppler-utils \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

# Puppeteer sistem Chromium'unu kullanir; kendi indirmesini yapmaz.
# PUPPETEER_SKIP_DOWNLOAD `puppeteer-core` icin gereksiz (o hic indirmez)
# ama biri paketi tam `puppeteer`a cevirirse imaj sisman diye burada duruyor.
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROMIUM_PATH=/usr/bin/chromium

# Bagimliliklar once kopyalanir ki kaynak degisince katman cache'i bozulmasin.
COPY package.json package-lock.json* ./
# package-lock.json varsa deterministik `npm ci`, yoksa `npm install`.
# DIKKAT: yeni bagimlilik (puppeteer-core, nodemailer) eklendiginde lock
# dosyasi guncel degilse `npm ci` reddeder; bu yuzden ci basarisizsa
# install'a dusuluyor — imaj kurulumu bir lock tazeligi yuzunden patlamasin.
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev || npm install --omit=dev; \
    else \
      npm install --omit=dev; \
    fi \
 && npm cache clean --force

COPY . .

# Model onbellegi klasoru IMAJDA olusturulmali: named volume ilk baglandiginda
# icerigi ve sahipligi imajdaki klasorden alir. Olmazsa volume root'a ait olur
# ve 'node' kullanicisi model indiremez (embedding katmani sessizce kapanir).
#
# /app/var/pdf AYNI KURALIN IKINCI ORNEGI: compose'daki `pdf_out` volume'u
# buraya baglaniyor. Klasor imajda yoksa volume root'a ait olur ve CLI
# isleri "EACCES: permission denied" alir (bir kez yasandi).
RUN mkdir -p /app/.cache/models /app/var/pdf

# Chromium kullanici profili icin yazilabilir HOME sart; node:22-slim'de
# /home/node var ama sahipligi acikca veriyoruz (aksi halde
# "Failed to create a ProcessSingleton for your profile directory" alinir).
RUN mkdir -p /home/node/.cache && chown -R node:node /home/node

# node:22-slim imajinda hazir gelen 'node' kullanicisi — root ile calistirmiyoruz.
RUN chown -R node:node /app
USER node

EXPOSE 5005

CMD ["node", "src/server.js"]
