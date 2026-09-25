// ---------------------------------------------------------------------
// GERCEK TARAYICI ILE SENARYO KOSUCUSU
//
// Neden var: projede bugune kadar HIC tarayici testi yapilmadi. Sunucuda
// masaustu tarayici yok; ama backend imajinda PDF uretimi icin Chromium
// (puppeteer-core) zaten kurulu. Bu betik o Chromium'u kullanip siteyi
// gercek bir kullanici gibi gezer: giris yapar, tiklar, yazar, ekran
// goruntusu alir, konsol hatalarini ve basarisiz istekleri toplar.
//
// Istemci tarafinda hidrasyonla acilan her sey (Hesabim menusu, profil
// formu, kayan serit, gorunum anahtari) sunucu HTML'inde gorunmuyordu;
// burada JS calistigi icin GORUNUR.
//
// CALISTIRMA: dogrudan degil, scripts/tarayici.sh uzerinden (betigi
// konteynere kopyalar, kosturur, ekran goruntulerini disari alir).
//
// Senaryo JSON:
// {
//   "base": "https://hackathon.dhsyazilim.com",
//   "login": {"email": "...", "password": "..."},      // istege bagli
//   "viewport": {"width": 1440, "height": 900},          // ya da "mobil"
//   "steps": [
//     {"goto": "/"},
//     {"shot": "ana-sayfa"},                 // ekran; "full": true tum sayfa
//     {"click": "text=Bana Özel"},           // CSS secici ya da text=...
//     {"type": {"sel": "input[name=q]", "text": "CBAM"}},
//     {"press": "Enter"},
//     {"wait": 800},
//     {"waitFor": ".hesap-dugme"},
//     {"eval": "document.title"},            // sonucu rapora yazar
//     {"text": "main"},                      // ogenin gorunur metni (ilk 3000)
//     {"viewport": "mobil"},                 // 390x844
//     {"scroll": 1200}
//   ]
// }
//
// Cikti: stdout'a JSON rapor; ekran goruntuleri /tmp/tarayici/<ad>.png
// ---------------------------------------------------------------------
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT = '/tmp/tarayici';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  masaustu: { width: 1440, height: 900, deviceScaleFactor: 1 },
  laptop: { width: 1280, height: 800, deviceScaleFactor: 1 },
  mobil: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

function vp(v) {
  if (!v) return VIEWPORTS.masaustu;
  if (typeof v === 'string') return VIEWPORTS[v] || VIEWPORTS.masaustu;
  return { deviceScaleFactor: 1, ...v };
}

const senaryo = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const base = (senaryo.base || 'https://hackathon.dhsyazilim.com').replace(/\/+$/, '');

const rapor = { adimlar: [], konsolHatalari: [], basarisizIstekler: [], sayfaHatalari: [] };

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=tr-TR', '--font-render-hinting=none'],
});

try {
  const page = await browser.newPage();
  await page.setViewport(vp(senaryo.viewport));
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'tr-TR,tr;q=0.9' });
  if (senaryo.reducedMotion) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  }

  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      rapor.konsolHatalari.push(`[${m.type()}] ${m.text()}`.slice(0, 400));
    }
  });
  page.on('pageerror', (e) => rapor.sayfaHatalari.push(String(e?.message || e).slice(0, 400)));
  page.on('response', (r) => {
    const s = r.status();
    if (s >= 400 && !r.url().includes('/_next/static')) {
      rapor.basarisizIstekler.push(`${s} ${r.request().method()} ${r.url().replace(base, '')}`);
    }
  });

  // --- Giris: gercek giris formu uzerinden, API kisa yolu DEGIL ----------
  if (senaryo.login) {
    await page.goto(`${base}/giris`, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.type('input[type=email], input[name=email]', senaryo.login.email, { delay: 10 });
    await page.type('input[type=password]', senaryo.login.password, { delay: 10 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => null),
      page.keyboard.press('Enter'),
    ]);
    rapor.adimlar.push({ adim: 'giris', url: page.url().replace(base, '') });
  }

  async function bul(sel) {
    if (sel.startsWith('text=')) {
      const aranan = sel.slice(5);
      const handle = await page.evaluateHandle((t) => {
        const adaylar = [...document.querySelectorAll('a,button,[role=button],[role=menuitem],label,summary,input[type=submit]')];
        return adaylar.find((el) => el.offsetParent !== null && (el.innerText || el.value || '').trim().includes(t)) || null;
      }, aranan);
      const el = handle.asElement();
      if (!el) throw new Error(`bulunamadi: ${sel}`);
      return el;
    }
    await page.waitForSelector(sel, { timeout: 8000, visible: true });
    return page.$(sel);
  }

  for (const [i, adim] of (senaryo.steps || []).entries()) {
    const kayit = { i, adim };
    try {
      if (adim.goto !== undefined) {
        const r = await page.goto(adim.goto.startsWith('http') ? adim.goto : base + adim.goto, {
          waitUntil: 'networkidle2', timeout: 45000,
        });
        kayit.http = r?.status();
        kayit.url = page.url().replace(base, '');
      } else if (adim.click) {
        const el = await bul(adim.click);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => null),
          el.click(),
        ]);
        kayit.url = page.url().replace(base, '');
      } else if (adim.type) {
        const el = await bul(adim.type.sel);
        await el.click({ clickCount: 3 });
        await el.type(adim.type.text, { delay: 15 });
      } else if (adim.press) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => null),
          page.keyboard.press(adim.press),
        ]);
        kayit.url = page.url().replace(base, '');
      } else if (adim.wait) {
        await new Promise((r) => setTimeout(r, adim.wait));
      } else if (adim.waitFor) {
        await page.waitForSelector(adim.waitFor, { timeout: 10000 });
      } else if (adim.viewport) {
        await page.setViewport(vp(adim.viewport));
      } else if (adim.scroll !== undefined) {
        await page.evaluate((y) => window.scrollTo(0, y), adim.scroll);
        await new Promise((r) => setTimeout(r, 300));
      } else if (adim.eval) {
        kayit.sonuc = await page.evaluate(adim.eval);
      } else if (adim.text) {
        kayit.sonuc = await page.evaluate((s) => {
          const el = document.querySelector(s);
          return el ? el.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 3000) : null;
        }, adim.text);
      } else if (adim.shot) {
        const dosya = `${OUT}/${adim.shot}.png`;
        await page.screenshot({ path: dosya, fullPage: Boolean(adim.full) });
        kayit.dosya = dosya;
        // Ilk ekranda (fold) ne var: kaydirmadan gorunen haber basligi sayisi.
        kayit.ilkEkran = await page.evaluate(() => {
          const h = window.innerHeight;
          const basliklar = [...document.querySelectorAll('a[href^="/haber/"]')]
            .filter((a) => { const r = a.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.top < h && a.innerText.trim().length > 15; });
          const ilk = [...document.querySelectorAll('a[href^="/haber/"]')]
            .map((a) => a.getBoundingClientRect()).filter((r) => r.height > 0)
            .map((r) => Math.round(r.top + window.scrollY)).sort((a, b) => a - b)[0] ?? null;
          return {
            gorunumHtml: document.documentElement.dataset.view || null,
            ekranYuksekligi: h,
            ilkEkrandakiHaberBasligi: new Set(basliklar.map((a) => a.getAttribute('href'))).size,
            ilkHaberBasligininYOffseti: ilk,
            yatayTasma: document.documentElement.scrollWidth > window.innerWidth + 1,
            sayfaYuksekligi: document.documentElement.scrollHeight,
          };
        });
      }
    } catch (e) {
      kayit.hata = String(e?.message || e).slice(0, 300);
    }
    rapor.adimlar.push(kayit);
  }
  rapor.sonUrl = page.url().replace(base, '');
} finally {
  await browser.close();
}

process.stdout.write(JSON.stringify(rapor, null, 2));
