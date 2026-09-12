// ---------------------------------------------------------------------
// MySQL baglanti havuzu.
// Havuz modul seviyesinde tek sefer kurulur; her istek icin yeni baglanti
// acmak hackathon yukunde bile gereksiz gecikme yaratirdi.
// ---------------------------------------------------------------------
import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'isov',

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  // Tum zaman damgalari TRT. Sema da `SET time_zone='+03:00'` ile ayni varsayimda.
  timezone: '+03:00',
  charset: 'utf8mb4',

  // dateStrings KAPALI: DATETIME kolonlari JS Date olarak gelsin ki
  // tazelik (recency) hesabi ve ISO serilestirme dogru calissin.
  dateStrings: false,

  // simhash BIGINT UNSIGNED — Number'a sigmaz, string olarak alip BigInt'e ceviriyoruz.
  supportBigNumbers: true,
  bigNumberStrings: true,

  // Cok satirli toplu INSERT'lerde seeder'in isine yariyor.
  multipleStatements: false,
});

/**
 * Parametreli sorgu kisayolu. SQL enjeksiyonuna karsi tek giris noktasi:
 * dinamik deger DAIMA `params` uzerinden gider, string birlestirme ile degil.
 */
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Tek satir donduren yardimci — bulunamazsa null. */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/**
 * Islem (transaction) sarmalayicisi. Callback hata firlatirsa rollback edilir.
 * Seeder ve rapor uretimi gibi cok adimli yazmalarda kullanilir.
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* rollback hatasi orijinal hatayi gizlemesin */ }
    throw err;
  } finally {
    conn.release();
  }
}

/** Saglik kontrolu: DB gercekten cevap veriyor mu? */
export async function pingDb() {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.ping();
      return true;
    } finally {
      conn.release();
    }
  } catch {
    return false;
  }
}

export async function closePool() {
  await pool.end();
}
