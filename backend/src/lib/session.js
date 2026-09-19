// ---------------------------------------------------------------------
// OTURUM KATMANI — token uretimi, cerez, DB kayitlari
//
// NEDEN JWT DEGIL, DB OTURUMU:
// Admin panelden rol degistigi an etkili olmali ve "cikis yap" gercekten
// iptal etmeli. JWT ile her iki ihtiyac da bir iptal listesi gerektirir —
// o liste zaten `sessions` tablosu olurdu. Bir katman az.
//
// HAM TOKEN SAKLANMAZ: DB'ye yalnizca sha256 ozeti yazilir. Veritabani
// sizarsa (yedek dosyasi, SQL enjeksiyonu) canli oturumlar ele gecmesin.
// Token 32 rastgele bayt oldugu icin sozluk saldirisi anlamsiz; sifrelerde
// zorunlu olan yavas KDF burada GEREKSIZ maliyet olurdu (her istekte bir
// scrypt = her istekte 60 ms).
// ---------------------------------------------------------------------
import { createHash, randomBytes } from 'node:crypto';
import { query, queryOne } from './db.js';
import { ApiError } from './http.js';

/** Cerez adi — sozlesmede sabit. */
export const SESSION_COOKIE = 'isov_session';

const DEFAULT_TTL_HOURS = 168; // 7 gun

/** Oturum omru (saat). Gecersiz/eksik env varsayilana duser. */
export function sessionTtlHours() {
  const n = Number(process.env.SESSION_TTL_HOURS);
  return Number.isFinite(n) && n > 0 && n <= 24 * 365 ? n : DEFAULT_TTL_HOURS;
}

/** Opak oturum tokeni: 32 bayt, URL-guvenli. */
export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

/** DB'de saklanan tek deger: tokenin sha256 ozeti (hex, 64 karakter). */
export function hashToken(token) {
  return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

// ---------------------------------------------------------------------
// CEREZ
//
// `cookie-parser` EKLENMEDI: tek bir cerez okuyoruz, bir bagimlilik ve
// bir orta katman daha eklemek bu is icin gereksiz. Ayristirma asagida,
// 15 satir.
// ---------------------------------------------------------------------

/** `a=1; b=2` -> { a: '1', b: '2' }. Bozuk parcalar sessizce atlanir. */
export function parseCookieHeader(header) {
  const out = Object.create(null);
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      // Hatali yuzde kodlamasi istegi dusurmesin.
      out[name] = raw;
    }
  }
  return out;
}

/** Istekten oturum tokenini okur; yoksa null. */
export function readSessionToken(req) {
  const cookies = req.cookies || parseCookieHeader(req.headers?.cookie);
  const token = cookies[SESSION_COOKIE];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/** Cerez secenekleri — tek yerde, cikista da girişte de ayni. */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // secure YALNIZCA production: gelistirmede http://localhost uzerinden
    // cerez hic gonderilmezdi ve oturum sessizce calismazdi.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

/** Yanit uzerine oturum cerezini yazar. */
export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: sessionTtlHours() * 60 * 60 * 1000,
  });
}

/**
 * Cerezi temizler. Tarayicinin cerezi gercekten dusurmesi icin secenekler
 * (path/sameSite/secure) yazma anindakilerle AYNI olmak zorunda.
 */
export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

// ---------------------------------------------------------------------
// DB islemleri
// ---------------------------------------------------------------------

/**
 * Yeni oturum acar.
 * @returns {Promise<{token: string, expiresAt: Date, id: number}>}
 */
export async function createSession(userId, { ip = null, userAgent = null } = {}) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlHours() * 60 * 60 * 1000);

  const result = await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, last_used_at, ip, user_agent)
     VALUES (?, ?, ?, NOW(), ?, ?)`,
    [
      userId,
      hashToken(token),
      expiresAt,
      ip ? String(ip).slice(0, 45) : null,
      userAgent ? String(userAgent).slice(0, 255) : null,
    ],
  );

  return { token, expiresAt, id: Number(result.insertId) };
}

/**
 * Tokene karsilik gelen CANLI oturumu ve sahibini getirir.
 * Iptal edilmis oturum hic gelmez; suresi gecmis oturum gelir ama
 * `is_expired = 1` isaretiyle — cagiran cerezi temizleyebilsin.
 */
export async function findSessionByToken(token) {
  return queryOne(
    `SELECT s.id             AS session_id,
            s.expires_at     AS session_expires_at,
            s.last_used_at   AS session_last_used_at,
            (s.expires_at <= NOW()) AS is_expired,
            u.id, u.tenant_id, u.email, u.full_name, u.title, u.role, u.status,
            u.must_change_password, u.last_login_at, u.last_seen_at, u.prev_seen_at,
            u.created_at,
            t.tenant_key, t.name AS tenant_name
       FROM sessions s
       JOIN users   u ON u.id = s.user_id
       JOIN tenants t ON t.id = u.tenant_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
      LIMIT 1`,
    [hashToken(token)],
  );
}

/** Tek oturumu iptal eder (cikis). Zaten iptalliyse hicbir sey yapmaz. */
export async function revokeSessionByToken(token) {
  const result = await query(
    `UPDATE sessions SET revoked_at = NOW()
      WHERE token_hash = ? AND revoked_at IS NULL`,
    [hashToken(token)],
  );
  return Number(result.affectedRows) > 0;
}

/**
 * Kullanicinin tum oturumlarini iptal eder. `exceptToken` verilirse o
 * oturum ayakta kalir — sifre degistiren kullanici kendi sekmesinden
 * atilmasin, ama diger cihazlar dussun.
 */
export async function revokeAllSessions(userId, { exceptToken = null } = {}) {
  if (exceptToken) {
    const result = await query(
      `UPDATE sessions SET revoked_at = NOW()
        WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?`,
      [userId, hashToken(exceptToken)],
    );
    return Number(result.affectedRows);
  }
  const result = await query(
    'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId],
  );
  return Number(result.affectedRows);
}

// ---------------------------------------------------------------------
// last_seen_at / prev_seen_at — 30 DAKIKA KURALI
//
// Sema yorumunun uyguladigi kural:
//   now - last_seen_at > 30 dk  ->  prev_seen_at = last_seen_at, last_seen_at = now
//   aksi halde                  ->  yalnizca last_seen_at = now
//
// NEDEN IKI KOLON: tek kolonla, oturumun ILK sayfa yuklemesi damgayi
// now'a ceker ve "son ziyaretinizden beri 12 haber" rozeti ilk
// yenilemede kaybolur. Degisiklik sorgusu COALESCE(prev_seen_at,
// created_at) okur, yani "ziyaret" kavraminin kalici bir tanimi gerekiyor.
//
// NEDEN OTURUMDA TUTULMAZ: oturum suresi dolunca sifirlanirdi ve iki
// cihazda iki farkli cevap uretirdi.
//
// TEK UPDATE: prev_seen_at ATAMASI ONCE yazilir. MySQL atamalari
// soldan saga degerlendirir ve sonraki atamalar oncekinin YENI degerini
// gorur — sira ters olsa prev_seen_at daima now olurdu.
//
// YAZMA SIKLIGI: her istekte UPDATE atmak gereksiz yuk (bir sayfa
// yuklemesi 5-10 API cagrisi). WHERE kosulu yazmayi en fazla 5 dakikada
// bire indirir; kosul DB'de oldugu icin ayrica okuma yapmak ve yaris
// durumu dusunmek gerekmiyor.
// ---------------------------------------------------------------------
const SEEN_WRITE_THROTTLE_MIN = 5;
const SEEN_NEW_VISIT_MIN = 30;

export async function touchUserSeen(userId) {
  const result = await query(
    `UPDATE users
        SET prev_seen_at = CASE
              WHEN last_seen_at IS NULL
                OR last_seen_at < (NOW() - INTERVAL ${SEEN_NEW_VISIT_MIN} MINUTE)
              THEN last_seen_at
              ELSE prev_seen_at
            END,
            last_seen_at = NOW()
      WHERE id = ?
        AND (last_seen_at IS NULL
             OR last_seen_at < (NOW() - INTERVAL ${SEEN_WRITE_THROTTLE_MIN} MINUTE))`,
    [userId],
  );
  return Number(result.affectedRows) > 0;
}

/** Oturumun son kullanim damgasi — ayni 5 dakika kisitiyla. */
export async function touchSession(sessionId) {
  await query(
    `UPDATE sessions SET last_used_at = NOW()
      WHERE id = ?
        AND (last_used_at IS NULL
             OR last_used_at < (NOW() - INTERVAL ${SEEN_WRITE_THROTTLE_MIN} MINUTE))`,
    [sessionId],
  );
}

/** Suresi gecmis ve iptalli oturumlari temizler (bakim isi icin). */
export async function pruneSessions() {
  const result = await query(
    'DELETE FROM sessions WHERE expires_at < (NOW() - INTERVAL 30 DAY) OR revoked_at < (NOW() - INTERVAL 30 DAY)',
  );
  return Number(result.affectedRows);
}

// ---------------------------------------------------------------------
// Yetki yardimcilari
//
// middleware/session.js ile AYNI fonksiyonlar. Iki yol tutuluyor cunku
// paralel gelisen route dosyalari ikisinden birini bekliyor olabilir;
// tanim TEK yerde (asagidaki gerceklestirme) ve middleware onu yeniden
// ihrac ediyor.
// ---------------------------------------------------------------------

/** Oturum yoksa 401. */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Bu işlem için oturum açmanız gerekiyor.'));
  }
  return next();
}

const ROLE_LABELS = { uye: 'Üye', editor: 'Editör', admin: 'Yönetici' };

/**
 * Rol kontrolu. `requireRole('admin')` veya `requireRole('admin', 'editor')`.
 * Once oturum, sonra rol kontrol edilir — oturumsuz istek 403 degil 401 alir
 * ki arayuz "giris yap" ile "yetkin yok" ayrimini yapabilsin.
 */
export function requireRole(...roles) {
  const allowed = roles.flat().filter(Boolean);
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'UNAUTHORIZED', 'Bu işlem için oturum açmanız gerekiyor.'));
    }
    if (!allowed.includes(req.user.role)) {
      const names = allowed.map((r) => ROLE_LABELS[r] || r).join(' veya ');
      return next(new ApiError(403, 'FORBIDDEN', `Bu işlem için ${names} yetkisi gerekiyor.`));
    }
    return next();
  };
}
