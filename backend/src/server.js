// ---------------------------------------------------------------------
// ISOV-Hackathon backend giris noktasi.
// ---------------------------------------------------------------------
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

// Proje bastan sona TRT varsayar (docker-compose: TZ=Europe/Istanbul).
// Ortamda TZ tanimli degilse de ayni davranalim; aksi halde gun bazli
// filtreler ve rapor donemleri UTC sunucuda bir gun kayar.
process.env.TZ = process.env.TZ || 'Europe/Istanbul';

import apiRouter from './routes/index.js';
import { ApiError } from './lib/http.js';
import { closePool, pingDb } from './lib/db.js';

const app = express();
const PORT = Number(process.env.PORT) || 5005;
const isProduction = process.env.NODE_ENV === 'production';

// Proxy arkasindayiz (hackathon.dhsyazilim.com -> isov-backend:5005);
// dogru istemci IP'si ve protokol icin gerekli.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// API yaniti HTML gostermedigi icin CSP yerine temel guvenlik basliklari yeter.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: liste bos ise (gelistirme) herkese acik, doluysa yalnizca izinli origin.
const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length === 0 ? true : (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  // PATCH: kaynak ve oneri guncelleme uclari icin zorunlu; yoksa tarayici
  // on-kontrolu (preflight) istegi daha sunucuya gelmeden reddeder.
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'],
  maxAge: 86400,
}));

app.use(compression());
app.use(morgan('tiny'));
// 2mb: /collect/run gibi uclar buyuk govde almiyor ama seed benzeri
// yuklemelerde bogulmayalim.
app.use(express.json({ limit: '2mb' }));

app.use('/api', apiRouter);

// Kok yol: hizli kesif icin uc nokta haritasi.
app.get('/', (req, res) => {
  res.json({
    name: 'ISOV-Hackathon API',
    base: '/api',
    endpoints: [
      'GET  /api/health',
      'GET  /api/articles',
      'GET  /api/articles/:id',
      'GET  /api/clusters/:id',
      'GET  /api/tags',
      'GET  /api/sources',
      'GET  /api/stats/overview',
      'GET  /api/reports',
      'GET  /api/reports/:id',
      'POST /api/reports/generate',
      'POST /api/collect/run',
      'POST /api/articles/fetch-images',
      'PATCH /api/sources/:id',
      'PUT  /api/sources/:id/watch',
      'PUT  /api/sources/watch/bulk',
      'POST /api/sources',
      'GET  /api/source-suggestions',
      'POST /api/source-suggestions',
      'PATCH /api/source-suggestions/:id',
    ],
  });
});

// --- 404 --------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Uc nokta bulunamadi: ${req.method} ${req.originalUrl}` },
  });
});

// --- merkezi hata yakalayici ------------------------------------------
// Tum hatalar {error:{code,message}} seklinde doner; production'da stack gizli.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const isApiError = err instanceof ApiError;
  const status = isApiError ? err.status : (err.status || err.statusCode || 500);

  // JSON parse hatasi express.json'dan gelir; kullanici hatasi olarak isaretle.
  const code = isApiError ? err.code
    : (err.type === 'entity.parse.failed' ? 'INVALID_JSON'
      : (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'));

  if (status >= 500) console.error('[error]', err);

  const payload = {
    error: {
      code,
      message: status >= 500 && isProduction ? 'Sunucu hatasi' : err.message,
    },
  };
  if (isApiError && err.details) payload.error.details = err.details;
  if (!isProduction && status >= 500) payload.error.stack = err.stack;

  res.status(status).json(payload);
});

// --- baslat ------------------------------------------------------------
const server = app.listen(PORT, '0.0.0.0', async () => {
  const db = await pingDb();
  console.log(`[isov-backend] http://0.0.0.0:${PORT}  (db: ${db ? 'ok' : 'ERISILEMEDI'})`);
});

// Docker `stop` SIGTERM gonderir: acik istekleri bitir, havuzu kapat.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[isov-backend] ${signal} alindi, kapaniyor...`);

  const force = setTimeout(() => {
    console.error('[isov-backend] zaman asimi, zorla kapatiliyor');
    process.exit(1);
  }, 10000);
  force.unref();

  server.close(async () => {
    try { await closePool(); } catch { /* yoksay */ }
    console.log('[isov-backend] kapandi');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

export default app;
