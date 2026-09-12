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

export interface Source {
  id?: number;
  slug: string;
  name: string;
  homepage_url?: string | null;
  source_type?: string | null;
  authority_weight?: number | null;
  country_code?: string | null;
  language?: string | null;
  /** /sources uç noktası kullanım sayısı döndürebilir. */
  article_count?: number | null;
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

export interface ReportSection {
  title?: string | null;
  region?: Region | string | null;
  band?: ImportanceBand | string | null;
  articles?: Article[] | null;
  items?: Article[] | null;
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

export interface StatsOverview {
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
