#!/usr/bin/env node
// ---------------------------------------------------------------------
// GOC (MIGRATION) — `npm run migrate`
//
// NEDEN BU IS VAR:
// docker-compose `db/init`i /docker-entrypoint-initdb.d olarak bagliyor ve
// MySQL o dizini YALNIZCA BOS veri dizininde kosar. Canli DB'de 131 haber
// var, dolayisiyla `03_users.sql` kendiliginden HIC uygulanmaz. Bu is AYNI
// DOSYAYI okuyup calistirir — tek dosya, iki yol, ayrisma yok. Semayi
// burada yeniden yazmak, DDL'in iki yerde kopyalanip birbirinden kaymasi
// demek olurdu.
//
// IDEMPOTENT: tum DDL `CREATE TABLE IF NOT EXISTS`, tohum satiri
// `ON DUPLICATE KEY UPDATE`, kosullu ALTER'lar information_schema
// kontrolunden geciyor. Iki kez kosmak hata uretmez.
// ---------------------------------------------------------------------
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool, query } from '../lib/db.js';
import { seedAdminUser } from '../services/authService.js';

process.env.TZ = process.env.TZ || 'Europe/Istanbul';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.resolve(HERE, '../../db/init/03_users.sql');

function line(char = '-') {
  return char.repeat(64);
}

/**
 * SQL dosyasini calistirilabilir ifadelere boler.
 *
 * Basit ayirici bilincli: dosyada saklı yordam, tetikleyici ya da icinde
 * ';' gecen bir metin sabiti YOK; DELIMITER oyunlarina gerek duymayan
 * duz DDL. Tam bir SQL ayristiricisi yazmak buradaki riske gore fazla
 * olurdu. Yorum satirlari once atiliyor ki '--' icindeki noktali virgul
 * yanlis bolmeye yol acmasin.
 */
function splitStatements(sql) {
  const cleaned = sql
    .split('\n')
    .filter((raw) => {
      const t = raw.trim();
      return t.length > 0 && !t.startsWith('--');
    })
    .join('\n');

  return cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Ifadenin hedefledigi tablo adi — ozet raporu icin. */
function tableNameOf(statement) {
  const m = statement.match(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/i);
  return m ? m[1] : null;
}

async function listTables() {
  const rows = await query(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
  );
  return new Set(rows.map((r) => r.name));
}

async function columnExists(table, column) {
  const row = await query(
    `SELECT 1 AS ok FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column],
  );
  return row.length > 0;
}

async function indexExists(table, indexName) {
  const row = await query(
    `SELECT 1 AS ok FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
      LIMIT 1`,
    [table, indexName],
  );
  return row.length > 0;
}

// ---------------------------------------------------------------------
// KOSULLU ALTER'LAR
//
// Bu degisiklikler canli veritabaninda ZATEN UYGULANMIS durumda ve
// db/init/02_*.sql sifirdan kurulumda dogru semayi uretiyor. Yine de
// burada kontrol ediliyor: arada bir yerde eski bir dump'tan kurulan
// veritabani, kolon eksikligini ancak calisma aninda "Unknown column"
// hatasiyla belli ederdi. Kontrol ucuz (information_schema), hata pahali.
//
// `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` MySQL 8'de YOK (MariaDB'de
// var) — bu yuzden information_schema'ya bakmak zorundayiz.
// ---------------------------------------------------------------------
const CONDITIONAL_COLUMNS = [
  {
    table: 'articles',
    column: 'summary_short',
    sql: "ALTER TABLE articles ADD COLUMN summary_short VARCHAR(400) NULL AFTER summary_en",
    why: 'vakit butcesi 2 dk: tek cumlelik ozet',
  },
  {
    table: 'articles',
    column: 'summary_medium',
    sql: 'ALTER TABLE articles ADD COLUMN summary_medium TEXT NULL AFTER summary_short',
    why: 'vakit butcesi 5 dk: 3 maddelik ozet',
  },
  {
    table: 'articles',
    column: 'summary_source',
    sql: "ALTER TABLE articles ADD COLUMN summary_source ENUM('heuristik','llm') NOT NULL DEFAULT 'heuristik' AFTER summary_medium",
    why: 'LLM anahtari geldiginde uretilmis metni heuristikten ayirmak',
  },
];

const CONDITIONAL_INDEXES = [
  {
    table: 'reports',
    index: 'uq_reports_period',
    sql: 'ALTER TABLE reports ADD UNIQUE KEY uq_reports_period (period_start, period_end, period_type)',
    why: 'POST /reports/generate iki kez cagrilinca ayni donem iki rapor uretmesin',
  },
];

async function applyConditionalAlters(report) {
  for (const item of CONDITIONAL_COLUMNS) {
    if (!(await columnExists(item.table, item.column))) {
      try {
        await query(item.sql);
        report.alters.push(`+ kolon eklendi: ${item.table}.${item.column}  (${item.why})`);
      } catch (err) {
        report.warnings.push(`! ${item.table}.${item.column} eklenemedi: ${err.message}`);
      }
    } else {
      report.alters.push(`= kolon zaten var: ${item.table}.${item.column}`);
    }
  }

  for (const item of CONDITIONAL_INDEXES) {
    if (!(await indexExists(item.table, item.index))) {
      try {
        await query(item.sql);
        report.alters.push(`+ indeks eklendi: ${item.table}.${item.index}  (${item.why})`);
      } catch (err) {
        // Mevcut veride cakisan donem varsa UNIQUE kurulamaz. Bu goc'u
        // tamamen basarisiz saymak yanlis olur: tablolar kuruldu, yalnizca
        // bu kisit elle temizlik istiyor.
        report.warnings.push(
          `! ${item.table}.${item.index} kurulamadi: ${err.message}\n`
          + '    (muhtemelen ayni doneme ait yinelenen rapor satirlari var; elle temizlenmeli)',
        );
      }
    } else {
      report.alters.push(`= indeks zaten var: ${item.table}.${item.index}`);
    }
  }
}

// ---------------------------------------------------------------------
// ADMIN TOHUMLAMA
//
// SIFRE HICBIR KOSULDA LOGLANMAZ. Yalnizca e-posta ve sonucun ne oldugu
// yazilir. Ortam degiskeni yoksa adim ATLANIR ve bu ACIKCA soylenir —
// "admin nerede?" sorusu demo aninda sorulmasin.
// ---------------------------------------------------------------------
async function seedAdmin(report) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    report.admin = 'ATLANDI — ADMIN_EMAIL ve ADMIN_PASSWORD ortam degiskenleri tanimli degil.';
    return;
  }

  try {
    const result = await seedAdminUser({
      email,
      password,
      tenantKey: process.env.ADMIN_TENANT_KEY || 'isov',
      fullName: process.env.ADMIN_FULL_NAME || 'Sistem Yöneticisi',
    });
    report.admin = `${result.action} — ${result.email} (id=${result.userId}, role=admin, `
      + 'must_change_password=1)';
  } catch (err) {
    // Hata mesaji sifre icermez (seedAdminUser politika ihlalinde yalnizca
    // kuralı yazar, degeri yazmaz).
    report.admin = `HATA — ${err.message}`;
    report.warnings.push(`! admin tohumlanamadi: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
async function main() {
  const report = {
    existing: [],
    created: [],
    alters: [],
    warnings: [],
    admin: '-',
    statements: 0,
  };

  console.log(line('='));
  console.log('  ISOV GOC — db/init/03_users.sql');
  console.log(line('='));
  console.log(`  dosya : ${SQL_FILE}`);
  console.log(`  db    : ${process.env.DB_NAME || 'isov'} @ ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306}`);
  console.log('');

  const sql = await readFile(SQL_FILE, 'utf8');
  const statements = splitStatements(sql);

  const before = await listTables();

  // Tek baglanti: `SET NAMES utf8mb4` gibi oturum ayarlari sonraki
  // ifadelerde de gecerli olsun (havuzdan her seferinde farkli baglanti
  // gelse ayar kaybolurdu).
  const conn = await pool.getConnection();
  try {
    for (const statement of statements) {
      const table = tableNameOf(statement);
      try {
        await conn.query(statement);
        report.statements += 1;
        if (table) {
          if (before.has(table)) report.existing.push(table);
          else report.created.push(table);
        }
      } catch (err) {
        console.error(`\n  HATA: ifade calistirilamadi:\n  ${statement.slice(0, 160)}...`);
        throw err;
      }
    }
  } finally {
    conn.release();
  }

  await applyConditionalAlters(report);
  await seedAdmin(report);

  // --- ozet ----------------------------------------------------------
  console.log(line());
  console.log(`  Calistirilan ifade      : ${report.statements}`);
  console.log(`  Zaten var olan tablolar : ${report.existing.length ? report.existing.join(', ') : '(yok)'}`);
  console.log(`  Olusturulan tablolar    : ${report.created.length ? report.created.join(', ') : '(yok — hepsi zaten vardi)'}`);
  console.log(line());
  for (const a of report.alters) console.log(`  ${a}`);
  console.log(line());
  console.log(`  Admin tohumlama : ${report.admin}`);
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.log('    Kullanim: ADMIN_EMAIL=admin@isov.org.tr ADMIN_PASSWORD="..." npm run migrate');
    console.log('    (sifre en az 10 karakter, en az bir harf ve bir rakam; asla loglanmaz)');
  }
  if (report.warnings.length) {
    console.log(line());
    console.log('  UYARILAR:');
    for (const w of report.warnings) console.log(`  ${w}`);
  }
  console.log(line('='));
  console.log('  Goc tamamlandi. (Idempotent: tekrar calistirmak guvenli.)');
  console.log(line('='));
  console.log('');
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n  GOC BASARISIZ:', err.message);
    if (process.env.NODE_ENV !== 'production') console.error(err.stack);
    try { await closePool(); } catch { /* yoksay */ }
    process.exit(1);
  });
