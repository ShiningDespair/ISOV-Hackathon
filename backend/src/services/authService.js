// ---------------------------------------------------------------------
// KIMLIK DOGRULAMA IS MANTIGI
//
// Route dosyasi yalnizca HTTP (govde dogrulama, durum kodu, cerez) ile
// ilgilenir; kurallar burada. Sebep: ayni kurallari `npm run migrate`
// (admin tohumlama) ve ileride yonetim uclari da cagiracak. Iki yerde
// kopyalanan bir sifre politikasi er ya da gec ayrisir.
// ---------------------------------------------------------------------
import { createHash, randomBytes } from 'node:crypto';
import { query, queryOne } from '../lib/db.js';
import { ApiError } from '../lib/http.js';
import { hashPassword, passwordPolicyError, verifyPassword } from '../lib/passwords.js';
import { hashToken, revokeAllSessions } from '../lib/session.js';
import { layoutOf, viewOf, densityOf, normalizeTimeBudget, LAYOUT_LABELS, POSITION_LABELS } from '../lib/positions.js';
import { toIso } from '../lib/serialize.js';

/** Kayitta kurum verilmezse. */
export const DEFAULT_TENANT_KEY = 'isov';

/** E-posta bazli kalici kilit: kacinci hatada, kac dakika. */
export const LOCK_THRESHOLD = 5;
export const LOCK_MINUTES = 15;

/** Sifre sifirlama baglantisinin omru (saat). */
function resetTtlHours() {
  const n = Number(process.env.PASSWORD_RESET_TTL_HOURS);
  return Number.isFinite(n) && n > 0 && n <= 72 ? n : 2;
}

/**
 * TEK hata mesaji. Kullanici var mi yok mu, sifre mi yanlis — hepsi ayni
 * cumleyi alir. Farkli mesaj, kayitli e-postalari tespit etmeye yarayan
 * bir kesif araci (user enumeration) olurdu.
 */
const INVALID_CREDENTIALS = 'E-posta adresi veya şifre hatalı.';

function lockedMessage(minutes) {
  return `Çok sayıda hatalı giriş denemesi nedeniyle hesap geçici olarak kilitlendi. `
    + `Lütfen ${minutes} dakika sonra tekrar deneyin.`;
}

/** E-posta daima kucuk harf ve bosluksuz saklanir (uq_users_email tek kayit gorsun). */
export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------
// OLMAYAN E-POSTALAR ICIN SAHTE KILIT
//
// Kalici kilit yalnizca gercek kullanicilarda calissa, saldirgan bir
// e-postaya 5 yanlis deneme gonderip yanitin "kilitlendi"ye donup
// donmedigine bakarak hesabin VAR OLDUGUNU ogrenirdi. Bu yuzden olmayan
// e-postalar da ayni esikte ayni yaniti alir; sayac bellekte tutulur
// (DB'de satir acmak, saldirgana yazma imkani vermek olurdu).
// ---------------------------------------------------------------------
const decoyLocks = new Map(); // sha256(email) -> { count, lockedUntil, seenAt }
const DECOY_TTL_MS = 60 * 60 * 1000;

const decoySweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of decoyLocks) {
    if (now - rec.seenAt > DECOY_TTL_MS) decoyLocks.delete(key);
  }
}, 10 * 60 * 1000);
decoySweeper.unref();

function decoyKey(email) {
  return createHash('sha256').update(email).digest('hex');
}

function decoyLockRemainingMinutes(email) {
  const rec = decoyLocks.get(decoyKey(email));
  if (!rec?.lockedUntil) return 0;
  const left = rec.lockedUntil - Date.now();
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

function bumpDecoyFailure(email) {
  const key = decoyKey(email);
  const now = Date.now();
  const rec = decoyLocks.get(key) || { count: 0, lockedUntil: 0, seenAt: now };
  if (rec.lockedUntil && rec.lockedUntil <= now) { rec.count = 0; rec.lockedUntil = 0; }
  rec.count += 1;
  rec.seenAt = now;
  if (rec.count >= LOCK_THRESHOLD) rec.lockedUntil = now + LOCK_MINUTES * 60 * 1000;
  decoyLocks.set(key, rec);
}

/**
 * Var olmayan kullanici icin de scrypt maliyeti odenir.
 *
 * NEDEN: "kullanici yok" dalinda sifre dogrulamasi atlanirsa yanit ~60 ms
 * daha hizli doner ve bu zaman farki, mesajlar ayni olsa bile hesabin
 * varligini sizdirir. Sabit bir sahte ozete karsi dogrulama yaparak iki
 * dalin suresini birbirine yaklastiriyoruz.
 */
let decoyHashPromise = null;
function decoyHash() {
  if (!decoyHashPromise) {
    decoyHashPromise = hashPassword(randomBytes(24).toString('base64url'));
  }
  return decoyHashPromise;
}
async function burnPasswordTime(plain) {
  try {
    await verifyPassword(String(plain ?? ''), await decoyHash());
  } catch { /* yoksay: amaci yalnizca zaman harcamak */ }
}

// ---------------------------------------------------------------------
// Okuma yardimcilari
// ---------------------------------------------------------------------

const USER_SELECT = `
  SELECT u.id, u.tenant_id, u.email, u.password_hash, u.full_name, u.title,
         u.role, u.status, u.last_login_at, u.last_seen_at, u.prev_seen_at,
         u.failed_login_count, u.locked_until, u.must_change_password,
         u.created_at, u.updated_at,
         t.tenant_key, t.name AS tenant_name
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id`;

export function findUserByEmail(email) {
  return queryOne(`${USER_SELECT} WHERE u.email = ? LIMIT 1`, [normalizeEmail(email)]);
}

export function findUserById(id) {
  return queryOne(`${USER_SELECT} WHERE u.id = ? LIMIT 1`, [id]);
}

export function findTenantByKey(tenantKey) {
  return queryOne(
    'SELECT id, tenant_key, name, kind, default_region, is_active FROM tenants WHERE tenant_key = ? LIMIT 1',
    [String(tenantKey ?? '').trim()],
  );
}

/** API'ye cikan kullanici sekli. password_hash, sayaclar ve kilit ASLA cikmaz. */
export function serializeUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    full_name: row.full_name,
    title: row.title,
    role: row.role,
    status: row.status,
    must_change_password: Boolean(row.must_change_password),
    last_login_at: toIso(row.last_login_at),
    last_seen_at: toIso(row.last_seen_at),
    // Degisiklik akisinin okudugu damga; arayuz "son ziyaretinizden beri"
    // rozetini bununla kurar.
    prev_seen_at: toIso(row.prev_seen_at),
    created_at: toIso(row.created_at),
    tenant: {
      id: Number(row.tenant_id),
      tenant_key: row.tenant_key,
      name: row.tenant_name ?? null,
    },
  };
}

/** JSON kolonlari: mysql2 bazi surumlerde string dondurur, ikisini de karsila. */
function readJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/** user_profiles satiri (SAPMA-ONLY: satir yoksa null). */
export async function findProfile(userId) {
  const row = await queryOne(
    `SELECT user_id, position_code, time_budget_min, primary_sector_code,
            secondary_sector_codes, region_focus, interest_tag_slugs,
            muted_tag_slugs, persona, profile_vector_status,
            profile_vector_built_at, created_at, updated_at
       FROM user_profiles WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  if (!row) return null;
  return {
    position_code: row.position_code,
    position_label: POSITION_LABELS[row.position_code] ?? null,
    time_budget_min: normalizeTimeBudget(row.time_budget_min),
    primary_sector_code: row.primary_sector_code,
    secondary_sector_codes: readJson(row.secondary_sector_codes, []),
    region_focus: readJson(row.region_focus, []),
    interest_tag_slugs: readJson(row.interest_tag_slugs, []),
    muted_tag_slugs: readJson(row.muted_tag_slugs, []),
    persona: readJson(row.persona, null),
    profile_vector_status: row.profile_vector_status,
    profile_vector_built_at: toIso(row.profile_vector_built_at),
    updated_at: toIso(row.updated_at),
  };
}

/**
 * /auth/me govdesi: kullanici + profil (varsa) + TURETILMIS duzen ve gorunum.
 *
 * `layout` ve `default_view` DB'de kolon DEGIL, lib/positions.js'ten
 * turetilir. Ayni degeri iki yerde tutmak, importance.js'te esiklerin uc
 * ayri yerde kopyalanip kaymasi hatasinin aynisini davet eder.
 *
 * ALAN EKLENIR, ALAN CIKARILMAZ: `default_view` yeni bir alan; mevcut
 * tuketiciler (arayuz, testler) etkilenmez.
 */
export async function buildMePayload(userRow) {
  const profile = await findProfile(userRow.id);
  const position = profile?.position_code ?? null;
  const timeBudget = profile?.time_budget_min ?? null;
  const layout = layoutOf(position);

  return {
    user: serializeUser(userRow),
    // SAPMA-ONLY: satir yoksa kisiselestirme KAPALI ve siralama bugunku
    // editoryal akis. Bos durum yok, bozulma yok.
    profile,
    layout,
    layout_label: LAYOUT_LABELS[layout] ?? null,
    density: densityOf(timeBudget ?? 5),
    // POZISYONDAN TURETILEN VARSAYILAN GORUNUM.
    //
    // `layout` ile AYNI MANTIK DEGIL, bilincli fark: layoutOf() profil
    // yoksa 'ozet'e duser (normalizePosition() bilinmeyeni 'ust-yonetim'
    // yapiyor), viewOf() ise 'panel'e duser. Sebep sapma-only ilkesi:
    // profil satiri OLMAYAN kullanici icin "ust yonetim secti" varsayimi
    // yapip 'gorsel' acmak, "hic secmedi" ile "ust yonetim secti"
    // ayrimini yok ederdi. `position === null` -> 'panel', yani bugunku
    // notr varsayilan aynen korunur.
    //
    // Bu alan bir EMIR degil ONERI: kullanicinin acik secimi
    // (localStorage['isov:view']) her zaman kazanir, cerez/`default_view`
    // yalnizca secim yokken devreye girer (docs/SADELESTIRME.md §3).
    default_view: viewOf(position),
    // Profil satiri yoksa arayuz kullaniciyi onboarding'e alir.
    onboarding_required: profile === null,
  };
}

// ---------------------------------------------------------------------
// KAYIT
// ---------------------------------------------------------------------

/**
 * Yeni kullanici acar.
 *
 * user_profiles satiri ACILMAZ (sapma-only ilkesi): profil yoksa
 * kisiselestirme kapali ve kullanici bugunku editoryal akisi gorur.
 * Bos varsayilanlarla satir acmak, "kullanici gercekten ust yonetim mi
 * yoksa hic secmedi mi" ayrimini kalici olarak yok ederdi.
 */
export async function registerUser({ email, password, full_name, title, tenant_key }) {
  const mail = normalizeEmail(email);

  const policyError = passwordPolicyError(password);
  if (policyError) throw ApiError.badRequest(policyError);

  const wantedTenant = String(tenant_key ?? '').trim() || DEFAULT_TENANT_KEY;
  const tenant = await findTenantByKey(wantedTenant);
  // Olmayan kuruma kayit 400: sema tenants.id'ye FK veriyor, ama kullaniciya
  // "yabanci anahtar hatasi" degil anlasilir bir cumle dondurmeliyiz.
  if (!tenant) {
    throw ApiError.badRequest(`Belirtilen kurum bulunamadı: ${wantedTenant}`);
  }
  if (!tenant.is_active) {
    throw ApiError.badRequest('Belirtilen kurum aktif değil.');
  }

  const existing = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [mail]);
  if (existing) {
    throw ApiError.conflict('Bu e-posta adresi ile kayıtlı bir kullanıcı zaten var.');
  }

  const passwordHash = await hashPassword(password);

  let insertId;
  try {
    const result = await query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, title, role, status)
       VALUES (?, ?, ?, ?, ?, 'uye', 'aktif')`,
      [tenant.id, mail, passwordHash, full_name ?? null, title ?? null],
    );
    insertId = Number(result.insertId);
  } catch (err) {
    // Yaris durumu: iki istek ayni e-postayi ayni anda denedi. UNIQUE
    // anahtar dogru kararı verdi, biz yalnizca dogru durum kodunu ceviriyoruz.
    if (err?.code === 'ER_DUP_ENTRY') {
      throw ApiError.conflict('Bu e-posta adresi ile kayıtlı bir kullanıcı zaten var.');
    }
    throw err;
  }

  return findUserById(insertId);
}

// ---------------------------------------------------------------------
// GIRIS
// ---------------------------------------------------------------------

/** Kilit suresi devam ediyor mu? Kalan dakikayi doner (0 = kilitli degil). */
function lockRemainingMinutes(row) {
  if (!row?.locked_until) return 0;
  const until = row.locked_until instanceof Date ? row.locked_until : new Date(row.locked_until);
  const left = until.getTime() - Date.now();
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

async function registerFailure(row) {
  // Sayac ve kilit TEK UPDATE'te: iki ayri sorgu arasinda eszamanli
  // denemeler sayaci kaybettirebilirdi.
  //
  // Kilit damgasi JS'te hesaplaniyor (INTERVAL ? MINUTE yerine): hazir
  // ifadelerde yer tutucunun INTERVAL biriminin yanina konmasi surumler
  // arasinda tutarsiz. Ayni makine, ayni TRT saati — fark yok.
  const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
  await query(
    `UPDATE users
        SET locked_until = CASE
              WHEN failed_login_count + 1 >= ? THEN ?
              ELSE locked_until
            END,
            failed_login_count = failed_login_count + 1
      WHERE id = ?`,
    [LOCK_THRESHOLD, lockedUntil, row.id],
  );
}

/**
 * E-posta + sifre dogrulamasi.
 *
 * Basarisizsa DAIMA ayni 401 mesaji; kilitliyse 423 ve ayni mesaj hem
 * gercek hem olmayan kullanici icin uretilir (bkz. sahte kilit).
 *
 * @returns {Promise<object>} users satiri (tenant bilgisiyle)
 */
export async function authenticate({ email, password }) {
  const mail = normalizeEmail(email);
  const row = await findUserByEmail(mail);

  if (!row) {
    // Olmayan kullanici: ayni zamani harca, ayni kilit davranisini uygula.
    await burnPasswordTime(password);
    const decoyMinutes = decoyLockRemainingMinutes(mail);
    if (decoyMinutes > 0) {
      throw new ApiError(423, 'ACCOUNT_LOCKED', lockedMessage(decoyMinutes));
    }
    bumpDecoyFailure(mail);
    throw new ApiError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
  }

  // KILIT ONCE KONTROL EDILIR: kilitli hesapta DOGRU sifre de reddedilir.
  // Aksi halde kilit yalnizca yanlis sifreyi yavaslatirdi ve sifreyi
  // ele gecirmis saldirgani hic durdurmazdi.
  const locked = lockRemainingMinutes(row);
  if (locked > 0) {
    await burnPasswordTime(password);
    throw new ApiError(423, 'ACCOUNT_LOCKED', lockedMessage(locked));
  }

  const ok = await verifyPassword(String(password ?? ''), row.password_hash);
  if (!ok) {
    await registerFailure(row);
    // Bu deneme kilidi tetiklediyse kullaniciya durumu soyle; kilit zaten
    // olmayan e-postalarda da ayni esikte kuruldugu icin bilgi sizmaz.
    if (Number(row.failed_login_count) + 1 >= LOCK_THRESHOLD) {
      throw new ApiError(423, 'ACCOUNT_LOCKED', lockedMessage(LOCK_MINUTES));
    }
    throw new ApiError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
  }

  if (row.status !== 'aktif') {
    throw new ApiError(403, 'ACCOUNT_INACTIVE',
      'Hesabınız şu anda aktif değil. Lütfen kurum yöneticinizle iletişime geçin.');
  }

  // Basarili giris: sayac ve kilit sifirlanir, damga yazilir.
  await query(
    `UPDATE users
        SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW()
      WHERE id = ?`,
    [row.id],
  );

  decoyLocks.delete(decoyKey(mail));
  return findUserById(row.id);
}

// ---------------------------------------------------------------------
// SIFRE DEGISTIRME
// ---------------------------------------------------------------------

export async function changePassword(userRow, current, next) {
  const ok = await verifyPassword(String(current ?? ''), userRow.password_hash);
  if (!ok) throw ApiError.badRequest('Mevcut şifreniz hatalı.');

  const policyError = passwordPolicyError(next);
  if (policyError) throw ApiError.badRequest(policyError);

  if (await verifyPassword(String(next), userRow.password_hash)) {
    throw ApiError.badRequest('Yeni şifre mevcut şifrenizden farklı olmalıdır.');
  }

  await query(
    `UPDATE users SET password_hash = ?, must_change_password = 0,
            failed_login_count = 0, locked_until = NULL
      WHERE id = ?`,
    [await hashPassword(next), userRow.id],
  );
}

/** Yonetim/tohumlama yolu: mevcut sifre sorulmadan atama. */
export async function setPassword(userId, plain, { mustChange = false } = {}) {
  const policyError = passwordPolicyError(plain);
  if (policyError) throw ApiError.badRequest(policyError);
  await query(
    `UPDATE users SET password_hash = ?, must_change_password = ?,
            failed_login_count = 0, locked_until = NULL
      WHERE id = ?`,
    [await hashPassword(plain), mustChange ? 1 : 0, userId],
  );
}

// ---------------------------------------------------------------------
// SIFRE SIFIRLAMA
//
// SMTP henuz yok. Uc yine de kayit acar ve 202 doner: baglanti kurulunca
// gonderim isi ayni tablodan besleniyor olacak, akis degismeyecek.
// Token yanitta DONDURULMEZ — donmesi, e-posta sahipligini dogrulamadan
// sifre degistirmeye izin vermek olurdu.
// ---------------------------------------------------------------------

/**
 * @returns {Promise<{created: boolean, token: string|null}>}
 *   token YALNIZCA cagirana doner (gelistirme gunlugu / admin baglantisi
 *   uretimi icin); HTTP yaniti asla tasimaz.
 */
export async function createPasswordReset(email, { createdBy = 'kullanici' } = {}) {
  const row = await findUserByEmail(email);
  // Kullanici yoksa da cagiran 202 dondurur; burada sessizce cikiyoruz.
  if (!row) return { created: false, token: null };

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + resetTtlHours() * 60 * 60 * 1000);

  await query(
    `INSERT INTO password_resets (user_id, token_hash, created_by, expires_at)
     VALUES (?, ?, ?, ?)`,
    [row.id, hashToken(token), createdBy, expiresAt],
  );

  return { created: true, token, userId: Number(row.id), expiresAt };
}

/**
 * Tokeni tuketir ve sifreyi degistirir.
 *
 * Token sha256 ozetiyle aranir (tabloda ham deger yok), `used_at` bos ve
 * suresi gecmemis olmali. Basarida TUM oturumlar iptal edilir: sifre
 * sifirlama genellikle "hesabim ele gecirildi" senaryosudur, saldirganin
 * acik oturumu ayakta kalmamali.
 */
export async function consumePasswordReset(token, nextPassword) {
  const policyError = passwordPolicyError(nextPassword);
  if (policyError) throw ApiError.badRequest(policyError);

  const row = await queryOne(
    `SELECT id, user_id FROM password_resets
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
      LIMIT 1`,
    [hashToken(String(token ?? ''))],
  );
  if (!row) {
    throw ApiError.badRequest('Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.');
  }

  // Tek kullanimlik: once isaretle, sonra sifreyi yaz. Isaretleme
  // affectedRows=0 dondururse baska bir istek tokeni bizden once
  // tuketti — ikinci kez sifre yazmayiz.
  const marked = await query(
    'UPDATE password_resets SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
    [row.id],
  );
  if (Number(marked.affectedRows) === 0) {
    throw ApiError.badRequest('Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.');
  }

  await query(
    `UPDATE users SET password_hash = ?, must_change_password = 0,
            failed_login_count = 0, locked_until = NULL
      WHERE id = ?`,
    [await hashPassword(nextPassword), row.user_id],
  );

  await revokeAllSessions(row.user_id);
  return { userId: Number(row.user_id) };
}

// ---------------------------------------------------------------------
// ADMIN TOHUMLAMA — `npm run migrate` cagirir
// ---------------------------------------------------------------------

/**
 * ADMIN_EMAIL / ADMIN_PASSWORD ile admin kullanici olusturur veya gunceller.
 * Sifre HICBIR YERDE loglanmaz, yalnizca ozeti yazilir.
 *
 * must_change_password = 1: tohum sifresi ortam degiskeninde (ve muhtemelen
 * shell gecmisinde) duruyor, kalici kimlik bilgisi sayilamaz.
 */
export async function seedAdminUser({ email, password, tenantKey = DEFAULT_TENANT_KEY, fullName = 'Sistem Yöneticisi' }) {
  const mail = normalizeEmail(email);
  if (!mail || !mail.includes('@')) {
    throw new Error('ADMIN_EMAIL gecerli bir e-posta adresi olmali');
  }
  const policyError = passwordPolicyError(password);
  if (policyError) throw new Error(`ADMIN_PASSWORD politikaya uymuyor: ${policyError}`);

  const tenant = await findTenantByKey(tenantKey);
  if (!tenant) throw new Error(`Kurum bulunamadi: ${tenantKey}`);

  const passwordHash = await hashPassword(password);
  const existing = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [mail]);

  if (existing) {
    await query(
      `UPDATE users
          SET password_hash = ?, role = 'admin', status = 'aktif',
              must_change_password = 1, failed_login_count = 0, locked_until = NULL,
              tenant_id = ?
        WHERE id = ?`,
      [passwordHash, tenant.id, existing.id],
    );
    return { action: 'guncellendi', userId: Number(existing.id), email: mail };
  }

  const result = await query(
    `INSERT INTO users (tenant_id, email, password_hash, full_name, role, status, must_change_password)
     VALUES (?, ?, ?, ?, 'admin', 'aktif', 1)`,
    [tenant.id, mail, passwordHash, fullName],
  );
  return { action: 'olusturuldu', userId: Number(result.insertId), email: mail };
}
