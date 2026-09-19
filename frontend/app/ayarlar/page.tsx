/**
 * AYARLAR — /ayarlar
 *
 * Sayfanın kendisi sunucu bileşenidir: ilk veriyi (kaynaklar, öneriler,
 * istatistik, raporlar, sağlık) sunucu tarafında `API_BASE_URL` üzerinden
 * çeker, böylece liste ilk boyamada dolu gelir ve `/api` vekili tanımlı
 * olmasa bile okunur. Etkileşimli bölümler ayrı istemci bileşenleridir.
 *
 * Görünüm yuvası (data-view-slot) KULLANILMAZ: ayarlar dört görünümün
 * hepsinde erişilebilir olmalı, yuvasız içerik her modda görünür.
 */

import type { Metadata } from "next";
import Link from "next/link";

import {
  getHealth,
  getReports,
  getSourceSuggestions,
  getSources,
  getStatsOverview,
} from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  humanize,
} from "@/lib/format";

import { A11yControls } from "@/components/A11yControls";
import { NewsletterPrefs } from "@/components/settings/NewsletterPrefs";
import { SettingsSection } from "@/components/settings/Parts";
import { SourcesPanel } from "@/components/settings/SourcesPanel";
import { SuggestionsPanel } from "@/components/settings/SuggestionsPanel";
import { ViewPreferences } from "@/components/settings/ViewPreferences";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Ayarlar",
  description:
    "Görünüm, erişilebilirlik, izlenen kaynaklar, kaynak önerileri ve bülten tercihleri.",
};

/** Rapor dönemi ve toplama tetikleyicisi için düzgün Türkçe karşılıklar. */
const PERIOD_LABEL: Record<string, string> = {
  gunluk: "Günlük",
  haftalik: "Haftalık",
  aylik: "Aylık",
};

const TRIGGER_LABEL: Record<string, string> = {
  manuel: "Manuel",
  zamanlanmis: "Zamanlanmış",
  seed: "Başlangıç verisi",
};

/** Salt okunur sistem bilgisi satırı. */
function InfoRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-rule py-2">
      <span className="u-kicker text-ink-soft">{label}</span>
      <span className="u-body min-w-0 text-right text-[0.9375rem]">
        {value}
        {note ? (
          <span className="u-body u-body-soft block text-[0.8125rem] leading-snug">
            {note}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const [sourcesRes, suggestionsRes, statsRes, reportsRes, healthRes] =
    await Promise.all([
      getSources(),
      getSourceSuggestions(),
      getStatsOverview(),
      getReports(),
      getHealth(),
    ]);

  const sources = sourcesRes.ok ? sourcesRes.data : [];
  const suggestions = suggestionsRes.ok ? suggestionsRes.data : [];

  // Backend toplamları `totals` altında döndürüyor; eski düz alanlar yedek.
  const stats = statsRes.ok ? statsRes.data : null;
  const totals = stats?.totals ?? null;
  const totalArticles = totals?.articles ?? stats?.total_articles ?? null;
  const totalSources = totals?.sources ?? stats?.total_sources ?? sources.length;
  const activeSources =
    totals?.active_sources ?? sources.filter((s) => s.is_active !== false).length;
  /** Bu kurumun panelinde izlenen kaynak sayısı (`is_watched`). */
  const watchedSources = sources.filter((s) => s.is_watched !== false).length;
  const totalClusters = totals?.clusters ?? stats?.total_clusters ?? null;
  const dedupRatio = totals?.dedup_ratio ?? stats?.dedup_ratio ?? null;
  const lastRun = stats?.last_run ?? null;
  const lastCollected =
    lastRun?.finished_at ??
    lastRun?.started_at ??
    stats?.last_collected_at ??
    totals?.last_published_at ??
    null;

  const reports = reportsRes.ok ? reportsRes.data : [];
  const latestReport = reports[0] ?? null;
  const healthy = healthRes.ok && healthRes.data?.ok === true;
  const dbHealthy = healthRes.ok && healthRes.data?.db !== false;

  return (
    <div className="ayar-page mx-auto w-full max-w-[1440px] px-4 pb-14 sm:px-6">
      <header className="border-b border-ink py-5">
        <p className="u-kicker u-kicker-accent">Panel</p>
        <h1 className="u-headline u-headline-lg mt-1">Ayarlar</h1>
        <p className="u-body u-body-soft mt-2 max-w-3xl text-[0.95rem]">
          Görünüm ve erişilebilirlik tercihleri yalnızca bu tarayıcıda saklanır.
          Kaynaklar ve kaynak önerileri sunucuda tutulur; burada yapılan
          değişiklik bülteni herkes için etkiler.
        </p>
      </header>

      {/* ---------------- a) GÖRÜNÜM ---------------- */}
      <SettingsSection
        id="gorunum"
        kicker="Tercih"
        title="Görünüm"
        lead="Bültenin dört mizanpajından birini seçin. Seçim üst bardaki görünüm anahtarıyla ortaktır."
      >
        <ViewPreferences />
      </SettingsSection>

      {/* ---------------- b) ERİŞİLEBİLİRLİK ---------------- */}
      <SettingsSection
        id="erisilebilirlik"
        kicker="Tercih"
        title="Erişilebilirlik"
        lead="Yazı tipi, metin ölçüleri, kontrast, renk görüşü ve okuma yardımcılarının tamamı burada. Aynı denetimler sağ alttaki yüzen erişilebilirlik düğmesinden de açılabilir; ikisi aynı ayarı yazar. Ayarlar bu tarayıcıda saklanır, sunucuya gönderilmez."
      >
        <div className="max-w-2xl">
          <A11yControls />
        </div>
      </SettingsSection>

      {/* -------- c) KAYNAKLAR  +  d) KAYNAK ÖNER (yan yana) -------- */}
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7 xl:col-span-8">
          <SettingsSection
            id="kaynaklar"
            kicker="Yönetim"
            title="Kaynaklar"
            aside={`${formatNumber(sources.length || totalSources)} kaynaktan ${formatNumber(watchedSources)} tanesi izleniyor`}
            lead="Sistemin izlediği açık kaynakların tamamı. Hangilerinin panelinizde görüneceğini buradan seçersiniz; seçim yalnızca sizin kurumunuzu etkiler."
          >
            <SourcesPanel
              initialSources={sources}
              initialError={sourcesRes.ok ? null : sourcesRes.error}
            />
          </SettingsSection>
        </div>

        <div className="min-w-0 lg:col-span-5 lg:border-l lg:border-rule lg:pl-8 xl:col-span-4">
          <SettingsSection
            id="kaynak-oner"
            kicker="Katkı"
            title="Kaynak Öner"
            lead="İzlenmesini istediğiniz bir adresi bırakın. Öneriler değerlendirildikten sonra kaynak listesine eklenir."
          >
            <SuggestionsPanel
              initialSuggestions={suggestions}
              initialError={suggestionsRes.ok ? null : suggestionsRes.error}
            />
          </SettingsSection>
        </div>
      </div>

      {/* ---------------- e) BÜLTEN TERCİHLERİ ---------------- */}
      <SettingsSection
        id="bulten"
        kicker="Tercih"
        title="Bülten Tercihleri"
        lead="Bültenin sizde nasıl açılacağına dair varsayılanlar. Tarayıcıya kaydedilir."
      >
        <div className="max-w-3xl">
          <NewsletterPrefs />
        </div>
      </SettingsSection>

      {/* ---------------- f) SİSTEM BİLGİSİ ---------------- */}
      <SettingsSection
        id="sistem"
        kicker="Salt Okunur"
        title="Sistem Bilgisi"
        lead="Toplama ve tekilleştirme sürecinin güncel durumu. Bu bölümde değiştirilebilir bir ayar yoktur."
      >
        {!statsRes.ok ? (
          <p className="ayar-bildirim mb-4" data-tur="hata">
            İstatistik alınamadı. {statsRes.error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <h3 className="u-kicker border-b border-ink pb-1 text-ink">Korpus</h3>
            <div className="mt-1">
              <InfoRow
                label="Toplam haber"
                value={totalArticles === null ? "—" : formatNumber(totalArticles)}
              />
              <InfoRow
                label="Kaynak"
                value={formatNumber(totalSources)}
                note={`${formatNumber(activeSources)} tanesi sistemde etkin`}
              />
              <InfoRow
                label="Panelinizde izlenen"
                value={formatNumber(watchedSources)}
                note="İzlenmeyen kaynakların haberleri toplanmaya devam eder"
              />
              <InfoRow
                label="Küme"
                value={totalClusters === null ? "—" : formatNumber(totalClusters)}
              />
              <InfoRow
                label="Tekilleştirme oranı"
                value={dedupRatio === null ? "—" : formatPercent(dedupRatio)}
                note={
                  totals?.duplicates
                    ? `${formatNumber(totals.duplicates)} mükerrer kayıt birleştirildi`
                    : undefined
                }
              />
            </div>
          </div>

          <div>
            <h3 className="u-kicker border-b border-ink pb-1 text-ink">Toplama</h3>
            <div className="mt-1">
              <InfoRow
                label="Son toplama"
                value={lastCollected ? formatDateTime(lastCollected) : "—"}
                note={
                  lastRun?.trigger_type
                    ? `Tetikleyici: ${
                        TRIGGER_LABEL[lastRun.trigger_type] ??
                        humanize(lastRun.trigger_type)
                      }`
                    : undefined
                }
              />
              <InfoRow
                label="Getirilen kayıt"
                value={
                  lastRun?.fetched_count === null || lastRun?.fetched_count === undefined
                    ? "—"
                    : formatNumber(lastRun.fetched_count)
                }
                note={
                  lastRun
                    ? `${formatNumber(lastRun.new_count ?? 0)} yeni · ${formatNumber(
                        lastRun.duplicate_count ?? 0,
                      )} tekrar · ${formatNumber(lastRun.error_count ?? 0)} hata`
                    : undefined
                }
              />
              <InfoRow
                label="API durumu"
                value={healthy ? "Çalışıyor" : "Yanıt vermiyor"}
                note={
                  healthRes.ok
                    ? dbHealthy
                      ? "Veritabanı bağlantısı açık"
                      : "Veritabanına ulaşılamıyor"
                    : healthRes.error
                }
              />
            </div>
          </div>

          <div>
            <h3 className="u-kicker border-b border-ink pb-1 text-ink">Son Rapor</h3>
            <div className="mt-1">
              {latestReport ? (
                <>
                  <InfoRow
                    label="Başlık"
                    value={latestReport.title ?? `Rapor #${latestReport.id}`}
                  />
                  <InfoRow
                    label="Dönem"
                    value={
                      latestReport.period_start && latestReport.period_end
                        ? `${formatDate(latestReport.period_start)} — ${formatDate(
                            latestReport.period_end,
                          )}`
                        : "—"
                    }
                    note={
                      latestReport.period_type
                        ? (PERIOD_LABEL[latestReport.period_type] ??
                          humanize(latestReport.period_type))
                        : undefined
                    }
                  />
                  <InfoRow label="Toplam rapor" value={formatNumber(reports.length)} />
                  <p className="mt-3">
                    <Link
                      href={`/raporlar/${latestReport.id}`}
                      className="u-kicker u-link-underline text-accent"
                    >
                      Raporu aç →
                    </Link>
                  </p>
                </>
              ) : (
                <p className="u-body u-body-soft mt-2 text-[0.9375rem]">
                  {reportsRes.ok
                    ? "Henüz rapor üretilmedi."
                    : `Rapor bilgisi alınamadı. ${reportsRes.error}`}
                </p>
              )}
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
