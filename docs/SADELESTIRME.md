# TUR 3 — SADELESTIRME, HESABIM ve KAYNAK GORSELLERI

Bu dosya bu turdaki paralel isin TEK sozlesmesidir. Ajanlar birbirinin
dosyasina DOKUNMAZ; ortak bir sey gerekiyorsa buraya yazilmis haldedir.

## 0. DEGISMEYEN KURALLAR (onceki turlardan, ihlali hata sayilir)

1. `importance_score` ARAYUZDE HIC GOSTERILMEZ. Yalnizca `importance_band`.
2. API'den gelen haber dizisi YENIDEN SIRALANMAZ. Bolumleme (partition)
   serbest, siralama degil. Bu bir kez bozuldu: manset en yuksek skorlu
   haber yerine ayni bandin en yenisi oldu.
3. Sayi yoksa "—" basilir, SIFIR UYDURULMAZ.
4. Uc yayinda degilse (404/501) kullaniciya "yayinda degil" denir; oturum
   yokluguyla (401/403) KARISTIRILMAZ.
5. Renk tek basina bilgi tasimaz (WCAG 1.4.1). Aciliyet/onem metne de yazilir.
6. 400 piksel genislikte sayfa govdesi YATAY KAYMAZ. Yatay kayma yalnizca
   kendi `overflow-x:auto` kabinin icinde olur.
7. Turkce imla tam: i̇ ı ş ğ ü ö ç. ASCII'ye katlama YOK. (Yalnizca slug'lar,
   CSS sinif adlari ve dosya adlari ASCII.)
8. Hicbir istemci fonksiyonu exception firlatmaz; hata donus degerinde tasinir.

## 1. globals.css'E KIMSE DOKUNMAZ

`frontend/app/globals.css` bu turda KILITLI. Sebep: yazdirma/gorunum
anahtari oncelik (specificity) tuzagi bir kez bos PDF uretti; o dosyanin
sirasi kritik ve paralel yazimda bozulur.

Her ajanin kendi CSS dosyasi var ve `globals.css` icine `@import` ile
ZATEN baglanmis durumda (en ustte, `@import "tailwindcss";` hemen altinda):

| Ajan | Dosya |
|---|---|
| A | `frontend/app/css/hesap.css` |
| B | `frontend/app/css/akis.css` |
| C | `frontend/app/css/serit.css` |
| D | `frontend/app/css/kaynak.css` |
| E | `frontend/app/css/birlesik.css` |

KURALLAR:
- Yalnizca KENDINE AIT yeni sinif adlari yaz. Onekler: A `hesap-`,
  B `akis-`, C `serit-`, D `kaynak-`, E `birlesik-`.
- Bu dosyalar globals.css'ten ONCE yuklenir. Bu yuzden MEVCUT bir secicinin
  ustune ayni ozgullukte yazarsan KAYBEDERSIN. Mevcut bir bileseni
  degistirmen gerekiyorsa yeni bir `data-*` niteligi ekle ve
  `.mevcut-sinif[data-yeni="deger"]` ile sec — nitelik seciciyi bir kademe
  yukari tasir, sira onemsiz hale gelir.
- `[data-view-slot]`, `html[data-view]` ve gorunum yuvalarini gizleyen
  `@media print` kurallari YAZILMAZ. Kendi `serit-`/`akis-` siniflarini
  yazdirmada gizlemek serbest.
- `@theme` jetonu eklenmez; var olan `--color-*` degiskenleri kullanilir.
- MEVCUT bir seciciyi gercekten degistirmek gerekiyorsa: DOSYAYI
  DEGISTIRME, son mesajinda "globals.css yamasi" basligi altinda tam
  eski/yeni metni ver. Supervisor uygular.

## 2. YENI GEZINTI (Ajan A sahibi)

Ust bar 8 baglantidan 3'e duser. Tasinanlar:

| Eski | Yeni yer |
|---|---|
| `/panelim` | `/` icindeki "Bana Ozel / Genel" anahtari (Ajan B) |
| `/degisiklikler` | `/raporlar` icinde modul (Ajan E) |
| `/etiketler` | `/istatistik` icinde modul (Ajan E) |
| `/ayarlar` | Hesabim menusu (Ajan A) |
| `/admin` | Hesabim menusu, yalnizca admin (Ajan A) |
| `/durum` | Hesabim menusu + alt bilgi (Ajan A) |

Kalan ust bar: **Bulten (`/`) · Raporlar (`/raporlar`) · Istatistik
(`/istatistik`)** + sagda **Hesabim** ve gorunum anahtari.

Eski yollar YASAMAYA DEVAM EDER, `redirect()` ile yeni yerine gonderir —
disarida paylasilmis bir baglanti 404 vermesin.

## 3. GORUNUM VARSAYILANI (Ajan A + Ajan F)

Pozisyon -> varsayilan gorunum. Esleme TEK YERDE:
`backend/src/lib/positions.js` -> `POSITION_VIEW`.

```
'ust-yonetim'  -> 'gorsel'     (en ust duzey yonetici: gorsel acilir)
digerleri (7)  -> 'kart'       (normal kullanici: kart acilir)
```

Tasima: backend giriste ve profil guncellemesinde **httpOnly OLMAYAN**
bir cerez yazar:

```
isov_view   = 'panel' | 'gazete' | 'gorsel' | 'kart'
path=/, sameSite=lax, secure (uretimde), maxAge = oturum TTL
```

Frontend onyukleme betigi (`ViewProvider.VIEW_BOOTSTRAP_SCRIPT`) sirayla:
1. `localStorage['isov:view']` — KULLANICININ ACIK SECIMI, her zaman kazanir
2. `isov_view` cerezi — rolden gelen varsayilan
3. `'panel'`

`setView()` yalnizca kullanici anahtara bastiginda cagrildigi icin
localStorage'in VARLIGI "acik secim yapilmis" demektir. Bu davranis
korunur; profil degisince rolden gelen varsayilanin kullanicinin secimini
ezmemesi bilincli.

`/auth/me` yaniti ayrica `default_view` alanini dondurur (Ajan F).

## 4. VAKIT BUTCESI: 15 dk -> 10 dk (Ajan F + Ajan B)

Kullanici ucuncu kademeyi 10 dakika istedi. `user_profiles.time_budget_min`
TINYINT, ENUM degil — goc gerekmiyor.

Yeni DENSITY (tek kaynak `backend/src/lib/positions.js`, aynasi
`frontend/lib/api-panel.ts`):

```
 2: { items: 5,  full: 0, bullets: 0, style: 'tek-cumle' }
 5: { items: 12, full: 0, bullets: 3, style: 'madde'     }
10: { items: 20, full: 6, bullets: 3, style: 'kademeli'  }
```

`normalizeTimeBudget()` GERIYE UYUMLU olmak zorunda: DB'de 15 yazan
kullanici var olabilir, 15 -> 10'a esler. Bilinmeyen deger -> 5.

## 5. KAYNAK GORSELLERI (Ajan D)

Haberin kendi `image_url`'i VARSA o kullanilir. Yoksa kaynaga ozgu
tipografik amblem uretilir — ag istegi YOK, satir ici SVG.

Uc kademe:
1. **Adlandirilmis tasarim** — onemli kaynaklar icin elle tasarlanmis
   (Resmi Gazete: cift kural cercevesi + "T.C. RESMI GAZETE" + SAYI/tarih;
   EUR-Lex, Federal Register, ISO, ISOV, TOBB, KOSGEB, TUBITAK, Ticaret
   Bakanligi, TIM, TSE, TurkPatent, ECB, IEA, Eurostat, USTR ...).
2. **Arketip** — `sources.source_type` bazinda gorsel dil:
   `mevzuat` / `kurum` / `acik_veri` / `basin` / `uluslararasi` / `diger`.
3. **Monogram** — ad bas harfleri + ulke kodu + slug'dan tureyen
   deterministik palet. 81 kaynagin tamami bir seye duser, bos kutu YOK.

Palet `@theme` jetonlarindan tureyecek, yeni marka rengi icat edilmeyecek;
kagit/murekkep/vurgu ve bunlarin acik/koyu tonlari.

## 6. UST BOLUM BUTCESI (Ajan B)

Olculebilir kural: `/` ilk ekranda (1440x900 ve 390x844) **ilk haber
baslgi gorunur olmak zorunda**. KPI'lar tek satirlik sik bir serit;
grafikler `/istatistik`'e tasinir.

## 7. SERIT (Ajan C)

Otomatik, yavas, surekli kayan serit (haber kanali alt yazisi). Zorunlu:
- `:hover` ve `:focus-within` iken DURUR.
- `prefers-reduced-motion: reduce` ve `html[data-a11y-motion="azalt"]`
  altinda hareket YOK — elle kaydirilan bugunku hale duser.
- Kopyalanan (gorsel surekliligi icin ikinci kez basilan) liste
  `aria-hidden="true"` ve odaklanamaz (`tabindex=-1` ya da DOM'dan disari).
  Ekran okuyucu basliklari iki kez okumaz.
- Sayfa govdesi yine yatay kaymaz.

## 8. DOGRULAMA (her ajan kendi isini)

- `cd frontend && npx tsc --noEmit` temiz.
- `docker compose build frontend` (ya da backend) hatasiz.
- Iddia degil OLCUM: curl ile HTML cek, `grep -c` ile say, boyut yaz.
- Kendi bolumun icin `frontend/lib/feature-status.ts` satirini GUNCELLEMEZ
  (o dosya supervisor'da; degisiklik gerekiyorsa son mesajinda soyle).
