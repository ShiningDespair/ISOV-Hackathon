// ---------------------------------------------------------------------
// /api/admin — YONETIM UCLARI (yalnizca role='admin')
//
// CONTRACT.md "Yonetim ucları" tablosu ile birebir:
//   GET    /admin/overview              (ek: panelin Genel Bakis bolumu)
//   GET    /admin/settings              (ek: tek istekte tum ayarlar)
//   GET    /admin/settings/:key         smtp | auth | personalization | digest | branding
//   PUT    /admin/settings/:key
//   POST   /admin/settings/smtp/test
//   GET    /admin/users
//   PATCH  /admin/users/:id             {role, status}
//   POST   /admin/users/:id/reset-link
//   POST   /admin/digest/send
//   GET    /admin/email-log
//   GET    /admin/nace-coverage         (ek: /durum sayfasi da bunu okuyacak)
//
// ---------------------------- ILKELER --------------------------------
// 1) SIFRE OZETI ASLA DONMEZ. Kullanici sorgularinda `password_hash`
//    hicbir SELECT listesinde yok; `SELECT *` kullanilmiyor.
// 2) SIRLAR ASLA DONMEZ. Ayar okuma/yazma yalnizca settingsService
//    uzerinden gecer; o katman maskelemeyi garanti eder.
// 3) SON ADMIN KORUMASI. Panelin kilitlenmesi geri donusu olmayan bir
//    hata; bu yuzden "aktif admin sayisi 0'a duserse" yazma reddedilir.
// 4) DUZ METIN SIFRE SAKLANMAZ. SETTINGS_SECRET yoksa SMTP sifresi
//    kaydedilmez ve admine NEDENI soylenir.
// 5) Parametreli sorgu her yerde. Tek istisna LIMIT/OFFSET: `parsePagination`
//    zaten Number.parseInt'ten gecirip 1..100 araligina cekiyor
//    (routes/articles.js ile ayni desen, ayni gerekce).
// ---------------------------------------------------------------------
import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';

import { query, queryOne } from '../lib/db.js';
import {
  ApiError, asyncHandler, parseIdParam, parsePagination,
  pickFromAllowList, qs,
} from '../lib/http.js';
import { parseJsonColumn, toIso } from '../lib/serialize.js';
import { slugifyTag } from '../services/llm.js';
import { CROSSCUTTING, NACE_SECTORS } from '../lib/sectors.js';
import { requireRole } from '../middleware/session.js';
import { settingsSecretStatus } from '../lib/secrets.js';
import {
  SETTING_KEYS,
  assertSettingKey,
  getAllSettingsForApi,
  getSettingForApi,
  getSmtpTransportConfig,
  setSetting,
} from '../services/settingsService.js';

const router = Router();

// ---------------------------------------------------------------------
// YETKI
//
// `requireRole` TEK yerde tanimli (lib/session.js) ve middleware/session.js
// uzerinden disa aciliyor. Burada kopyasi YAZILMIYOR: iki ayri rol kontrolu
// er ya da gec ayrisir ve biri gevsek kalir.
//
// Davranis (o dosyanin sozlesmesi): oturum yoksa 401, rol yetmiyorsa 403.
// Ayrim onemli — arayuz "giris yap" ile "yetkiniz yok" ekranlarini bu iki
// koda gore secer.
//
// `sessionMiddleware` server.js'te router'dan ONCE bagli; req.user buraya
// dolu gelir. Oturum katmani istegi REDDETMEZ, reddetme karari asagidaki
// tek satirin isi.
// ---------------------------------------------------------------------

/** TUM /admin ucları yonetici ister. Tek satir, atlanamaz. */
router.use(requireRole('admin'));

/** Istegi yapan yoneticinin kimligi (denetim izi + kendini dusurme kontrolu). */
function actorId(req) {
  const id = Number(req.user?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// ---------------------------------------------------------------------
// GENEL BAKIS
// ---------------------------------------------------------------------

const USER_ROLES = ['uye', 'editor', 'admin'];
const USER_STATUSES = ['beklemede', 'aktif', 'askida', 'pasif'];
const EMAIL_STATUSES = ['kuyrukta', 'gonderildi', 'hata', 'iptal'];
const EMAIL_KINDS = ['dogrulama', 'sifre-sifirlama', 'bulten', 'davet', 'paylasim', 'uyari', 'test'];

/**
 * GET /admin/overview
 * Panelin ilk bolumu: kullanici sayilari, son girisler, korpus ozeti,
 * son toplama, e-posta kuyrugu ve ayar durumu.
 */
router.get('/overview', asyncHandler(async (req, res) => {
  const [roleRows, statusRows, lastLogins, corpus, sourceRow, clusterRow, lastRun, emailRows] =
    await Promise.all([
      query('SELECT role, COUNT(*) AS adet FROM users GROUP BY role'),
      query('SELECT status, COUNT(*) AS adet FROM users GROUP BY status'),
      query(
        `SELECT u.id, u.email, u.full_name, u.role, u.status, u.last_login_at, u.last_seen_at
           FROM users u
          WHERE u.last_login_at IS NOT NULL
          ORDER BY u.last_login_at DESC
          LIMIT 8`,
      ),
      queryOne(
        `SELECT COUNT(*) AS toplam,
                SUM(CASE WHEN is_duplicate = 0 THEN 1 ELSE 0 END) AS tekil,
                MAX(published_at) AS son_yayin
           FROM articles`,
      ),
      queryOne('SELECT COUNT(*) AS toplam, SUM(is_active) AS etkin FROM sources'),
      queryOne('SELECT COUNT(*) AS toplam FROM clusters'),
      queryOne(
        `SELECT id, started_at, finished_at, trigger_type,
                fetched_count, new_count, duplicate_count, error_count
           FROM collection_runs
          ORDER BY COALESCE(finished_at, started_at) DESC
          LIMIT 1`,
      ),
      query('SELECT status, COUNT(*) AS adet FROM email_log GROUP BY status'),
    ]);

  /** ENUM sayaclarini tam sozluge cevirir — eksik deger 0 gorunsun. */
  const tally = (rows, field, keys) => {
    const out = {};
    for (const k of keys) out[k] = 0;
    for (const r of rows) {
      const k = String(r[field]);
      out[k] = Number(r.adet ?? 0);
    }
    return out;
  };

  const settings = await getAllSettingsForApi();
  const smtp = settings.smtp?.value ?? {};

  res.json({
    kullanicilar: {
      toplam: Object.values(tally(roleRows, 'role', USER_ROLES)).reduce((a, b) => a + b, 0),
      role_gore: tally(roleRows, 'role', USER_ROLES),
      duruma_gore: tally(statusRows, 'status', USER_STATUSES),
      son_girisler: lastLogins.map((u) => ({
        id: Number(u.id),
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        status: u.status,
        last_login_at: toIso(u.last_login_at),
        last_seen_at: toIso(u.last_seen_at),
      })),
    },
    korpus: {
      haber: Number(corpus?.toplam ?? 0),
      tekil_haber: Number(corpus?.tekil ?? 0),
      son_yayin: toIso(corpus?.son_yayin),
      kaynak: Number(sourceRow?.toplam ?? 0),
      etkin_kaynak: Number(sourceRow?.etkin ?? 0),
      kume: Number(clusterRow?.toplam ?? 0),
    },
    son_toplama: lastRun ? {
      id: Number(lastRun.id),
      started_at: toIso(lastRun.started_at),
      finished_at: toIso(lastRun.finished_at),
      trigger_type: lastRun.trigger_type,
      fetched_count: Number(lastRun.fetched_count ?? 0),
      new_count: Number(lastRun.new_count ?? 0),
      duplicate_count: Number(lastRun.duplicate_count ?? 0),
      error_count: Number(lastRun.error_count ?? 0),
    } : null,
    eposta: tally(emailRows, 'status', EMAIL_STATUSES),
    ayarlar: {
      // Sir SIZDIRILMAZ: yalnizca "yapilandirma tam mi" bilgisi.
      smtp_hazir: Boolean(smtp.host && smtp.from_email && smtp.password_tanimli),
      smtp_sunucu: smtp.host || null,
      smtp_sifre_tanimli: Boolean(smtp.password_tanimli),
      sir_anahtari: settingsSecretStatus(),
      kisiselestirme_acik: Boolean(settings.personalization?.value?.enabled),
      bulten_acik: Boolean(settings.digest?.value?.enabled),
      kayit_acik: Boolean(settings.auth?.value?.registration_open),
    },
  });
}));

// ---------------------------------------------------------------------
// AYARLAR
// ---------------------------------------------------------------------

/** GET /admin/settings — tum anahtarlar tek yanitta (sirlar maskeli). */
router.get('/settings', asyncHandler(async (req, res) => {
  res.json({ data: await getAllSettingsForApi(), keys: SETTING_KEYS });
}));

/**
 * POST /admin/settings/smtp/test — test e-postasi gonderir / kuyruga alir.
 *
 * NEDEN HER ZAMAN 200 (500 DEGIL):
 * Bu uc "gonderim basarili mi" degil, "denemenin sonucu nedir" sorusunu
 * yanitlar. SMTP yarim yapilandirilmissa, nodemailer kurulu degilse ya da
 * sunucu reddederse dogru davranis, sonucu `email_log`'a yazip admine NE
 * OLDUGUNU SOYLEMEKTIR. 500 firlatmak arayuzde "sunucu coktu" gibi gorunur
 * ve gercek nedeni (sifre yok, host bos, paket yok) gizler.
 *
 * GONDERIM KAYDI KIMIN ISI: `services/mailService.js` varsa email_log
 * satirini KENDISI acar ve sonucu yazar — burada ikinci bir satir
 * ACILMAZ, yoksa her test iki kayit uretirdi. Servis yoksa ya da kayit
 * acmadan dondu ise (hiz siniri, gecersiz alici) satiri BU UC yazar;
 * boylece "denedim ama iz yok" durumu hicbir yolda olusmaz.
 *
 * DIKKAT: `/settings/:key` yolundan ONCE tanimli — Express ilk esleseni
 * kullanir ve bu yol daha ozel.
 */
router.post('/settings/smtp/test', asyncHandler(async (req, res) => {
  const adminId = actorId(req);
  const target = String(req.body?.to ?? req.user?.email ?? '').trim().toLowerCase();

  if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    throw ApiError.badRequest('Test e-postası için geçerli bir adres girin.');
  }

  const subject = 'İSOV Dış Kaynak İzleme — SMTP test e-postası';
  const html = '<p>Bu bir test e-postasıdır.</p>'
    + '<p>Bu iletiyi aldıysanız yönetim panelindeki SMTP yapılandırması çalışıyor demektir.</p>';

  const mail = await loadMailService();

  // --- Posta servisi henuz yayinda degil -----------------------------
  if (!mail) {
    const aciklama = 'Posta gönderim servisi (services/mailService.js) henüz yayında değil; '
      + 'test e-postası gönderilemedi. Deneme gönderim kaydına yazıldı.';
    const logId = await logTestAttempt({ adminId, target, subject, status: 'hata', error: aciklama });
    return res.status(200).json({
      kuyruga_alindi: false, status: 'hata', email_log_id: logId, to: target, aciklama,
    });
  }

  // --- Yapilandirma tanisi (servis kendi zarfini dondurur, firlatmaz) --
  let durum = null;
  if (typeof mail.mailStatus === 'function') {
    try { durum = await mail.mailStatus(); } catch { durum = null; }
  }

  // --- Gonderim -------------------------------------------------------
  // sendMail ISTISNA FIRLATMAZ; yine de savunmaci sariyoruz, cunku bu ucun
  // 500 dondurmemesi sozlesmenin parcasi.
  let out;
  try {
    out = await mail.sendMail({ to: target, subject, html, kind: 'test', userId: adminId });
  } catch (err) {
    out = { ok: false, error: `Gönderim denemesi başarısız: ${err?.message ?? 'bilinmeyen hata'}` };
  }

  const status = out?.ok ? 'gonderildi' : 'hata';
  let logId = Number(out?.logId ?? 0) || null;

  // Servis kayit acmadan dondu (hiz siniri, gecersiz alici, tasiyici yok):
  // izi burada biz birakiyoruz.
  if (!logId) {
    logId = await logTestAttempt({
      adminId, target, subject, status,
      error: status === 'hata' ? (out?.error ?? 'Bilinmeyen gönderim hatası.') : null,
    });
  }

  const eksik = Array.isArray(out?.missing) && out.missing.length
    ? ` Eksik: ${out.missing.join(', ')}.`
    : '';

  return res.status(200).json({
    kuyruga_alindi: status === 'gonderildi',
    status,
    email_log_id: logId,
    to: target,
    aciklama: out?.ok
      ? `Test e-postası ${target} adresine gönderildi.`
      : `${out?.error ?? 'Test e-postası gönderilemedi.'}${eksik}`,
    // Tani bilgisi: arayuz "neden gitmedi" sorusunu ekranda yanitlasin.
    tani: durum ? {
      hazir: Boolean(durum.available),
      nodemailer: Boolean(durum.nodemailer),
      kaynak: durum.source ?? null,
      sunucu: durum.host ?? null,
      port: durum.port ?? null,
      gonderen: durum.from ?? null,
      eksik: durum.missing ?? [],
      hata: durum.error ?? null,
    } : null,
  });
}));

/**
 * Test denemesini `email_log`'a yazar ve satir kimligini dondurur.
 * `kind='test'` + `digest_date IS NULL`: MySQL'de NULL'lar birbirinden
 * farkli sayildigi icin `uq_email_once` tekrarli testleri ENGELLEMEZ.
 */
async function logTestAttempt({ adminId, target, subject, status, error }) {
  const result = await query(
    `INSERT INTO email_log
       (user_id, to_email, kind, subject, status, error, attempt_count, sent_at)
     VALUES (?, ?, 'test', ?, ?, ?, 1, ${status === 'gonderildi' ? 'NOW()' : 'NULL'})`,
    [adminId, target.slice(0, 190), subject, status, error ? String(error).slice(0, 500) : null],
  );
  return Number(result?.insertId ?? 0) || null;
}

/** GET /admin/settings/:key */
router.get('/settings/:key', asyncHandler(async (req, res) => {
  res.json(await getSettingForApi(assertSettingKey(req.params.key)));
}));

/**
 * PUT /admin/settings/:key — kismi govde kabul eder.
 * SMTP sifresi gonderilmezse mevcut sifreli deger KORUNUR; bos string
 * gonderilirse SILINIR. SETTINGS_SECRET yoksa sifre yazma denemesi
 * 400 + `SETTINGS_SECRET_YOK` ile REDDEDILIR ve hicbir alan kaydedilmez.
 */
router.put('/settings/:key', asyncHandler(async (req, res) => {
  const key = assertSettingKey(req.params.key);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  res.json(await setSetting(key, body, actorId(req)));
}));

/**
 * Posta servisini dinamik yukler.
 *
 * NEDEN DINAMIK: `services/mailService.js` paralel bir ajanin dosyasi ve
 * bu uc yazilirken henuz yoktu. Statik import, dosya gelmedigi surece
 * TUM backend'i ayaga kaldirmazdi; dinamik import ise yalnizca bu ucun
 * davranisini degistirir ve admine yazili aciklama dondurur.
 *
 * Beklenen sozlesme (mailService.js):
 *   sendMail({to, subject, html, text?, kind, userId?})
 *     -> {ok, logId?, messageId?, error?, reason?, missing?}   (FIRLATMAZ)
 *   mailStatus() -> {available, nodemailer, source, host, port, from, missing, error}
 * `sendMail` email_log satirini KENDISI acar.
 */
async function loadMailService() {
  try {
    const mod = await import('../services/mailService.js');
    const sendMail = mod.sendMail ?? mod.default?.sendMail;
    if (typeof sendMail === 'function') {
      return {
        sendMail,
        mailStatus: mod.mailStatus ?? mod.default?.mailStatus ?? null,
      };
    }
  } catch {
    // Dosya yok ya da yuklenemedi — cagiran taraf durumu admine bildirir.
  }
  return null;
}

// ---------------------------------------------------------------------
// KULLANICILAR
// ---------------------------------------------------------------------

/** Siralama allow-list'i — kullanici stringi ASLA SQL'e girmez. */
const USER_SORTS = Object.freeze({
  'yeni': 'u.created_at DESC, u.id DESC',
  'eski': 'u.created_at ASC, u.id ASC',
  'eposta': 'u.email ASC',
  'eposta-desc': 'u.email DESC',
  'isim': 'u.full_name IS NULL, u.full_name ASC',
  'isim-desc': 'u.full_name IS NULL, u.full_name DESC',
  'rol': "FIELD(u.role,'admin','editor','uye'), u.email ASC",
  'rol-desc': "FIELD(u.role,'uye','editor','admin'), u.email ASC",
  'durum': "FIELD(u.status,'beklemede','aktif','askida','pasif'), u.email ASC",
  'durum-desc': "FIELD(u.status,'pasif','askida','aktif','beklemede'), u.email ASC",
  'giris': 'u.last_login_at IS NULL, u.last_login_at DESC',
  'giris-desc': 'u.last_login_at IS NULL, u.last_login_at ASC',
});

/** Kullanici satirinin API sekli. `password_hash` HICBIR ZAMAN burada degil. */
function serializeUser(r) {
  return {
    id: Number(r.id),
    email: r.email,
    full_name: r.full_name ?? null,
    title: r.title ?? null,
    role: r.role,
    status: r.status,
    tenant: r.tenant_key ? { id: Number(r.tenant_id), key: r.tenant_key, name: r.tenant_name } : null,
    last_login_at: toIso(r.last_login_at),
    last_seen_at: toIso(r.last_seen_at),
    created_at: toIso(r.created_at),
    failed_login_count: Number(r.failed_login_count ?? 0),
    locked_until: toIso(r.locked_until),
    must_change_password: Boolean(r.must_change_password),
    // Profil satiri yoksa kisiselestirme varsayilanda (sapma-only).
    position_code: r.position_code ?? null,
    aktif_oturum: Number(r.aktif_oturum ?? 0),
  };
}

/**
 * GET /admin/users — sayfali, aramali, rol/durum suzgecli.
 * Query: `q, role, status, sort, page, limit`
 */
router.get('/users', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const role = pickFromAllowList(req.query.role, USER_ROLES);
  const status = pickFromAllowList(req.query.status, USER_STATUSES);
  const sort = USER_SORTS[qs(req.query.sort) ?? ''] ?? USER_SORTS.yeni;
  const q = qs(req.query.q);

  const where = [];
  const params = [];

  if (role) { where.push('u.role = ?'); params.push(role); }
  if (status) { where.push('u.status = ?'); params.push(status); }
  if (q) {
    // LIKE joker karakterleri kacirilir; aksi halde "%" tum kayitlari getirir.
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push('(u.email LIKE ? OR u.full_name LIKE ? OR u.title LIKE ?)');
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM users u ${whereSql}`, params,
  );

  // LIMIT/OFFSET: parsePagination tarafindan tam sayiya ve 1..100 araligina
  // cekildi (routes/articles.js ile ayni desen).
  const rows = await query(
    `SELECT u.id, u.email, u.full_name, u.title, u.role, u.status,
            u.tenant_id, t.tenant_key, t.name AS tenant_name,
            u.last_login_at, u.last_seen_at, u.created_at,
            u.failed_login_count, u.locked_until, u.must_change_password,
            p.position_code,
            (SELECT COUNT(*) FROM sessions s
              WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > NOW()) AS aktif_oturum
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
       ${whereSql}
      ORDER BY ${sort}
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  const total = Number(countRow?.total ?? 0);
  res.json({
    data: rows.map(serializeUser),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
    // Arayuzdeki suzgec cipleri ve son admin uyarisi icin.
    meta: {
      roller: USER_ROLES,
      durumlar: USER_STATUSES,
      aktif_admin: await countActiveAdmins(),
    },
  });
}));

/** Panele girebilecek durumda kac yonetici var (rol=admin VE durum=aktif). */
async function countActiveAdmins(exceptUserId = null) {
  const row = exceptUserId
    ? await queryOne(
      "SELECT COUNT(*) AS adet FROM users WHERE role = 'admin' AND status = 'aktif' AND id <> ?",
      [exceptUserId],
    )
    : await queryOne("SELECT COUNT(*) AS adet FROM users WHERE role = 'admin' AND status = 'aktif'");
  return Number(row?.adet ?? 0);
}

/**
 * PATCH /admin/users/:id — {role, status}
 *
 * SON ADMIN KORUMASI (iki katman):
 *  (a) Yonetici KENDI rolunu admin'den dusuremez ve kendi hesabini
 *      pasife alamaz. Gerekce: bu islem geri alinamaz bir kilitlenmeye
 *      en kisa yol ve kazayla yapilmasi cok kolay. Baska bir yonetici
 *      yapabilir.
 *  (b) Baska bir yoneticiyi dusurmek, geride AKTIF yonetici kalmiyorsa
 *      reddedilir. "role='admin' ama status='pasif'" bir hesap panele
 *      giremez, bu yuzden sayim durumu da hesaba katar.
 */
router.patch('/users/:id', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz kullanıcı kimliği');
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const hasRole = body.role !== undefined && body.role !== null && body.role !== '';
  const hasStatus = body.status !== undefined && body.status !== null && body.status !== '';
  if (!hasRole && !hasStatus) {
    throw ApiError.badRequest('Güncellenecek alan yok. `role` ya da `status` gönderin.');
  }

  const newRole = hasRole ? pickFromAllowList(body.role, USER_ROLES) : null;
  if (hasRole && !newRole) {
    throw ApiError.badRequest(`Geçersiz rol. Geçerli değerler: ${USER_ROLES.join(', ')}.`);
  }
  const newStatus = hasStatus ? pickFromAllowList(body.status, USER_STATUSES) : null;
  if (hasStatus && !newStatus) {
    throw ApiError.badRequest(`Geçersiz durum. Geçerli değerler: ${USER_STATUSES.join(', ')}.`);
  }

  const target = await queryOne(
    'SELECT id, email, full_name, role, status FROM users WHERE id = ? LIMIT 1', [id],
  );
  if (!target) throw ApiError.notFound('Kullanıcı bulunamadı.');

  const finalRole = newRole ?? target.role;
  const finalStatus = newStatus ?? target.status;
  const me = actorId(req);

  // (a) Kendi yetkisini dusurme
  if (me !== null && Number(target.id) === me) {
    if (finalRole !== 'admin') {
      throw ApiError.badRequest(
        'Kendi yönetici rolünüzü kaldıramazsınız. Panelin yönetici olmadan kilitlenmemesi için '
        + 'bu değişikliği başka bir yönetici yapmalıdır.',
      );
    }
    if (finalStatus !== 'aktif') {
      throw ApiError.badRequest(
        'Kendi hesabınızı askıya alamaz ya da pasife çekemezsiniz. Bu değişikliği başka bir yönetici yapmalıdır.',
      );
    }
  }

  // (b) Geride aktif yonetici kaliyor mu?
  const targetWasActiveAdmin = target.role === 'admin' && target.status === 'aktif';
  const willBeActiveAdmin = finalRole === 'admin' && finalStatus === 'aktif';
  if (targetWasActiveAdmin && !willBeActiveAdmin) {
    const kalan = await countActiveAdmins(Number(target.id));
    if (kalan === 0) {
      throw ApiError.badRequest(
        'Bu değişiklik sistemdeki son aktif yöneticiyi kaldırırdı ve yönetim paneli kilitlenirdi. '
        + 'Önce başka bir kullanıcıyı yönetici yapın, sonra bu hesabı düşürün.',
      );
    }
  }

  const sets = [];
  const params = [];
  if (newRole && newRole !== target.role) { sets.push('role = ?'); params.push(newRole); }
  if (newStatus && newStatus !== target.status) { sets.push('status = ?'); params.push(newStatus); }

  if (sets.length === 0) {
    // Degisiklik yok: hata degil, mevcut kaydi dondur (istek idempotent).
    return res.json({
      data: await fetchUserForApi(id),
      degisti: false,
      mesaj: 'Gönderilen değerler mevcut kayıtla aynı; değişiklik yapılmadı.',
    });
  }

  params.push(id);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

  // Hesap artik aktif degilse acik oturumlari iptal et. Sema notu geregi
  // oturumlar veritabaninda; "askiya aldim ama kullanici hala icerde"
  // durumu olusmasin.
  let iptalEdilenOturum = 0;
  if (newStatus && newStatus !== 'aktif') {
    const r = await query(
      'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
      [id],
    );
    iptalEdilenOturum = Number(r?.affectedRows ?? 0);
  }

  return res.json({
    data: await fetchUserForApi(id),
    degisti: true,
    iptal_edilen_oturum: iptalEdilenOturum,
    mesaj: 'Kullanıcı güncellendi.',
  });
}));

/** Tek kullanicinin API sekli — PATCH yanitinda ayni alanlar donsun. */
async function fetchUserForApi(id) {
  const row = await queryOne(
    `SELECT u.id, u.email, u.full_name, u.title, u.role, u.status,
            u.tenant_id, t.tenant_key, t.name AS tenant_name,
            u.last_login_at, u.last_seen_at, u.created_at,
            u.failed_login_count, u.locked_until, u.must_change_password,
            p.position_code,
            (SELECT COUNT(*) FROM sessions s
              WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > NOW()) AS aktif_oturum
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ? LIMIT 1`,
    [id],
  );
  return row ? serializeUser(row) : null;
}

/**
 * POST /admin/users/:id/reset-link
 *
 * BILINCLI KARAR — BAGLANTI YANITTA DONER:
 * SMTP bozukken ya da hic yapilandirilmamisken kimse hesabina
 * erisemez durumda kalmasin. Yonetici bağlantıyı kopyalayip
 * kullaniciya elden (telefon, kurum ici mesaj) iletir. Alternatif
 * "e-posta ile gonder" idi; SMTP calismiyorsa bu sessiz bir
 * basarisizliktir ve demo gunu herkesi kilitler.
 *
 * Bedeli acikca kabul ediliyor: bağlantıyı goren yonetici o hesaba
 * girebilir. Bu yuzden (1) sure 2 SAAT, (2) tek kullanimlik, (3) ayni
 * kullanici icin acik duran onceki baglantilar kapatilir,
 * (4) islem `password_resets.created_by='admin'` olarak izlenir.
 */
const RESET_TTL_HOURS = 2;

router.post('/users/:id/reset-link', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz kullanıcı kimliği');
  const user = await queryOne(
    'SELECT id, email, full_name, status FROM users WHERE id = ? LIMIT 1', [id],
  );
  if (!user) throw ApiError.notFound('Kullanıcı bulunamadı.');

  // Onceki acik baglantilari kapat: her an tek gecerli baglanti olsun.
  await query(
    'UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()',
    [id],
  );

  // 32 bayt opak token. Veritabaninda YALNIZCA sha256 ozeti durur
  // (sessions.token_hash ile ayni gerekce: yedek sizarsa token ise yaramaz).
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await query(
    `INSERT INTO password_resets (user_id, token_hash, created_by, expires_at)
     VALUES (?, ?, 'admin', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [id, tokenHash, RESET_TTL_HOURS],
  );

  const row = await queryOne(
    'SELECT expires_at FROM password_resets WHERE token_hash = ? LIMIT 1', [tokenHash],
  );

  res.status(201).json({
    kullanici: { id: Number(user.id), email: user.email, full_name: user.full_name ?? null },
    token,
    // Sifirlama arayuzu /giris sayfasinda yasiyor: `?token=` gorunce
    // form "yeni sifre belirle" kipine geciyor (components/auth/LoginForm.tsx).
    url: `${appBaseUrl(req)}/giris?token=${encodeURIComponent(token)}`,
    expires_at: toIso(row?.expires_at),
    gecerlilik_saat: RESET_TTL_HOURS,
    uyari: `Bu bağlantı ${RESET_TTL_HOURS} saat geçerlidir ve yalnızca bir kez kullanılabilir. `
      + 'Kullanıcıya güvenli bir kanaldan iletin; bağlantıyı gören herkes bu hesabın şifresini değiştirebilir.',
  });
}));

/**
 * Sifirlama baglantisinin tabani.
 * Once acik yapilandirma (APP_BASE_URL), sonra vekilin bildirdigi konak.
 * Ikisi de yoksa bos doner ve baglanti goreli olur — yonetici yine
 * kopyalayabilir, sessiz basarisizlik olmaz.
 */
function appBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const host = req.get?.('x-forwarded-host') || req.get?.('host');
  if (!host) return '';
  const proto = req.get?.('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------
// BULTEN
// ---------------------------------------------------------------------

/**
 * POST /admin/digest/send — elle bulten gonderimi.
 *
 * `force: true` GONDERILIYOR: elle gonderim, zamanlanmis saat/gun
 * kontrolunu atlamali. Aksi halde dugme, gunun yanlis saatinde hicbir sey
 * yapmaz ve "bozuk" gorunur. Ayni kullaniciya AYNI GUN ikinci bulten yine
 * GITMEZ — o koruma `email_log.uq_email_once` ile veritabaninda ve
 * uygulama katmanindaki bir bayrakla gevsetilemez.
 *
 * Bulten servisi paralel bir ajanin dosyasi; yoksa 200 + durust aciklama
 * doner (500 degil; bkz. smtp/test gerekcesi).
 */
router.post('/digest/send', asyncHandler(async (req, res) => {
  const digest = (await getSettingForApi('digest')).value;
  if (!digest.enabled) {
    throw ApiError.badRequest(
      'Bülten kapalı. Elle gönderim yapabilmek için önce Bülten bölümünden bülteni açın.',
    );
  }

  const service = await loadDigestService();
  if (!service) {
    return res.status(200).json({
      aday: 0,
      gonderildi: 0,
      atlanan: 0,
      hata: 0,
      kuyruga_alindi: 0,
      aciklama: 'Bülten gönderim servisi (services/digestService.js) henüz yayında değil. '
        + 'Bülten ayarları kaydedildi; servis devreye girdiğinde bu düğme gönderimi başlatacak.',
    });
  }

  let out;
  try {
    out = await service.run({ force: true });
  } catch (err) {
    // Servis normalde zarf donduruyor; yine de 500'e dusmeyelim.
    return res.status(200).json({
      aday: 0, gonderildi: 0, atlanan: 0, hata: 1, kuyruga_alindi: 0,
      aciklama: `Bülten gönderimi başlatılamadı: ${err?.message ?? 'bilinmeyen hata'}`,
    });
  }

  const aday = Number(out?.candidates ?? 0);
  const gonderildi = Number(out?.sent ?? 0);
  const atlanan = Number(out?.skipped ?? 0);
  const hata = Number(out?.errors ?? 0);

  const parcalar = [];
  if (gonderildi > 0) parcalar.push(`${gonderildi} kullanıcıya gönderildi`);
  if (atlanan > 0) parcalar.push(`${atlanan} kullanıcı atlandı`);
  if (hata > 0) parcalar.push(`${hata} gönderimde hata`);

  let aciklama;
  if (aday === 0) {
    aciklama = 'Bülten gönderilecek kullanıcı bulunamadı. Aboneliği açık ve '
      + 'hesabı aktif bir kullanıcı olması gerekir.';
  } else if (parcalar.length === 0) {
    aciklama = `${aday} aday kullanıcı tarandı, gönderim yapılmadı.`;
  } else {
    aciklama = `${aday} aday kullanıcı tarandı: ${parcalar.join(', ')}.`;
  }
  if (out?.error) aciklama += ` Servis notu: ${out.error}`;

  return res.status(200).json({
    aday,
    gonderildi,
    atlanan,
    hata,
    // Bu servis eszamanli gonderiyor; kuyruk kavrami yok. Alan, posta
    // katmani kuyruga gecerse ayni sekli korumak icin duruyor.
    kuyruga_alindi: 0,
    aciklama,
    // Basarisizlik nedenlerinin dokumu — "neden gitmedi" ekranda yazili olsun.
    nedenler: out?.reasons && typeof out.reasons === 'object' ? out.reasons : null,
  });
}));

/**
 * Bulten servisini dinamik yukler.
 *
 * Beklenen sozlesme (services/digestService.js):
 *   runDigest({force, dryRun?, userIds?, limit?})
 *     -> {candidates, sent, skipped, errors, reasons, error?}   (FIRLATMAZ)
 */
async function loadDigestService() {
  const candidates = ['../services/digestService.js', '../services/newsletterService.js'];
  for (const path of candidates) {
    try {
      const mod = await import(path);
      const run = mod.runDigest ?? mod.default?.runDigest ?? mod.send ?? mod.default?.send;
      if (typeof run === 'function') return { run };
    } catch {
      // Aday yok — sonrakine gec.
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// GONDERIM KAYDI
// ---------------------------------------------------------------------

const EMAIL_SORTS = Object.freeze({
  yeni: 'e.queued_at DESC, e.id DESC',
  eski: 'e.queued_at ASC, e.id ASC',
  gonderim: 'e.sent_at IS NULL, e.sent_at DESC',
});

/** GET /admin/email-log — sayfali gonderim kaydi. Query: `status, kind, q, sort, page, limit` */
router.get('/email-log', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const status = pickFromAllowList(req.query.status, EMAIL_STATUSES);
  const kind = pickFromAllowList(req.query.kind, EMAIL_KINDS);
  const sort = EMAIL_SORTS[qs(req.query.sort) ?? ''] ?? EMAIL_SORTS.yeni;
  const q = qs(req.query.q);

  const where = [];
  const params = [];
  if (status) { where.push('e.status = ?'); params.push(status); }
  if (kind) { where.push('e.kind = ?'); params.push(kind); }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push('(e.to_email LIKE ? OR e.subject LIKE ?)');
    params.push(like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRow, rows, statusRows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total FROM email_log e ${whereSql}`, params),
    query(
      `SELECT e.id, e.user_id, e.to_email, e.kind, e.digest_date, e.subject,
              e.status, e.error, e.provider_message_id, e.attempt_count,
              e.report_id, e.queued_at, e.sent_at, e.article_ids,
              u.full_name AS user_name
         FROM email_log e
         LEFT JOIN users u ON u.id = e.user_id
         ${whereSql}
        ORDER BY ${sort}
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    // Suzgec ciplerindeki sayilar: filtreden BAGIMSIZ toplamlar.
    query('SELECT status, COUNT(*) AS adet FROM email_log GROUP BY status'),
  ]);

  const durumlar = {};
  for (const s of EMAIL_STATUSES) durumlar[s] = 0;
  for (const r of statusRows) durumlar[String(r.status)] = Number(r.adet ?? 0);

  const total = Number(countRow?.total ?? 0);
  res.json({
    data: rows.map((r) => ({
      id: Number(r.id),
      user_id: r.user_id === null ? null : Number(r.user_id),
      user_name: r.user_name ?? null,
      to_email: r.to_email,
      kind: r.kind,
      digest_date: r.digest_date ? String(r.digest_date).slice(0, 10) : null,
      subject: r.subject ?? null,
      status: r.status,
      error: r.error ?? null,
      provider_message_id: r.provider_message_id ?? null,
      attempt_count: Number(r.attempt_count ?? 0),
      report_id: r.report_id === null ? null : Number(r.report_id),
      article_count: (parseJsonColumn(r.article_ids, []) || []).length,
      queued_at: toIso(r.queued_at),
      sent_at: toIso(r.sent_at),
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
    meta: { durumlar, turler: EMAIL_KINDS },
  });
}));

// ---------------------------------------------------------------------
// NACE KAPSAMI
// ---------------------------------------------------------------------

/**
 * GET /admin/nace-coverage — her NACE kaleminin kac haberi var.
 *
 * NEDEN SQL'DE DEGIL JS'TE HESAPLANIYOR:
 * `entities.sektor` SERBEST METIN ("İmalat Sanayi", "Demir-Celik",
 * "Beyaz Esya"), `lib/sectors.js` ise NORMALIZE SLUG bekliyor
 * ("imalat-sanayi", "demir-celik", "beyaz-esya"). Eslesme
 * `slugifyTag()` ile kuruluyor; bunu SQL'de yapmak 26 kalem x 119
 * varyant icin okunamaz bir LIKE yigini olurdu. Korpus 131 haber,
 * tek gecis JS'te milisaniyeler suruyor.
 *
 * `tags.kind='sektor'` KULLANILMIYOR — sectors.js'in bas yorumunda
 * olculmus gerekce: 12 sektor etiketinin yalnizca 5'i ayakta ve
 * kullanim sayilari 0-6 arasinda. Gercek sinyal `entities.sektor`.
 *
 * Bu ucu `/durum` sayfasi da okuyacak: kullanici hangi sektorun verisi
 * ince gorsun. Bu yuzden yanitta "zayif" bayragi ve eslesmeyen terim
 * listesi de var — eksigin NEREDE oldugu gorunsun.
 */
const ZAYIF_ESIK = 5;   // Tekil haber sayisi bunun altindaysa "veri ince".

/**
 * Hesap DISA ACIK: `/durum` sayfasi oturumsuz aciliyor ve bu veriyi okumak
 * zorunda, ama `/admin/*` yonetici istiyor. Ayni hesabi iki yerde yazmak bu
 * projede uc kez soruna yol acti (esikler uc yerde, tags.kind, bant) - bu
 * yuzden tek fonksiyon, iki cagiran: buradaki yonetici rotasi ve
 * `routes/meta.js` icindeki acik salt-okunur es adres.
 *
 * Yanitta hassas veri YOK: yalnizca sektor basina haber sayilari.
 */
export async function computeNaceCoverage() {
  const rows = await query(
    `SELECT id, entities, importance_band, published_at, is_duplicate
       FROM articles`,
  );

  // Kalem basina sayac. Map kullaniliyor: kod -> birikimli sayim.
  const acc = new Map();
  for (const s of NACE_SECTORS) {
    acc.set(s.code, {
      code: s.code,
      label: s.label,
      group: s.group,
      article_count: 0,
      unique_count: 0,
      bands: { KRITIK: 0, YUKSEK: 0, ORTA: 0, DUSUK: 0 },
      last_published_at: null,
      // Hangi corpus terimi tuttu — "neden bu sektore sayildi" sorusu
      // sonradan ancak boyle yanitlanir.
      matched_terms: {},
    });
  }

  const crosscutting = new Set(CROSSCUTTING);
  const unmatched = new Map();      // slug -> adet (hicbir kaleme girmeyen terimler)
  let sektorlu = 0;
  let sektorsuz = 0;
  let kesisenSayac = 0;
  let toplam = 0;
  let tekilToplam = 0;

  for (const row of rows) {
    toplam += 1;
    const unique = Number(row.is_duplicate ?? 0) === 0;
    if (unique) tekilToplam += 1;

    const entities = parseJsonColumn(row.entities, {}) || {};
    const raw = Array.isArray(entities.sektor) ? entities.sektor : [];
    const slugs = [...new Set(raw.map((t) => slugifyTag(t)).filter(Boolean))];

    if (slugs.length === 0) { sektorsuz += 1; continue; }
    sektorlu += 1;

    const slugSet = new Set(slugs);
    const hitCodes = new Set();

    for (const sector of NACE_SECTORS) {
      const hits = sector.corpus.filter((t) => slugSet.has(t));
      if (hits.length === 0) continue;
      hitCodes.add(sector.code);
      const cell = acc.get(sector.code);
      cell.article_count += 1;
      if (unique) cell.unique_count += 1;
      const band = String(row.importance_band ?? '');
      if (band in cell.bands) cell.bands[band] += 1;
      const pub = row.published_at ? new Date(row.published_at) : null;
      if (pub && (!cell.last_published_at || pub > cell.last_published_at)) {
        cell.last_published_at = pub;
      }
      for (const h of hits) cell.matched_terms[h] = (cell.matched_terms[h] ?? 0) + 1;
    }

    if (slugs.some((s) => crosscutting.has(s))) kesisenSayac += 1;

    // Hicbir NACE kalemine ve kesisen listeye girmeyen terimler: sozlugun
    // buyumesi gereken yer. Kullaniciya degil, bize yol gosterir.
    if (hitCodes.size === 0) {
      for (const s of slugs) {
        if (crosscutting.has(s)) continue;
        unmatched.set(s, (unmatched.get(s) ?? 0) + 1);
      }
    }
  }

  const items = NACE_SECTORS.map((s) => {
    const cell = acc.get(s.code);
    return {
      code: cell.code,
      label: cell.label,
      group: cell.group,
      article_count: cell.article_count,
      unique_count: cell.unique_count,
      bands: cell.bands,
      last_published_at: cell.last_published_at ? cell.last_published_at.toISOString() : null,
      matched_terms: Object.entries(cell.matched_terms)
        .sort((a, b) => b[1] - a[1])
        .map(([term, adet]) => ({ term, adet })),
      // Uc durum, renkten bagimsiz okunabilir olsun diye metin:
      //   'yok' (hic haber), 'zayif' (esigin altinda), 'yeterli'
      durum: cell.unique_count === 0 ? 'yok' : (cell.unique_count < ZAYIF_ESIK ? 'zayif' : 'yeterli'),
      zayif: cell.unique_count < ZAYIF_ESIK,
    };
  });

  return {
    data: items,
    ozet: {
      nace_kalem_sayisi: NACE_SECTORS.length,
      haber: toplam,
      tekil_haber: tekilToplam,
      sektor_bilgisi_olan: sektorlu,
      sektor_bilgisi_olmayan: sektorsuz,
      kapsanan_kalem: items.filter((i) => i.article_count > 0).length,
      bos_kalem: items.filter((i) => i.article_count === 0).map((i) => i.code),
      zayif_kalem: items.filter((i) => i.article_count > 0 && i.zayif).map((i) => i.code),
      kesisen_haber: kesisenSayac,
      zayif_esik: ZAYIF_ESIK,
    },
    // En sik gecen eslesmeyen terimler — sozluk buyutulecekse burasi.
    eslesmeyen_terimler: [...unmatched.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([term, adet]) => ({ term, adet })),
  };
}

router.get('/nace-coverage', asyncHandler(async (req, res) => {
  res.json(await computeNaceCoverage());
}));

// ---------------------------------------------------------------------
// Bilinmeyen /admin yolu — 404 (yetki kontrolunden SONRA, yani yetkisiz
// istek buraya hic gelmez ve var olan uclari kesfetmeye yaramaz).
// ---------------------------------------------------------------------
router.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Yönetim uç noktası bulunamadı: ${req.method} /api/admin${req.path}`,
    },
  });
});

export default router;
