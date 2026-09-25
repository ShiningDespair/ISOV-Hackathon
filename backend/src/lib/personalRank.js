// ---------------------------------------------------------------------
// KISISEL SIRALAMA MOTORU — SAF
//
// importance.js'in yapisi BIREBIR taklit edildi: Object.freeze agirlik
// nesnesi, bilinmeyen bilesen icin NOTR TABAN, clamp, round2, `now`
// disaridan. Sebep de ayni: hem API (GET /articles?sort=kisisel), hem gece
// isi, hem birim testi AYNI sonucu uretsin. DB/IO YOK.
//
// ---------------------------------------------------------------------
// HICBIR BILESENIN TABANI 0 DEGIL
// Tabani 0 olan bir bilesen, eslesme olmadiginda haberi tek basina
// sifirlar ve bileseni fiilen FILTREYE cevirir. Bu sistem SIRALAR,
// FILTRELEMEZ: en kotu durumda kullanici global siralamayi gorur.
// ---------------------------------------------------------------------
import { clamp100, computeKeyword, round2 } from './importance.js';
import { POSITION_TOPIC_WEIGHTS, normalizePosition } from './positions.js';
import { computeSectorMatch, SECTOR_SCORES } from './sectors.js';

/** CONTRACT.md "Kisiselestirme" tablosundaki agirliklar — kaynak hali. */
export const CONTRACT_WEIGHTS = Object.freeze({
  position_topic: 0.30,
  sector_match: 0.22,
  semantic: 0.20,
  interest_tags: 0.14,
  region: 0.08,
  source_affinity: 0.06,
});

/** Eslesme/veri yokken kullanilan NOTR TABANLAR. Hicbiri 0 degil. */
export const BASELINES = Object.freeze({
  position_topic: 50,
  sector_match: SECTOR_SCORES.alakasiz, // 35
  semantic: 50,
  interest_tags: 20,
  region: 45,
  source_affinity: 50,
});

export const COMPONENTS = Object.freeze(Object.keys(CONTRACT_WEIGHTS));

/**
 * KALIBRASYON SONUCU — ATILAN BILESENLER.
 *
 * Kural (CONTRACT.md): "her bilesenin 115 tekil haber uzerindeki standart
 * sapmasi olculecek. Sapmasi 8 puanin altindaki bilesen agirliklandirilmaz,
 * ATILIR ve agirligi position_topic'e aktarilir."
 *
 * Sebep: sapmasi sifira yakin bir bilesen her habere pratikte ayni puani
 * verir; agirlikli toplamda bu GIZLI BIR SABIT TERIMDIR. Skoru yukari
 * kaydirir, hicbir seyi siralamaz ve "6 bilesenle kisiselestiriyoruz"
 * cumlesini yanlis cikarir.
 *
 * OLCUM (8 sahte pozisyon profili x 115 tekil haber = 920 deger, 2026-09-19):
 *   region           sapma 26,25  -> KALDI
 *   sector_match     sapma 23,28  -> KALDI
 *   position_topic   sapma 18,13  -> KALDI
 *   semantic         sapma 17,86  -> KALDI
 *   interest_tags    sapma 13,12  -> KALDI
 *   source_affinity  sapma  0,00  -> ATILDI (esik 8)
 *
 * `source_affinity` bugun HER HABERDE 50: `tenant_source_prefs`te tek satir
 * var (o da is_watched=1, yani sapma uretmiyor) ve okuma gecmisi tablosu
 * (`user_article_prefs.read_at`) BOS — henuz hic kullanici yok. Bilesen
 * hesaplanmaya devam eder ve `signals` icinde seffaflik icin doner; yalnizca
 * AGIRLIGI 0'dir. Okuma gecmisi birikince kalibrasyon yeniden kosulur ve
 * bilesen kendi agirligini geri alir.
 */
export const DROPPED_COMPONENTS = Object.freeze(['source_affinity']);

/** Kalibrasyon esigi — CONTRACT.md. */
export const MIN_STDDEV = 8;

/**
 * Atilan bilesenlerin agirligini `position_topic`'e aktarir.
 * Toplam DAIMA 1.00 kalir; aksi halde nihai skorun olcegi kayar.
 */
export function effectiveWeights(base = CONTRACT_WEIGHTS, dropped = DROPPED_COMPONENTS) {
  const out = { ...base };
  let salvaged = 0;
  for (const key of dropped) {
    if (out[key] === undefined || key === 'position_topic') continue;
    salvaged += out[key];
    out[key] = 0;
  }
  out.position_topic = round2(out.position_topic + salvaged);
  return out;
}

export const WEIGHTS = Object.freeze(effectiveWeights());

/** user_article_scores.weights_version — kalibrasyon degisince ARTIRILIR. */
export const WEIGHTS_VERSION = 'kisisel-v1-kalibre';

/** Harmanlama (CONTRACT.md): final = 0.62*global_normalized + 0.38*personal */
export const GLOBAL_SHARE = 0.62;
export const PERSONAL_SHARE = 0.38;

/** Onaysiz dosya (topic_threads.is_confirmed=0) etkisi TAVANI. */
export const THREAD_BONUS_MAX = 4;

/** 0..100 araligina sikistirir (importance.js clamp100 ile ayni sozlesme). */
export function clamp(value, min, max, fallback = min) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// =====================================================================
// BILESENLER
// =====================================================================

/**
 * POZISYON-KONU UYUMU (agirlik 0.30 + atilanlarin devri, taban 50)
 *
 * `computeKeyword()` YENIDEN YAZILMADI — oradaki doyum problemi bir kez
 * cozuldu (agirliklari toplayip 100'de kirpmak bileseni sabite ceviriyordu).
 * Tek fark: agirlik kaynagi `tags.weight` yerine POSITION_TOPIC_WEIGHTS.
 * Eslesme yoksa computeKeyword zaten NOTR 50 donuyor = tabanimiz.
 *
 * `kategori:xxx` anahtarlari articles.category ile eslesir; korpusta
 * etiketler seyrek (365 etiketin cogu tek haberde), kategori ise 115/115
 * haberde dolu — ayrimin buyuk kismi oradan geliyor.
 */
export function positionTopicScore(article, position) {
  const matrix = POSITION_TOPIC_WEIGHTS[normalizePosition(position)] || {};
  const matched = [];

  for (const slug of article?.tagSlugs || []) {
    const w = matrix[slug];
    if (Number.isFinite(w)) matched.push(w);
  }
  const category = article?.category ? `kategori:${article.category}` : null;
  if (category && Number.isFinite(matrix[category])) matched.push(matrix[category]);

  return round2(computeKeyword(matched));
}

/**
 * SEKTOR UYUMU (agirlik 0.22, taban 35)
 * sectors.js computeSectorMatch() — basamaklari ve "bos akis gormez"
 * garantisi orada.
 */
export function sectorScore(article, profile) {
  return round2(computeSectorMatch(
    article?.sectorSlugs || [],
    profile?.primary_sector_code ?? null,
    profile?.secondary_sector_codes || [],
  ));
}

/**
 * ANLAMSAL YAKINLIK (agirlik 0.20, taban 50) — SIRA TABANLI.
 *
 * MUTLAK KOSINUS KULLANILMAZ. Olculen makale-makale kosinus dagilimi
 * sikisik (medyan 0,8585, p99 0,9175); mutlak degeri 0..100'e acmak
 * bileseni SABIT TERIME cevirir — `computeKeyword`un ilk surumunun
 * dustugu tuzagin aynisi (ortalama 93,4, sifir ayirt etme gucu).
 *
 * Yerine `bandCutoffs()` felsefesi: aday kumesi ICINDEKI SIRA.
 *   clamp(100 - 65 * (rank / N), 35, 100)
 * Listede yok / profil vektoru yok / Qdrant kapali -> 50 (taban).
 *
 * @param {number|null} rank  0 tabanli sira; null ise taban doner
 * @param {number} total      aday kume buyuklugu (N)
 */
export function semanticScore(rank, total) {
  const n = Number(total);
  const r = Number(rank);
  if (!Number.isFinite(r) || r < 0 || !Number.isFinite(n) || n <= 0) {
    return BASELINES.semantic;
  }
  return round2(clamp(100 - 65 * (r / n), 35, 100, BASELINES.semantic));
}

/**
 * ILGI ALANI ETIKETLERI (agirlik 0.14, taban 20)
 *
 * Basamakli ve DOYAN: bir yigin zayif eslesme tek bir gercek eslesmeyi
 * golgelemesin, ama tek eslesme de tavana vurmasin (computeKeyword'un
 * ayni dersi).
 *
 * Sessize alinan etiket (muted_tag_slugs) CEZA yazar: kullanicinin acik
 * sinyali tabanin altina inebilir. Taban 20, dip 10 — 0 DEGIL, cunku 0
 * bileseni filtreye cevirirdi. 0.14 agirlikta en kotu durum kisisel skorda
 * -1,4 puan, nihai skorda -0,5 puan: siralar, silmez.
 */
export const INTEREST_STEPS = Object.freeze([20, 55, 75, 88, 100]);
export const MUTED_PENALTY = 18;
export const INTEREST_FLOOR = 10;

export function interestTagScore(article, profile) {
  const tags = new Set(article?.tagSlugs || []);
  const interest = profile?.interest_tag_slugs || [];
  const muted = profile?.muted_tag_slugs || [];

  let hits = 0;
  for (const slug of interest) if (tags.has(slug)) hits += 1;
  let mutedHits = 0;
  for (const slug of muted) if (tags.has(slug)) mutedHits += 1;

  const raw = INTEREST_STEPS[Math.min(hits, INTEREST_STEPS.length - 1)];
  return round2(clamp(raw - MUTED_PENALTY * mutedHits, INTEREST_FLOOR, 100, BASELINES.interest_tags));
}

/**
 * BOLGE ODAGI (agirlik 0.08, taban 45)
 *
 * KURESEL haberler odagin disinda bile 70 alir: "kuresel" bir olay
 * (WTO karari, petrol fiyati) hangi bolgeyi secmis olursa olsun ISO/ISOV
 * uyesini ilgilendirir. Kullanici hic bolge secmemisse bilesen HERKESE
 * ayni tabani verir — siralamada etkisiz, kimseyi cezalandirmaz.
 */
export const REGION_SCORES = Object.freeze({ odakta: 100, kuresel: 70, disinda: 45 });

export function regionScore(article, profile) {
  const focus = Array.isArray(profile?.region_focus) ? profile.region_focus : [];
  if (focus.length === 0) return BASELINES.region;
  const region = String(article?.region || '');
  if (focus.includes(region)) return REGION_SCORES.odakta;
  if (region === 'KURESEL') return REGION_SCORES.kuresel;
  return REGION_SCORES.disinda;
}

/**
 * KAYNAK YAKINLIGI (agirlik 0.06 — KALIBRASYONDA ATILDI, taban 50)
 *
 * Iki sinyal: kiracinin izleme tercihi (tenant_source_prefs) ve
 * kullanicinin okuma gecmisi (user_article_prefs.read_at say).
 * Izlemeyi BIRAKMAK bile 30'a iner, 0'a DEGIL: izlenmeyen kaynak
 * `watched_only=1` suzgeciyle gizlenir, siralamada silinmez.
 *
 * Bugun her haberde 50 donuyor (ne tercih sapmasi ne okuma gecmisi var);
 * bu yuzden agirligi 0. Bkz. DROPPED_COMPONENTS.
 */
export const SOURCE_SCORES = Object.freeze({ izlenmiyor: 30, taban: 50 });
export const READ_BONUS_STEPS = Object.freeze([0, 12, 12, 22, 22, 22, 30]);

export function sourceAffinityScore(article, profile) {
  const slug = String(article?.sourceSlug || '');
  const unwatched = profile?.unwatched_source_slugs instanceof Set
    ? profile.unwatched_source_slugs
    : new Set(profile?.unwatched_source_slugs || []);
  const readCounts = profile?.source_read_counts instanceof Map
    ? profile.source_read_counts
    : new Map(Object.entries(profile?.source_read_counts || {}));

  const base = unwatched.has(slug) ? SOURCE_SCORES.izlenmiyor : SOURCE_SCORES.taban;
  const reads = Number(readCounts.get(slug) ?? 0);
  const bonus = READ_BONUS_STEPS[Math.min(Math.max(0, reads), READ_BONUS_STEPS.length - 1)];
  return round2(clamp(base + bonus, 25, 100, BASELINES.source_affinity));
}

// =====================================================================
// TOPLAMA
// =====================================================================

/**
 * Tum bilesenleri hesaplar. Agirliklandirmadan ONCEKI ham degerler (0..100)
 * — `signals` JSON'una yazilan ve `?reveal=1` ile gosterilen sekil budur.
 *
 * @param {object} article  { id, tagSlugs[], category, sectorSlugs[], region, sourceSlug }
 * @param {object} profile  user_profiles satiri + turetilmis kumeler
 * @param {object} [extra]  { semanticRank, semanticTotal }
 */
export function personalComponents(article, profile, extra = {}) {
  return {
    position_topic: positionTopicScore(article, profile?.position_code),
    sector_match: sectorScore(article, profile),
    semantic: semanticScore(extra.semanticRank ?? null, extra.semanticTotal ?? 0),
    interest_tags: interestTagScore(article, profile),
    region: regionScore(article, profile),
    source_affinity: sourceAffinityScore(article, profile),
  };
}

/** Agirlikli toplam 0..100. Agirliklar toplami 1.00 oldugu icin bolme yok. */
export function personalScore(components, weights = WEIGHTS) {
  let score = 0;
  for (const key of COMPONENTS) {
    const w = weights[key] || 0;
    if (w === 0) continue;
    const raw = clamp100(components?.[key], BASELINES[key]);
    score += raw * w;
  }
  return round2(clamp(score, 0, 100, 0));
}

/**
 * GLOBAL SKORUN NORMALIZASYONU.
 *
 * `importance_score` TANIMI GEREGI 0..100: alti bilesenin (her biri 0..100)
 * agirlikli toplami, agirliklar 1.00. Yani "normalize" edilmis hali ZATEN
 * kendisi; bu fonksiyon araliga sikistirip gecirir.
 *
 * OLCULEN ALTERNATIF ve NEDEN REDDEDILDI (aday kumesi icinde min-max):
 * ham dagilim sikisik (bugun 48,00-76,38, sapma 5,91) oldugu icin min-max
 * cazip gorunuyor. Olculdu (8 profil x 115 haber):
 *
 *   okuma      global etki   kisisel etki   oran     mevzuat-hukuk <-> tesvik-finansman
 *   ham         3,66          4,27          0,86:1   1/10  (omurga harici ilk 10)
 *   min-max    12,91          4,27          3,03:1   7/10
 *
 * Beyan edilen agirlik orani 0,62/0,38 = 1,63:1. Min-max okumasi bunu
 * 3,03:1'e cikariyor — kisisel skoru EZIYOR: iki uc pozisyonun ilk 10'u
 * 7/10 ortusuyor, yani konu agirlik matrisi neredeyse hicbir sey
 * degistirmiyor. Ham okuma 0,86:1 ile beyan edilene daha yakin ve ayni
 * cift 1/10'a duser: siralama gercekten kisisellesir.
 *
 * Ikinci gerekce: min-max NIHAI SKORU ADAY KUMESINE BAGLAR — ayni haber
 * farkli suzgeclerde farkli `final_score` alir ve skorlar kumeler arasi
 * karsilastirilamaz hale gelir. Ham okumada `final_score` mutlak ve
 * aciklanabilir kalir.
 *
 * Global omurganin ilk sirada durmasi bu okumayla zayiflamiyor: KRITIK
 * bandinin `is_pinned` sabitlemesi (asagida) o isi YAPISAL olarak yapiyor.
 */
export function normalizeGlobal() {
  return (value) => round2(clamp100(value, 50));
}

/**
 * HARMANLAMA + KRITIK OMURGA TABANI (CONTRACT.md):
 *
 *   final = 0.62 * global_normalized + 0.38 * personal
 *   if (band === 'KRITIK') { final = max(final, global_normalized); is_pinned = 1 }
 *
 * Omurga, filtre balonuna karsi YAPISAL korumadir: korpusun en onemli
 * %12'si (bant yuzdelik tabanli) hicbir profilde kisisel skor yuzunden
 * global sirasinin ALTINA dusemez ve listede sabitlenir. Kullanici
 * "ihracat" secmemis olsa da CBAM/anti-damping haberini gorur.
 *
 * `threadBonus`: onaysiz/onayli dosya gelismesi etkisi, TAVAN +4
 * (THREAD_BONUS_MAX). Omurga tabanindan SONRA eklenir ki tabani asindirmasin.
 */
export function blend({ globalNormalized, personal, band, threadBonus = 0 } = {}) {
  const g = clamp100(globalNormalized, 50);
  const p = clamp100(personal, 50);
  let final = GLOBAL_SHARE * g + PERSONAL_SHARE * p;
  const isPinned = String(band) === 'KRITIK';
  if (isPinned) final = Math.max(final, g);
  final += clamp(threadBonus, 0, THREAD_BONUS_MAX, 0);
  return { final_score: round2(final), is_pinned: isPinned ? 1 : 0 };
}

/**
 * Siralama karsilastiricisi — `is_pinned` KULLANILMAZ.
 *
 * ONCEKI SURUM HATALIYDI: `is_pinned DESC` ilk anahtardi. Korpusta 11 KRITIK
 * haber var, dolayisiyla ilk 11 slot HER KULLANICIDA ayni 11 haberdi ve ilk
 * 10 tamamen onlarin icinden geliyordu. Olculdu: 8 pozisyon arasinda cift
 * ortusmesi 9-10/10, yani kisiselestirmenin gorunur etkisi SIFIR. Filtre
 * balonu korumasi, korudugu seyi yok ediyordu.
 *
 * CONTRACT'in soyledigi bir ORAN'di ("her 5 slotun en az 1'i sabitlenmis"),
 * sert siralama anahtari degil. Oran `interleavePinned()` ile uygulanir.
 */
export function comparePersonal(a, b) {
  if (b.final_score !== a.final_score) return b.final_score - a.final_score;
  const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
  const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
  if (tb !== ta) return tb - ta;
  return Number(b.id) - Number(a.id);
}

/** Kac slotta bir sabitlenmis (KRITIK) haber garanti edilir. */
export const DEFAULT_PIN_RATIO = 5;

/**
 * FILTRE BALONU KORUMASI — oran tabanli serpistirme.
 *
 * Her `ratio` slotun ILKI korpus geneli KRITIK habere ayrilir; geri kalan
 * slotlar kisisel siralamaya gider. Somut sonuc:
 *   2 dk / 5 haber   -> 1 sabitlenmis (CONTRACT: "en az 1")
 *   5 dk / 12 haber  -> 3 sabitlenmis
 *  10 dk / 20 haber  -> 4 sabitlenmis (CONTRACT: "en cok 7")
 *
 * ORAN DEGISMEDI, KALEM SAYISI DEGISTI. Ucuncu kademe 15 dk / 30 kalemden
 * 10 dk / 20 kaleme indi (docs/SADELESTIRME.md §4), dolayisiyla o
 * kademedeki sabitlenmis slot sayisi olculerek 6'dan 4'e dustu
 * (ceil(20/5) = 4; olcum: 20 kalemlik bas kesitte 4 `pinned_slot`).
 * `ratio = 5` ayni kaldi: bu deger olculerek kalibre edildi ve her iki
 * sinirin (en az 1, en cok 7) icinde kaliyor.
 *
 * Sabitlenmis haberler kisisel akista da yarisabilir: `scored` listesi
 * hepsini icerir ve kullaniciya gercekten uygun bir KRITIK haber kendi
 * kisisel skoruyla daha one gelebilir. Sabitlenmis kuyruk yalnizca
 * ASGARI kapsamayi garanti eder, tavan koymaz.
 *
 * ILGI ALANI YUVASI (`interest`) verilirse ayni dongude ikinci bir oran
 * uygulanir; ayrintisi `pickInterestSlot()` ustunde. `interest` verilmezse
 * davranis BIREBIR onceki surumdur (sabitlenmis slotlar ayni yerde, ayni
 * sayida).
 *
 * @param {Array} scored  comparePersonal ile siralanmis tum aday kume
 * @param {object} opts   { ratio, interest: { slugs, muted, ratio } }
 */
export function interleavePinned(scored = [], { ratio = DEFAULT_PIN_RATIO, interest = null } = {}) {
  const list = Array.isArray(scored) ? scored : [];
  const step = Number.isFinite(Number(ratio)) && Number(ratio) >= 2 ? Math.floor(Number(ratio)) : DEFAULT_PIN_RATIO;
  const interestSlugs = new Set(interest?.slugs || []);
  const interestStep = Number.isFinite(Number(interest?.ratio)) && Number(interest.ratio) >= 2
    ? Math.floor(Number(interest.ratio))
    : DEFAULT_INTEREST_RATIO;
  const useInterest = interestSlugs.size > 0;
  // Listede ZATEN temsil edilen ilgi alanlari (hangi yuvadan gelmis olursa).
  const covered = new Set();
  const markCovered = (item) => {
    for (const slug of item.interest_hits || []) covered.add(slug);
  };

  // Sabitlenmis kuyruk GLOBAL onem sirasina gore: bu slotun amaci "kurum
  // geneli en kritik olan", kisisel skor degil.
  const pinnedQueue = list
    .filter((x) => x.is_pinned)
    .slice()
    .sort((a, b) => (b.global_normalized ?? 0) - (a.global_normalized ?? 0));

  const used = new Set();
  const out = [];
  let pi = 0;
  let li = 0;

  const nextUnused = (arr, idx) => {
    while (idx < arr.length && used.has(arr[idx].id)) idx += 1;
    return idx;
  };

  while (out.length < list.length) {
    // Pencerenin ilk slotu sabitlenmise ayrilir. Cakismada (ornegin 16.
    // slot hem 5'in hem 4'un penceresine duser) SABITLENMIS KAZANIR:
    // filtre balonu korumasi ilgi yuvasindan once gelir.
    if (out.length % step === 0) {
      pi = nextUnused(pinnedQueue, pi);
      if (pi < pinnedQueue.length) {
        const item = pinnedQueue[pi];
        out.push({ ...item, pinned_slot: 1 });
        markCovered(item);
        used.add(item.id);
        pi += 1;
        continue;
      }
      // Sabitlenmis kalmadi -> slot kisisel siralamaya gecer.
    } else if (useInterest && out.length % interestStep === interestStep - 1) {
      const item = pickInterestSlot(list, used, covered);
      if (item) {
        out.push({ ...item, interest_slot: 1 });
        markCovered(item);
        used.add(item.id);
        continue;
      }
      // Kapsanmamis ilgi alani kalmadi -> slot kisisel siralamaya gecer.
    }
    li = nextUnused(list, li);
    if (li >= list.length) break;
    out.push(list[li]);
    markCovered(list[li]);
    used.add(list[li].id);
    li += 1;
  }

  return out;
}

/** Kac slotta bir "ilgi alani yuvasi" acilir (pencerenin SON slotu). */
export const DEFAULT_INTEREST_RATIO = 4;

/**
 * ILGI ALANI YUVASI — kullanicinin ACIKCA SECTIGI konularin temsili.
 *
 * OLCULEN HATA (TUR 4 persona testi, 2026-09-25): Deniz (dis-ticaret;
 * ilgi: ihracat, tarife, anti-damping, navlun, tedarik-zinciri, STA, cbam)
 * icin CBAM haberi (#82) kisisel sirada 19., ABD Tarife 338 (#87) 18.;
 * 5 dk listesi 12 kalem. Nilgun (ust-yonetim, 11 ilgi alani) icin CBAM
 * (#82) 7.; 2 dk listesi 5 kalem. Kisisellestirme kullanicinin kendi
 * sectigi konuyu GENEL akistan asagi itiyordu.
 *
 * TESHIS — agirlik sorunu DEGIL, TEMSIL sorunu: iki personanin ilk 12'sinde
 * de ilgi alaniyla eslesen haber ZATEN coktu (Deniz 9/12, Nilgun 5/5).
 * Hepsi "ihracat" gibi GENIS bir etiketten geliyordu: korpusta 30+ haberde
 * "ihracat" var. `interest_tags` bileseni eslesme SAYISINA bakar, hangi
 * ilgi alaninin eslestigine bakmaz; tek "ihracat" eslesmesi tek "cbam"
 * eslesmesiyle ayni 55 puani alir. Ustune `position_topic` (0,36) ve
 * `sector_match` (0,22) genis konulu haberlere 100 verirken, dar konulu
 * CBAM/tarife haberi (sektor 35) geride kalir. `interest_tags` agirligini
 * artirmak GENIS etiketi de ayni oranda buyutur — sorunu cozmez, filtre
 * balonunu buyutur.
 *
 * KURAL: her `ratio` slotun SONUNCUSU, listede HENUZ TEMSIL EDILMEMIS
 * ilgi alanlarindan en coguyla eslesen habere ayrilir. Esitlikte toplam
 * ilgi eslesmesi, sonra kisisel sira (`scored` sirasi) kazanir.
 *   - DUSUK bantli haber bu yuvaya GIREMEZ: yuva siralamanin USTUNE bir
 *     terfi; onemsiz haberi 5'lik listeye tasimamali.
 *   - Sessize alinan etiketi tasiyan haber GIREMEZ.
 *   - Aday yoksa slot normal kisisel siraya duser (no-op).
 * Somut sonuc (ratio 4): 2 dk/5 -> 1 yuva, 5 dk/12 -> 3, 10 dk/20 -> 4
 * (16. slot sabitlenmisle cakisir, sabitlenmis kazanir).
 *
 * ratio 5 de olculdu: Deniz'in 12'sinde yalnizca 2 yuva kalir, ikincisi
 * "navlun" haberine gider ve tarife temsil edilmez. Olcum tablosu:
 * docs/CONTRACT.md "Ilgi alani yuvasi".
 */
export function pickInterestSlot(list, used, covered) {
  let best = null;
  let bestNovel = 0;
  let bestHits = 0;
  for (const item of list) {
    if (used.has(item.id)) continue;
    if (item.muted_hit || String(item.band) === 'DUSUK') continue;
    const hits = item.interest_hits || [];
    if (hits.length === 0) continue;
    let novel = 0;
    for (const slug of hits) if (!covered.has(slug)) novel += 1;
    if (novel === 0) continue;
    // `list` kisisel sirada: kesin buyuk olmayan aday one gecemez.
    if (novel > bestNovel || (novel === bestNovel && hits.length > bestHits)) {
      best = item;
      bestNovel = novel;
      bestHits = hits.length;
    }
  }
  return best;
}

/**
 * Aday kumesini kisisel skora gore siralar. SAF: `now` bile gerekmiyor
 * (tazelik global skorun icinde, orada `now` ile hesaplandi).
 *
 * @param {object} input
 * @param {Array}  input.articles      { id, importanceScore, band, published_at, tagSlugs, ... }
 * @param {object} input.profile
 * @param {Map}    [input.semanticRanks]  article_id -> 0 tabanli sira
 * @param {number} [input.semanticTotal]  N (yoksa articles.length)
 * @param {Map}    [input.threadBonuses]  article_id -> 0..4
 * @returns {Array} siralanmis { id, personal_score, final_score, is_pinned, signals,
 *                   interest_hits, pinned_slot?, interest_slot? }
 */
export function rankArticles({
  articles = [],
  profile = {},
  semanticRanks = null,
  semanticTotal = null,
  threadBonuses = null,
  weights = WEIGHTS,
  pinRatio = DEFAULT_PIN_RATIO,
  interestRatio = DEFAULT_INTEREST_RATIO,
} = {}) {
  const list = Array.isArray(articles) ? articles : [];
  const toGlobal = normalizeGlobal();
  const total = Number.isFinite(Number(semanticTotal)) && Number(semanticTotal) > 0
    ? Number(semanticTotal)
    : list.length;
  const interestSet = new Set(profile?.interest_tag_slugs || []);
  const mutedSet = new Set(profile?.muted_tag_slugs || []);

  const scored = list.map((article) => {
    const rank = semanticRanks instanceof Map ? semanticRanks.get(Number(article.id)) : null;
    const components = personalComponents(article, profile, {
      semanticRank: rank === undefined ? null : rank,
      semanticTotal: total,
    });
    const personal = personalScore(components, weights);
    const globalNormalized = toGlobal(article.importanceScore);
    const bonus = threadBonuses instanceof Map ? threadBonuses.get(Number(article.id)) : 0;
    const { final_score, is_pinned } = blend({
      globalNormalized,
      personal,
      band: article.band,
      threadBonus: bonus || 0,
    });
    return {
      id: Number(article.id),
      published_at: article.published_at ?? null,
      personal_score: personal,
      global_normalized: globalNormalized,
      final_score,
      is_pinned,
      thread_bonus: round2(bonus || 0),
      signals: components,
      band: article.band ?? null,
      // Ilgi alani yuvasi icin: HANGI acik ilgi alanlari eslesti.
      interest_hits: (article.tagSlugs || []).filter((slug) => interestSet.has(slug)),
      muted_hit: (article.tagSlugs || []).some((slug) => mutedSet.has(slug)),
    };
  });

  scored.sort(comparePersonal);

  // Filtre balonu korumasi ORAN olarak uygulanir, siralama anahtari olarak
  // DEGIL. `pinRatio = 0` verilirse serpistirme atlanir (kalibrasyon ve
  // birim testleri ham siralamayi gormek isteyebilir). `interestRatio = 0`
  // yalnizca ilgi alani yuvasini kapatir (once/sonra olcumu icin).
  if (pinRatio === 0) return scored;
  const interest = interestRatio === 0 || interestSet.size === 0
    ? null
    : { slugs: [...interestSet], ratio: interestRatio };
  return interleavePinned(scored, { ratio: pinRatio, interest });
}
