// ---------------------------------------------------------------------
// /api/meta — SECIM LISTELERI (taksonomi)
//
// OTURUM GEREKTIRMEZ. Sebep: kayit ve onboarding formlari bu listeleri
// oturum ACILMADAN once okumak zorunda. Sozlesmedeki "acik kalan tek
// ucler: /health, /auth/*, /meta/*" kurali tam olarak bu yuzden var.
//
// Listeler DB'de tablo DEGIL, lib/positions.js ve lib/sectors.js'te kod
// olarak duruyor (importance.js WEIGHTS emsali): surumlenir, saf
// fonksiyonla test edilir, diff'te okunur. Bu uc onlari YENIDEN
// TANIMLAMAZ, yalnizca ihrac eder — arayuzde ikinci bir kopya olussa
// esikler uc ayri yerde kayardi.
// ---------------------------------------------------------------------
import { Router } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler, pickFromAllowList, qs } from '../lib/http.js';
import {
  DENSITY, LAYOUTS, LAYOUT_LABELS, POSITIONS, POSITION_LABELS,
  POSITION_LAYOUT, TIME_BUDGETS,
} from '../lib/positions.js';
import { CROSSCUTTING, NACE_SECTORS } from '../lib/sectors.js';
import { computeNaceCoverage } from './admin.js';

const router = Router();

/** tags.kind ENUM'u ile birebir. */
const TAG_KINDS = ['konu', 'sektor', 'kurum', 'mevzuat', 'cografya'];

/**
 * Sektor kalemi disa acilan sekli.
 *
 * `corpus` KASTEN DISARI VERILMEZ: o alan entities.sektor serbest metnini
 * NACE koduna baglayan IC eslestirme sozlugu ("celik", "aluminyum", ...).
 * Arayuze sizmasi iki zarar verir: (1) kullaniciya anlamsiz teknik veri,
 * (2) eslestirme mantigi disa acilan bir sozlesme haline gelir ve
 * degistirilemez olur.
 */
function serializeSector(s) {
  return { code: s.code, label: s.label, group: s.group };
}

/** Sektorler gruplanmis halde — form "aile" basligiyla gostermek isterse. */
function sectorGroups() {
  const map = new Map();
  for (const s of NACE_SECTORS) {
    if (!map.has(s.group)) map.set(s.group, []);
    map.get(s.group).push(s.code);
  }
  return [...map.entries()].map(([group, codes]) => ({ group, codes }));
}

// ---------------------------------------------------------------------
// GET /api/meta/taxonomy
// ---------------------------------------------------------------------
router.get('/taxonomy', (req, res) => {
  res.json({
    data: {
      // 8 pozisyon -> etiket + TURETILMIS panel duzeni.
      positions: POSITIONS.map((code) => ({
        code,
        label: POSITION_LABELS[code],
        layout: POSITION_LAYOUT[code],
      })),

      // 4 panel duzeni.
      layouts: LAYOUTS.map((code) => ({ code, label: LAYOUT_LABELS[code] })),

      // Esleme ayrica ham haliyle de veriliyor: arayuz "bu pozisyonu
      // secerseniz su duzeni gorursunuz" onizlemesini tek okumayla kurar.
      position_layout: POSITION_LAYOUT,

      // NACE bolumleri (iç `corpus` alani haric).
      sectors: NACE_SECTORS.map(serializeSector),
      sector_groups: sectorGroups(),
      // Sektorden bagimsiz, herkesi ilgilendiren slug'lar — arayuz
      // "bunlar her profilde taban puan verir" diye gosterebilir.
      crosscutting_tags: CROSSCUTTING,

      // Vakit butcesi ve karsilik gelen icerik yogunlugu.
      time_budgets: TIME_BUDGETS,
      density: DENSITY,
    },
  });
});

// ---------------------------------------------------------------------
// GET /api/meta/interests
//
// Ilgi alani seciminin kaynagi `tags` tablosu, KULLANIMA GORE AZALAN.
// Sebep: 200 etiketi alfabetik gostermek kullaniciya hicbir sey
// anlatmiyor; korpusta gercekten gecen etiket once gelmeli, cunku hic
// haberde gecmeyen bir ilgi alanini secmek siralamayi hic degistirmez.
//
// usage_count tekillestirilmis haberler uzerinden (is_duplicate = 0),
// /api/tags ile AYNI tanim — iki uc ayni sayiyi farkli hesaplamasin.
// ---------------------------------------------------------------------
router.get('/interests', asyncHandler(async (req, res) => {
  const kind = pickFromAllowList(req.query.kind, TAG_KINDS);

  const params = [];
  let where = '';
  if (kind) { where = 'WHERE t.kind = ?'; params.push(kind); }

  // LIMIT parametrelenmiyor ama Number.parseInt'ten gecip 1..500'e
  // sikistirildigi icin string birlestirme guvenli (articles.js ile ayni desen).
  const rawLimit = Number.parseInt(qs(req.query.limit) ?? '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 200;

  const rows = await query(
    `SELECT t.slug, t.label, t.kind, t.weight,
            COUNT(a.id) AS usage_count
       FROM tags t
       LEFT JOIN article_tags at ON at.tag_id = t.id
       LEFT JOIN articles a ON a.id = at.article_id AND a.is_duplicate = 0
       ${where}
      GROUP BY t.id, t.slug, t.label, t.kind, t.weight
      ORDER BY usage_count DESC, t.weight DESC, t.slug ASC
      LIMIT ${limit}`,
    params,
  );

  res.json({
    data: rows.map((r) => ({
      slug: r.slug,
      label: r.label,
      kind: r.kind,
      weight: Number(r.weight),
      usage_count: Number(r.usage_count),
    })),
    total: rows.length,
    // Sozlesme: user_profiles.interest_tag_slugs en cok 12 slug tasir.
    max_selection: 12,
  });
}));

/**
 * GET /api/meta/nace-coverage — ACIK, salt okunur.
 *
 * `/durum` sayfasi oturumsuz aciliyor ve hangi sektorun verisi ince oldugunu
 * gostermek zorunda. `/admin/nace-coverage` ayni veriyi dondurur ama yonetici
 * ister; bu adres onun acik esidir ve AYNI fonksiyonu cagirir (iki ayri
 * hesaplama olmasin).
 *
 * Hassas veri icermiyor: yalnizca sektor basina haber sayilari. Kullanicinin
 * NACE listesi secerken "bu sektorun verisi zayif" bilgisini giris yapmadan
 * gorebilmesi kasitli - eksigi saklamak yerine gostermeyi tercih ediyoruz.
 */
router.get('/nace-coverage', asyncHandler(async (req, res) => {
  res.json(await computeNaceCoverage());
}));

export default router;
