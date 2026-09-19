// ---------------------------------------------------------------------
// PROFIL VEKTORU URETME ISI
//
//   npm run profile-vectors
//   PROFILE_VECTOR_LIMIT=50 npm run profile-vectors
//
// NEDEN AYRI IS (kayit isteginin ICINDE DEGIL):
// `embed()`'in ILK cagrisi modeli yukluyor — olculdu: 16,6 saniye (sicak
// onbellek), soguk onbellekte ~1,1 GB indirme ve EMBEDDING_LOAD_TIMEOUT_MS
// varsayilani 300.000 ms. Kayit istegi bunu bekleyemez. Kayit
// `profile_vector_status='bekliyor'` yazip doner, bu is doldurur.
//
// SOZLESME (jobs/fetch-images.js deseni): ASLA HATA FIRLATMAZ. Model yok,
// Qdrant yok, DB dalgali — hepsinde ozet basar ve 0 ile cikar. Cunku bu is
// cron'dan kosuyor ve cokmesi sessiz bir veri durmasina donusur.
//
// IDEMPOTENT: profil metni degismediyse (profile_hash ayni) ve vektor
// hazirsa hicbir sey yapmaz.
// ---------------------------------------------------------------------
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool, query } from '../lib/db.js';
import { embed } from '../services/embeddings.js';
import {
  buildProfileText, loadProfileRow, profileHash, tagLabelMap,
} from '../services/personalize.js';

export const DEFAULT_LIMIT = Number(process.env.PROFILE_VECTOR_LIMIT || 200);

/**
 * Yenilenmesi gereken profilleri bulur.
 *
 * IKI KOSUL:
 *  (a) `profile_vector_status='bekliyor'` — kayit/guncelleme isaretledi,
 *  (b) `profile_hash` DEGISMIS — profil metni artik baska bir sey anlatiyor.
 * (b) icin hash'i JS'te yeniden hesaplamak gerekiyor (metin kurulumu
 * services/personalize.js'te), bu yuzden aday satirlar once cekilip
 * sonra suzuluyor. Kullanici sayisi binlere cikarsa `profile_hash`
 * dogrudan DB'de tutuldugu icin yalnizca (a) ile calisilabilir.
 */
async function collectStale(limit) {
  const rows = await query(
    `SELECT user_id FROM user_profiles
      ORDER BY (profile_vector_status = 'bekliyor') DESC, updated_at DESC
      LIMIT ${Math.max(1, Math.min(1000, Number(limit) || DEFAULT_LIMIT))}`,
  );

  const stale = [];
  for (const row of rows) {
    const profile = await loadProfileRow(row.user_id);
    const labels = await tagLabelMap(profile.interest_tag_slugs);
    const text = buildProfileText(profile, labels);
    const hash = profileHash(text);

    const needs = profile.profile_vector_status === 'bekliyor'
      || profile.profile_hash !== hash
      || !Array.isArray(profile.profile_vector)
      || profile.profile_vector.length === 0;

    if (needs) stale.push({ user_id: Number(row.user_id), text, hash, profile });
  }
  return stale;
}

export async function runBuildProfileVectors({ limit = DEFAULT_LIMIT } = {}) {
  const basladi = Date.now();
  const ozet = {
    aday: 0, yazildi: 0, atlandi: 0, hata: 0,
    model: null, dim: null, sure_ms: 0, notlar: [],
  };

  let stale;
  try {
    stale = await collectStale(limit);
  } catch (err) {
    ozet.notlar.push(`profiller okunamadi: ${err.message}`);
    ozet.sure_ms = Date.now() - basladi;
    return ozet;
  }

  ozet.aday = stale.length;
  if (stale.length === 0) {
    ozet.sure_ms = Date.now() - basladi;
    return ozet;
  }

  // Tek toplu cagri: model bir kez yuklenir, tokenize toplu yapilir.
  let emb;
  try {
    emb = await embed(stale.map((s) => s.text));
  } catch (err) {
    // embed() sozlesme geregi firlatmaz; yine de savunmaci.
    emb = { available: false, vectors: [], error: err.message, model: null, dim: null };
  }

  ozet.model = emb.model;
  ozet.dim = emb.dim;

  if (!emb.available || emb.vectors.length !== stale.length) {
    // Model yok: 'hata' YAZMIYORUZ. 'hata' terminal bir durum gibi okunur
    // ve bir dahaki kosumda profil aday listesine girmez; oysa sorun
    // profilde degil ortamda. 'bekliyor' kalir, is tekrar denenir.
    ozet.atlandi = stale.length;
    ozet.notlar.push(`embedding yok: ${emb.error || 'bilinmeyen'} — durum 'bekliyor' birakildi`);
    ozet.sure_ms = Date.now() - basladi;
    return ozet;
  }

  for (let i = 0; i < stale.length; i++) {
    const item = stale[i];
    const vector = emb.vectors[i];
    try {
      if (!Array.isArray(vector) || vector.length === 0) throw new Error('bos vektor');
      await query(
        `UPDATE user_profiles
            SET profile_vector = ?, profile_vector_model = ?, profile_vector_dim = ?,
                profile_vector_status = 'hazir', profile_vector_built_at = NOW(),
                profile_hash = ?
          WHERE user_id = ?`,
        [JSON.stringify(vector), emb.model, vector.length, item.hash, item.user_id],
      );
      ozet.yazildi += 1;
    } catch (err) {
      ozet.hata += 1;
      ozet.notlar.push(`user ${item.user_id}: ${err.message}`);
      await query(
        `UPDATE user_profiles SET profile_vector_status = 'hata' WHERE user_id = ?`,
        [item.user_id],
      ).catch(() => {});
    }
  }

  ozet.sure_ms = Date.now() - basladi;
  return ozet;
}

// --- CLI --------------------------------------------------------------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const limit = Number(process.argv[2]) || DEFAULT_LIMIT;
  runBuildProfileVectors({ limit })
    .then((ozet) => {
      console.log('[profil-vektor]', JSON.stringify(ozet, null, 2));
    })
    .catch((err) => {
      // Buraya dusmemeli; dusse bile is kirmizi cikmasin (cron gurultusu).
      console.error('[profil-vektor] beklenmeyen hata:', err?.message || err);
    })
    .finally(() => pool.end().catch(() => {}));
}
