/**
 * CONTRACT.md ile birebir uyumlu TypeScript tipleri.
 * Backend paralel geliştirildiği için tüm alanlar savunmacı biçimde
 * (opsiyonel / nullable) tanımlandı; UI hiçbir eksik alanda çökmemeli.
 */

/** Bölge ENUM — sözleşmede sabit 6 değer. */
export const REGIONS = [
  "KURESEL",
  "TURKIYE",
  "AMERIKA",
  "AVRUPA",
  "ASYA",
  "DIGER",
] as const;
export type Region = (typeof REGIONS)[number];

/** Önem bandı ENUM — generated column. */
export const BANDS = ["KRITIK", "YUKSEK", "ORTA", "DUSUK"] as const;
export type ImportanceBand = (typeof BANDS)[number];

/** Duygu durumu. */
export type Sentiment = "POZITIF" | "NOTR" | "NEGATIF" | string;

/** Bölgelerin Türkçe görünen adları. */
export const REGION_LABEL: Record<Region, string> = {
  KURESEL: "Küresel",
  TURKIYE: "Türkiye",
  AMERIKA: "Amerika",
  AVRUPA: "Avrupa",
  ASYA: "Asya",
  DIGER: "Diğer",
};

/** Önem bantlarının Türkçe görünen adları. */
export const BAND_LABEL: Record<ImportanceBand, string> = {
  KRITIK: "Kritik",
  YUKSEK: "Yüksek",
  ORTA: "Orta",
  DUSUK: "Düşük",
};

/** Sıralama için band ağırlığı (yüksek = daha önemli). */
export const BAND_RANK: Record<ImportanceBand, number> = {
  KRITIK: 4,
  YUKSEK: 3,
  ORTA: 2,
  DUSUK: 1,
};

/** Kaynak türü ENUM — sources.source_type ile birebir aynı. */
export const SOURCE_TYPES = [
  "mevzuat",
  "kurum",
  "acik_veri",
  "basin",
  "uluslararasi",
  "diger",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Kaynak türlerinin Türkçe görünen adları ve kısa açıklamaları. */
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  mevzuat: "Mevzuat",
  kurum: "Kurum Duyurusu",
  acik_veri: "Açık Veri",
  basin: "Basın",
  uluslararasi: "Uluslararası",
  diger: "Diğer",
};

export const SOURCE_TYPE_HINT: Record<SourceType, string> = {
  mevzuat: "Resmî gazeteler, tüzük ve yönetmelik yayınları",
  kurum: "Bakanlık, oda ve kamu kurumu duyuruları",
  acik_veri: "İstatistik kurumları ve açık veri portalları",
  basin: "Haber ajansları ve gazeteler",
  uluslararasi: "AB, OECD, IMF gibi uluslararası kuruluşlar",
  diger: "Yukarıdakilerin dışında kalan kaynaklar",
};

/** Bilinmeyen tür değerini güvenli biçimde "diger"e düşürür. */
export function normalizeSourceType(value?: string | null): SourceType {
  const v = String(value ?? "").toLowerCase();
  return (SOURCE_TYPES as readonly string[]).includes(v)
    ? (v as SourceType)
    : "diger";
}

export function sourceTypeLabel(value?: string | null): string {
  return SOURCE_TYPE_LABEL[normalizeSourceType(value)];
}

export interface Source {
  id?: number;
  slug: string;
  name: string;
  homepage_url?: string | null;
  feed_url?: string | null;
  source_type?: string | null;
  authority_weight?: number | null;
  country_code?: string | null;
  language?: string | null;
  /**
   * Yönetici alanı: kaynak sistem genelinde toplanıyor mu. Panelden
   * DEĞİŞTİRİLMEZ — toplama her kiracı için ortaktır.
   */
  is_active?: boolean | null;
  /**
   * Bu kiracının panelinde izleniyor mu. Kapatmak yalnızca bu kurumun
   * görünümünü etkiler; veri toplanmaya ve saklanmaya devam eder.
   */
  is_watched?: boolean | null;
  /** /sources uç noktası kullanım sayısı döndürebilir. */
  article_count?: number | null;
  /** Tekilleştirme sonrası benzersiz haber sayısı. */
  unique_count?: number | null;
  last_fetched_at?: string | null;
  last_published_at?: string | null;
}

/**
 * PATCH /sources/:id gövdesi.
 * İzleme durumu BURADAN değiştirilmez — `PUT /sources/:id/watch` kullanılır.
 */
export interface SourcePatch {
  authority_weight?: number;
  name?: string;
}

/** PUT /sources/watch/bulk gövdesi. */
export interface SourceWatchBulk {
  source_ids: number[];
  is_watched: boolean;
}

/** POST /sources gövdesi. */
export interface SourceCreate {
  slug?: string;
  name: string;
  homepage_url: string;
  source_type: SourceType;
  authority_weight?: number;
  country_code?: string;
  language?: string;
}

/** Kaynak önerisi durumları. */
export const SUGGESTION_STATUSES = ["beklemede", "kabul", "red"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  beklemede: "Beklemede",
  kabul: "Kabul",
  red: "Red",
};

export function normalizeSuggestionStatus(
  value?: string | null,
): SuggestionStatus {
  const v = String(value ?? "").toLowerCase();
  return (SUGGESTION_STATUSES as readonly string[]).includes(v)
    ? (v as SuggestionStatus)
    : "beklemede";
}

/** GET /source-suggestions kaydı. */
export interface SourceSuggestion {
  id: number;
  name: string;
  url: string;
  reason?: string | null;
  submitted_by?: string | null;
  source_type?: string | null;
  status?: SuggestionStatus | string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
}

/** POST /source-suggestions gövdesi. */
export interface SourceSuggestionCreate {
  name: string;
  url: string;
  reason?: string;
  submitted_by?: string;
  source_type?: SourceType;
}

export interface Tag {
  id?: number;
  slug: string;
  label: string;
  kind?: string | null;
  weight?: number | null;
  /** /tags uç noktasında kullanım sayısı. */
  usage_count?: number | null;
  article_count?: number | null;
}

export interface ClusterRef {
  id: number;
  member_count?: number | null;
}

/** Varlıklar: {"kurum": [...], "kisi": [...], "sektor": [...]} */
export type Entities = Record<string, string[]>;

export interface Article {
  id: number;
  title: string;
  url: string;
  summary?: string | null;
  body?: string | null;
  key_points?: string[] | null;
  entities?: Entities | null;
  region?: Region | string | null;
  category?: string | null;
  sentiment?: Sentiment | null;
  importance_band?: ImportanceBand | string | null;
  /** Gizli metrik — normalde null döner, UI'da ASLA gösterilmez. */
  importance_score?: number | null;
  published_at?: string | null;
  source?: Source | null;
  tags?: Tag[] | null;
  cluster?: ClusterRef | null;
  /**
   * Haber görseli (og:image). Backend paralel geliştiriliyor; bulunamayan
   * haberlerde `null` döner, alan hiç gelmeyebilir de. Görsel görünümü
   * bu durumda tipografik yer tutucuya düşer, boş kutu göstermez.
   */
  image_url?: string | null;
}

/** Küme üyesi — tekilleştirmenin görünür kanıtı. */
export interface ClusterMember {
  id: number;
  title: string;
  url: string;
  published_at?: string | null;
  source?: Source | null;
  region?: Region | string | null;
  is_representative?: boolean | null;
}

export interface Cluster {
  id: number;
  member_count?: number | null;
  representative_id?: number | null;
  members?: ClusterMember[] | null;
  created_at?: string | null;
}

/** Haber detayı — küme üyeleri gömülü gelebilir. */
export interface ArticleDetail extends Article {
  cluster_members?: ClusterMember[] | null;
  members?: ClusterMember[] | null;
}

/** Rapor kalemi: backend haberi `article` altinda sarmalayip dondurur. */
export interface ReportItem {
  rank_order?: number | null;
  section?: string | null;
  article?: Article | null;
}

export interface ReportSection {
  /** Backend bolum anahtarini `key` alaninda dondurur (or. "TURKIYE"). */
  key?: string | null;
  title?: string | null;
  region?: Region | string | null;
  band?: ImportanceBand | string | null;
  /** Duz Article dizisi de, sarmalanmis ReportItem dizisi de gelebilir. */
  articles?: (Article | ReportItem)[] | null;
  items?: (Article | ReportItem)[] | null;
}

export interface Report {
  id: number;
  title?: string | null;
  period_type?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  executive_summary?: string | null;
  summary?: string | null;
  created_at?: string | null;
  generated_at?: string | null;
  article_count?: number | null;
  sections?: ReportSection[] | null;
  articles?: Article[] | null;
}

/** Genel sayım çifti — backend {key,count} ya da {region,count} döndürebilir. */
export interface CountBucket {
  key?: string | null;
  region?: string | null;
  band?: string | null;
  category?: string | null;
  label?: string | null;
  date?: string | null;
  day?: string | null;
  count?: number | null;
  total?: number | null;
  value?: number | null;
}

/** Backend'in `totals` altında döndürdüğü toplamlar. */
export interface StatsTotals {
  articles?: number | null;
  unique_articles?: number | null;
  duplicates?: number | null;
  sources?: number | null;
  active_sources?: number | null;
  clusters?: number | null;
  multi_source_clusters?: number | null;
  avg_cluster_size?: number | null;
  dedup_ratio?: number | null;
  last_published_at?: string | null;
}

/** Son toplama çalışmasının kaydı (`collection_runs`). */
export interface CollectionRun {
  id?: number | null;
  trigger_type?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  fetched_count?: number | null;
  new_count?: number | null;
  duplicate_count?: number | null;
  error_count?: number | null;
}

export interface StatsOverview {
  /** Güncel backend toplamları buradan gelir; düz alanlar geriye dönük. */
  totals?: StatsTotals | null;
  last_run?: CollectionRun | null;
  top_categories?: CountBucket[] | Record<string, number> | null;
  total_articles?: number | null;
  total_sources?: number | null;
  total_clusters?: number | null;
  total_tags?: number | null;
  /** Tekilleştirme oranı: 0..1 ya da 0..100 gelebilir, UI normalize eder. */
  dedup_ratio?: number | null;
  duplicates_removed?: number | null;
  unique_articles?: number | null;
  by_region?: CountBucket[] | Record<string, number> | null;
  by_band?: CountBucket[] | Record<string, number> | null;
  by_category?: CountBucket[] | Record<string, number> | null;
  daily?: CountBucket[] | null;
  daily_series?: CountBucket[] | null;
  last_collected_at?: string | null;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Liste filtreleri — /articles query parametreleri. */
export interface ArticleQuery {
  region?: string;
  band?: string;
  category?: string;
  tag?: string;
  q?: string;
  from?: string;
  to?: string;
  source?: string;
  page?: number;
  limit?: number;
  sort?: string;
}
