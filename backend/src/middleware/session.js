// ---------------------------------------------------------------------
// OTURUM ORTA KATMANI
//
// Tum /api istekleri bundan gecer ve iki alan doldurur:
//   req.user   = { id, email, role, tenant_id, tenant_key, ... } | null
//   req.tenant = { id, tenant_key, name }                       | null
//
// ISTEGI REDDETMEZ. Sebep: hangi ucun oturum istedigine UC KENDISI karar
// verir. Burada global bir kapi kurmak, `/health`, `/meta/*` ve bugun
// calisan `/articles` gibi uclari tek hamlede kirardi; ayrica "oturum
// varsa kisiselestir, yoksa editoryal akisi ver" davranisi imkansiz olurdu.
// Koruma gereken uclar `requireAuth` / `requireRole` takar.
//
// tenantKeyOf() BU ALANLARI OKUR — kurum sizintisi duzeltmesinin temeli
// bu orta katman. Bu yuzden router'dan ONCE, server.js'te baglanir.
// ---------------------------------------------------------------------
import {
  SESSION_COOKIE, clearSessionCookie, findSessionByToken, parseCookieHeader,
  readSessionToken, requireAuth, requireRole, touchSession, touchUserSeen,
} from '../lib/session.js';

/**
 * Yalnizca 'aktif' kullanici kimlik dogrulanmis sayilir.
 * 'askida' / 'pasif' hesabin canli oturumu ANINDA islevsiz kalmali —
 * admin panelden askiya alma islemi "bir sonraki girise kadar" beklememeli.
 */
const AUTHENTICATED_STATUSES = new Set(['aktif']);

export async function sessionMiddleware(req, res, next) {
  // Cerezler bir kez ayristirilip paylasilir; cookie-parser yerine
  // 15 satirlik kendi ayristiricimiz (bkz. lib/session.js).
  req.cookies = parseCookieHeader(req.headers?.cookie);
  req.user = null;
  req.tenant = null;
  req.session = null;

  const token = readSessionToken(req);
  if (!token) return next();

  let row;
  try {
    row = await findSessionByToken(token);
  } catch (err) {
    // DB gecici olarak erisilemezse istek oturumsuz devam etsin; korunan
    // uclar 401 dondurur, acik uclar calismaya devam eder. Burada 500
    // atmak tum siteyi DB dalgalanmasinda karartirdi.
    console.error('[session] oturum okunamadi:', err.message);
    return next();
  }

  // Bulunamadi (iptal edilmis veya hic olmamis) / suresi gecmis /
  // hesap aktif degil -> cerez ise yaramaz, tarayicidan dusur.
  if (!row || Number(row.is_expired) === 1 || !AUTHENTICATED_STATUSES.has(row.status)) {
    if (req.cookies[SESSION_COOKIE]) clearSessionCookie(res);
    return next();
  }

  // DIKKAT: prev_seen_at / last_seen_at DAMGALAR ISTEK BASINDAKI degerdir.
  // touchUserSeen() asagida yazsa bile req.user eski degeri tasir —
  // "son ziyaretinizden beri" sorgusu bu istekte dogru cevabi uretsin.
  req.user = {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    email: row.email,
    full_name: row.full_name,
    title: row.title,
    role: row.role,
    status: row.status,
    must_change_password: Boolean(row.must_change_password),
    last_login_at: row.last_login_at,
    last_seen_at: row.last_seen_at,
    prev_seen_at: row.prev_seen_at,
    created_at: row.created_at,
    tenant_key: row.tenant_key,
  };

  req.tenant = {
    id: Number(row.tenant_id),
    tenant_key: row.tenant_key,
    name: row.tenant_name,
  };

  req.session = {
    id: Number(row.session_id),
    token,
    expires_at: row.session_expires_at,
  };

  // Damga yazmalari istegi BEKLETMEZ ve BASARISIZ ETMEZ: ziyaret sayaci
  // hicbir yanitin dogrulugunu belirlemiyor, hata halinde sessizce atlanir.
  // (Her ikisi de DB tarafinda 5 dakikalik kisitla korunuyor.)
  Promise.all([
    touchUserSeen(req.user.id),
    touchSession(req.session.id),
  ]).catch((err) => console.error('[session] damga guncellenemedi:', err.message));

  return next();
}

// Yetki yardimcilari tek yerde tanimli (lib/session.js); paralel gelisen
// route dosyalari hangi yoldan import ederse etsin ayni fonksiyonu alsin.
export { requireAuth, requireRole };
