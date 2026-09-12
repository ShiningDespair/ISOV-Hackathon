// ---------------------------------------------------------------------
// TEK SERILESTIRME NOKTASI
//
// Neden tek dosya: `importance_score` gizli bir metrik. Her route kendi
// JSON'unu kurarsa er ya da gec biri skoru sizdirir. Tum uc noktalar bu
// serializer'dan gecmek zorunda; sizinti riski tek satira indirgeniyor.
//
// Kural (CONTRACT.md): importance_score varsayilan olarak null doner,
// sadece ?reveal=1 ile gercek deger gorunur. importance_band HER ZAMAN doner.
// ---------------------------------------------------------------------

/** `?reveal=1` / `reveal=true` disindaki her sey gizli kabul edilir. */
export function wantsReveal(req) {
  const v = req?.query?.reveal;
  if (v === undefined || v === null) return false;
  const s = String(Array.isArray(v) ? v[0] : v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'evet';
}

/** DATETIME -> ISO-8601 string, null guvenli. */
export function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Bir Date'i TRT (Europe/Istanbul) takvimine gore 'YYYY-MM-DD' yazar.
 *
 * NEDEN acik saat dilimi: MySQL DATE '2026-09-06' havuzun timezone'u geregi
 * 2026-09-06T00:00+03:00 = 2026-09-05T21:00Z olarak gelir. Sunucu UTC ise
 * yerel bilesenlerden okumak gunu BIR GERI kaydirir ve rapor donemi
 * kayar. Proje bastan sona TRT varsaydigi icin donusumu sabitliyoruz.
 */
const TRT_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

export function formatTrtDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return TRT_DATE_FORMAT.format(d); // en-CA -> 'YYYY-MM-DD'
}

/** DATE kolonu -> 'YYYY-MM-DD' (rapor donemleri icin saat bilgisi gurultu). */
export function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return formatTrtDate(value);
}

/** mysql2 JSON kolonunu parse edilmis dondurur; yine de savunmaci davraniyoruz. */
export function parseJsonColumn(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function serializeSource(row) {
  if (!row || !row.source_slug) return null;
  return {
    slug: row.source_slug,
    name: row.source_name,
    source_type: row.source_type,
  };
}

export function serializeTag(row) {
  return {
    slug: row.slug,
    label: row.label,
    kind: row.kind,
  };
}

/**
 * Haber objesi — CONTRACT.md "Haber objesi (API cikti sekli)" ile birebir.
 *
 * @param {object} row          articles JOIN sources satiri
 * @param {object} [opts]
 * @param {boolean} [opts.reveal=false]  true ise gercek skor doner
 * @param {Array}  [opts.tags=[]]        {slug,label,kind} listesi
 * @param {object} [opts.cluster]        {id, member_count, ...} ek alanlar
 */
export function serializeArticle(row, { reveal = false, tags = [], cluster } = {}) {
  if (!row) return null;

  const clusterOut = cluster !== undefined
    ? cluster
    : (row.cluster_id
      ? { id: Number(row.cluster_id), member_count: Number(row.cluster_member_count ?? 1) }
      : null);

  return {
    id: Number(row.id),
    title: row.title,
    url: row.url,
    summary: row.summary ?? null,
    key_points: parseJsonColumn(row.key_points, []),
    entities: parseJsonColumn(row.entities, {}),
    region: row.region,
    category: row.category ?? null,
    sentiment: row.sentiment,
    importance_band: row.importance_band,
    // GIZLI METRIK — reveal yoksa asla sizdirma.
    importance_score: reveal ? Number(row.importance_score) : null,
    published_at: toIso(row.published_at),
    source: serializeSource(row),
    tags: Array.isArray(tags) ? tags.map(serializeTag) : [],
    cluster: clusterOut,
  };
}

/** Sayfali liste yaniti — CONTRACT.md "Liste yaniti". */
export function serializeList(items, { page, limit, total }) {
  const safeLimit = Number(limit) || 1;
  return {
    data: items,
    page: Number(page),
    limit: Number(limit),
    total: Number(total),
    totalPages: Math.max(1, Math.ceil(Number(total) / safeLimit)),
  };
}
