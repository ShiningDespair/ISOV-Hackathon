// ---------------------------------------------------------------------
// GET /api/articles       — filtreli, sayfali liste
// GET /api/articles/:id   — detay + kume uyeleri + etiketler
//
// Guvenlik notu: tum kullanici degerleri `?` ile parametrelenir.
// Tek istisna LIMIT/OFFSET; onlar da Number.parseInt'ten gecip 1..100
// araligina sikistirildigi icin string birlestirme guvenli.
// ---------------------------------------------------------------------
import { Router } from 'express';
import { requireRole } from '../middleware/session.js';
import { query } from '../lib/db.js';
import {
  ApiError, asyncHandler, parsePagination, pickFromAllowList,
  parseDateParam, placeholders, qs, qsList, toBool, toMysqlDateTime,
} from '../lib/http.js';
import { serializeList, serializeArticle, wantsReveal } from '../lib/serialize.js';
import {
  ARTICLE_COLUMNS, ARTICLE_FROM, findArticleRow, findClusterMemberRows,
  serializeArticleRows, tagsByArticleIds,
} from '../services/articleService.js';
import { runFetchImages } from '../jobs/fetch-images.js';
import { tenantKeyOf } from './sources.js';
import { listPersonalized, loadProfile } from '../services/personalize.js';

const router = Router();

/** ENUM degerleri — sema ile birebir, allow-list olarak kullaniliyor. */
export const REGIONS = ['KURESEL', 'TURKIYE', 'AMERIKA', 'AVRUPA', 'ASYA', 'DIGER'];
export const BANDS = ['KRITIK', 'YUKSEK', 'ORTA', 'DUSUK'];
export const SENTIMENTS = ['POZITIF', 'NOTR', 'NEGATIF'];

/**
 * Siralama allow-list'i. Anahtar disaridan gelir, DEGER sabittir —
 * bu sayede `sort=; DROP TABLE` gibi bir girdi SQL'e ulasamaz.
 */
const SORTS = {
  importance: 'a.importance_score DESC, a.published_at DESC, a.id DESC',
  recent: 'a.published_at DESC, a.importance_score DESC, a.id DESC',
  oldest: 'a.published_at ASC, a.id ASC',
  title: 'a.title ASC, a.id ASC',
  relevance: null, // q varsa MATCH skoruna gore; yoksa importance'a duser
  // KISISEL SIRALAMA: SQL'de yapilamaz (skor JS'te hesaplaniyor), bu yuzden
  // deger null ve istek services/personalize.js'e YONLENDIRILIR. Anahtar
  // yine de allow-list'te duruyor ki `pickFromAllowList` onu tanisin ve
  // bilinmeyen bir `sort` degeri gibi sessizce varsayilana dusmesin.
  kisisel: null,
};
const DEFAULT_SORT = 'importance';

/** FULLTEXT indeksinin anlamli calismasi icin asgari sorgu uzunlugu. */
const FULLTEXT_MIN_LENGTH = 4;

/**
 * Filtreleri WHERE parcalarina cevirir.
 *
 * DISA ACIK: `services/personalize.js` (sort=kisisel) AYNI WHERE'i kullanmak
 * zorunda. Filtre mantigini kopyalamak iki yolun birbirinden kaymasi demek
 * olurdu — `watched_only` bir yolda uygulanip otekinde atlanirsa kullanici
 * sessizce farkli sonuc gorur ve hata gorunmez.
 *
 * @param {object} req       Istek — kurum anahtari ve oturum OTURUMDAN okunur
 * @param {object} reqQuery  req.query
 * @param {'fulltext'|'like'|'none'} searchMode
 */
export function buildFilters(req, reqQuery, searchMode) {
  const where = [];
  const params = [];
  // Oturum orta katmani doldurur; yoksa null gelir ve gizleme suzgeci
  // hic devreye girmez (oturumsuz davranis DEGISMEZ).
  const userId = req?.user?.id ?? null;

  // Varsayilan: tekrarlar gizli. ?include_duplicates=1 ile hepsi gelir.
  const includeDuplicates = ['1', 'true', 'yes', 'evet']
    .includes(String(qs(reqQuery.include_duplicates) || '').toLowerCase());
  if (!includeDuplicates) where.push('a.is_duplicate = 0');

  // KULLANICININ GIZLEDIGI HABERLER — VARSAYILAN: GIZLI.
  //
  // `?include_hidden=1` ile geri gelirler. Gizleme VERIYI SILMEZ:
  // `user_article_prefs.hidden_at` damgasi kullaniciya OZELDIR; ayni haberi
  // baska kullanici gorur, kume ve skor degismez. Suzgec yalnizca oturum
  // varken devreye girer — oturumsuz istek bugunku davranisi aynen alir.
  const includeHidden = toBool(qs(reqQuery.include_hidden)) === true;
  if (userId && !includeHidden) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM user_article_prefs uap
       WHERE uap.article_id = a.id
         AND uap.user_id = ?
         AND uap.hidden_at IS NOT NULL
    )`);
    params.push(userId);
  }

  const region = pickFromAllowList(reqQuery.region, REGIONS);
  if (region) { where.push('a.region = ?'); params.push(region); }

  const band = pickFromAllowList(reqQuery.band, BANDS);
  if (band) { where.push('a.importance_band = ?'); params.push(band); }

  const sentiment = pickFromAllowList(reqQuery.sentiment, SENTIMENTS);
  if (sentiment) { where.push('a.sentiment = ?'); params.push(sentiment); }

  const categories = qsList(reqQuery.category);
  if (categories.length) {
    where.push(`a.category IN (${placeholders(categories.length)})`);
    params.push(...categories);
  }

  const sources = qsList(reqQuery.source);
  if (sources.length) {
    where.push(`s.slug IN (${placeholders(sources.length)})`);
    params.push(...sources);
  }

  // KIRACI IZLEME SUZGECI — VARSAYILAN: TUM HABERLER GOSTERILIR.
  //
  // Veri katmani tum kiracilar arasinda paylasilir ve hicbir haber
  // silinmez; bir kiracinin izlemeyi biraktigi kaynagi baska bir kiraci
  // izliyor olabilir. ?watched_only=1 verildiginde yalnizca o kiracinin
  // izledigi kaynaklarin haberleri doner.
  //
  // `tenant_source_prefs`te kayit YOKSA varsayilan "izleniyor" oldugu icin
  // kosul NOT EXISTS ile yazildi: yalnizca ACIKCA is_watched=0 isaretlenmis
  // kaynaklar dislanir.
  if (toBool(qs(reqQuery.watched_only)) === true) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM tenant_source_prefs tsp
       WHERE tsp.source_id = a.source_id
         AND tsp.tenant_key = ?
         AND tsp.is_watched = 0
    )`);
    // KURUM ANAHTARI `tenantKeyOf()`TEN GELIR, req.query'den DEGIL.
    // Eski hali `?tenant_key=` degerini dogrudan okuyordu ve boylece
    // sources.js'teki guvenlik kontrolunu tamamen ATLIYORDU: oturum acmis
    // bir kullanici `?watched_only=1&tenant_key=baskafirma` ile baska bir
    // kurumun izleme gorunumunu okuyabilirdi.
    params.push(tenantKeyOf(req));
  }

  // Etiket filtresi EXISTS ile: JOIN kullanilsa sayfalama satir cogaltirdi.
  const tags = qsList(reqQuery.tag);
  if (tags.length) {
    where.push(`EXISTS (
      SELECT 1 FROM article_tags at2
        JOIN tags t2 ON t2.id = at2.tag_id
       WHERE at2.article_id = a.id AND t2.slug IN (${placeholders(tags.length)})
    )`);
    params.push(...tags);
  }

  const from = parseDateParam(reqQuery.from);
  if (from) { where.push('a.published_at >= ?'); params.push(toMysqlDateTime(from)); }

  const to = parseDateParam(reqQuery.to);
  if (to) {
    // Gun bazli 'to' verildiginde o gunun tamami dahil olsun.
    const end = String(qs(reqQuery.to)).length === 10
      ? new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1000)
      : to;
    where.push('a.published_at <= ?');
    params.push(toMysqlDateTime(end));
  }

  const search = qs(reqQuery.q);
  if (search && searchMode === 'fulltext') {
    where.push('MATCH (a.title, a.summary, a.body) AGAINST (? IN NATURAL LANGUAGE MODE)');
    params.push(search);
  } else if (search && searchMode === 'like') {
    // Kisa sorgular FULLTEXT'te (min token uzunlugu) kaybolur -> LIKE yedegi.
    where.push('(a.title LIKE ? OR a.summary LIKE ? OR a.category LIKE ?)');
    const like = `%${search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    params.push(like, like, like);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
    search,
  };
}

/** Tek turda sayim + sayfa verisi. */
async function runListQuery(req, searchMode, { limit, offset, orderBy }) {
  const { whereSql, params, search } = buildFilters(req, req.query, searchMode);

  const countRows = await query(
    `SELECT COUNT(*) AS total ${ARTICLE_FROM} ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);
  if (total === 0) return { rows: [], total, search };

  // relevance siralamasi ancak fulltext modunda anlamli.
  const order = orderBy ?? (searchMode === 'fulltext'
    ? 'relevance_score DESC, a.importance_score DESC'
    : SORTS[DEFAULT_SORT]);

  const scoreCol = searchMode === 'fulltext'
    ? ', MATCH (a.title, a.summary, a.body) AGAINST (? IN NATURAL LANGUAGE MODE) AS relevance_score'
    : '';
  const scoreParams = searchMode === 'fulltext' ? [search] : [];

  const rows = await query(
    `SELECT ${ARTICLE_COLUMNS}${scoreCol}
     ${ARTICLE_FROM} ${whereSql}
     ORDER BY ${order}
     LIMIT ${limit} OFFSET ${offset}`,
    [...scoreParams, ...params],
  );

  return { rows, total, search };
}

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const reveal = wantsReveal(req);

  const sortKey = pickFromAllowList(req.query.sort, Object.keys(SORTS), DEFAULT_SORT);
  const search = qs(req.query.q);

  let searchMode = 'none';
  if (search) searchMode = search.length >= FULLTEXT_MIN_LENGTH ? 'fulltext' : 'like';

  // --- KISISEL SIRALAMA -------------------------------------------------
  // Oturum ZORUNLU: kisisel skor profilden hesaplaniyor, profilsiz
  // "kisisel" siralama yoktur. Sessizce global siralamaya dusmek YANLIS
  // olurdu — arayuz kisiselestirilmis bir liste gosterdigini sanar ve
  // kimse fark etmez.
  if (sortKey === 'kisisel') {
    if (!req.user?.id) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Kişisel sıralama için oturum açmanız gerekiyor.');
    }
    const { whereSql, params } = buildFilters(req, req.query, searchMode);
    const profile = await loadProfile(req.user.id, tenantKeyOf(req));
    const out = await listPersonalized({
      whereSql, params, profile, page, limit, offset, reveal,
    });
    return res.json({
      ...serializeList(out.data, { page, limit, total: out.total }),
      meta: out.meta,
    });
  }

  // relevance sadece arama varken; degilse varsayilan siralamaya duser.
  const orderBy = sortKey === 'relevance' ? null : (SORTS[sortKey] || SORTS[DEFAULT_SORT]);

  let result = await runListQuery(req, searchMode, { limit, offset, orderBy });

  // FULLTEXT hic sonuc vermediyse (stopword, ekli kelime, kisa token)
  // sessizce LIKE yedegine dusuyoruz — kullanici bos ekran gormesin.
  if (result.total === 0 && searchMode === 'fulltext') {
    result = await runListQuery(req, 'like', {
      limit, offset, orderBy: orderBy || SORTS[DEFAULT_SORT],
    });
  }

  const data = await serializeArticleRows(result.rows, { reveal });
  return res.json(serializeList(data, { page, limit, total: result.total }));
}));

/**
 * POST /api/articles/fetch-images
 * Eksik `image_url` alanlarini og:image/twitter:image ile doldurur.
 * Body: {limit?} — HTTP yolunda ust sinir 100 (istek zaman asimina ugramasin;
 * daha buyuk toplu is icin `npm run images` kullanilir).
 */
const IMAGE_HTTP_MAX_LIMIT = 100;

// YETKI: yalnizca admin/editor. Bu uc TUM kiracilarin paylastigi veriyi
// degistiriyor; onceden yalnizca oturum isteniyordu (persona testi sonrasi
// yetki denetiminde bulundu). Paylasilan haber tablosuna yazar ve dis sitelere istek atar.
router.post('/fetch-images', requireRole('admin'), asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  let limit = 25;
  if (body.limit !== undefined && body.limit !== null && body.limit !== '') {
    const n = Number(body.limit);
    if (!Number.isFinite(n) || n <= 0) {
      throw ApiError.badRequest('limit pozitif bir sayı olmalıdır');
    }
    limit = Math.min(IMAGE_HTTP_MAX_LIMIT, Math.floor(n));
  }

  const retryFailed = toBool(body.retry_failed) === true;
  const ozet = await runFetchImages({ limit, retryFailed });
  res.json(ozet);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw ApiError.badRequest('Geçersiz haber kimliği');

  const row = await findArticleRow(id);
  if (!row) throw ApiError.notFound('Haber bulunamadı');

  const reveal = wantsReveal(req);
  const tagMap = await tagsByArticleIds([id]);

  // Kume uyeleri: kendisi haric diger kaynaklarin ayni olayi anlatan haberleri.
  let cluster = null;
  if (row.cluster_id) {
    const memberRows = await findClusterMemberRows(row.cluster_id);
    const members = await serializeArticleRows(memberRows, { reveal });
    const clusterRow = await query(
      'SELECT id, cluster_key, headline, member_count, first_seen_at, last_seen_at, representative_article_id FROM clusters WHERE id = ? LIMIT 1',
      [row.cluster_id],
    );
    const c = clusterRow[0];
    cluster = {
      id: Number(row.cluster_id),
      member_count: Number(c?.member_count ?? members.length),
      headline: c?.headline ?? null,
      representative_article_id: c?.representative_article_id
        ? Number(c.representative_article_id) : null,
      members,
    };
  }

  const article = serializeArticle(row, {
    reveal,
    tags: tagMap.get(id) || [],
    cluster,
  });

  res.json(article);
}));

export default router;
