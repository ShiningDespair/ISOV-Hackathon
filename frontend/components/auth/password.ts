/**
 * SIFRE POLITIKASI ve GUC GOSTERGESI
 *
 * TEK DOGRULUK NOKTASI: kayit sihirbazi, zorunlu sifre degistirme ekrani ve
 * sifre sifirlama formu ayni fonksiyonlari cagirir. Politikayi uc yere
 * kopyalamak, uc yerde birbirinden kayan esikler uretir.
 *
 * POLITIKA (sozlesme): en az 10 karakter, en az bir harf ve bir rakam.
 * Ozel karakter ZORUNLU DEGIL: zorunlu ozel karakter kurali olculebilir
 * bir guvenlik kazanci saglamadan kullaniciyi "Sifre1!" kalibina iter.
 * Uzunluk tek basina daha guclu bir sinyal oldugu icin guc gostergesi
 * uzunlugu agirlikli sayar.
 */

export const PASSWORD_MIN_LENGTH = 10;

/** Harf kontrolu Unicode duyarli — "şğüöçı" de harftir. */
const HAS_LETTER = /\p{L}/u;
const HAS_DIGIT = /\d/;
const HAS_SYMBOL = /[^\p{L}\d]/u;

/**
 * Politikayi karsilamayan sifrenin EKSIKLERI, kullaniciya gosterilecek
 * cumleler halinde. Bos dizi = sifre gecerli.
 */
export function passwordIssues(value: string): string[] {
  const out: string[] = [];
  if (value.length < PASSWORD_MIN_LENGTH) {
    out.push(`En az ${PASSWORD_MIN_LENGTH} karakter olmalı.`);
  }
  if (!HAS_LETTER.test(value)) out.push("En az bir harf içermeli.");
  if (!HAS_DIGIT.test(value)) out.push("En az bir rakam içermeli.");
  return out;
}

export function isPasswordValid(value: string): boolean {
  return passwordIssues(value).length === 0;
}

export interface PasswordStrength {
  /** 0–4. 0 = bos, 1 = zayif, 4 = cok guclu. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** Skoru artirmanin somut yolu; politikayi karsilayan sifrede de gosterilir. */
  advice: string;
}

/**
 * Guc gostergesi — bilgilendirici, ENGELLEYICI DEGIL.
 * Politikayi karsilayan her sifre kabul edilir; gosterge yalnizca
 * "daha iyisi mumkun" der.
 */
export function passwordStrength(value: string): PasswordStrength {
  if (!value) {
    return { score: 0, label: "Henüz boş", advice: "" };
  }

  let points = 0;
  if (value.length >= 8) points += 1;
  if (value.length >= 12) points += 1;
  if (value.length >= 16) points += 1;
  if (HAS_LETTER.test(value) && HAS_DIGIT.test(value)) points += 1;
  if (HAS_SYMBOL.test(value)) points += 1;
  // Tek karakterin tekrari ("aaaaaaaaaa") uzunluk puanini hak etmiyor.
  if (new Set(value).size <= 3) points -= 2;

  const score = Math.max(1, Math.min(4, points)) as 1 | 2 | 3 | 4;
  const labels: Record<1 | 2 | 3 | 4, string> = {
    1: "Zayıf",
    2: "Orta",
    3: "İyi",
    4: "Güçlü",
  };

  let advice = "";
  if (value.length < 12) advice = "Birkaç karakter daha eklemek en çok işe yarar.";
  else if (!HAS_SYMBOL.test(value)) advice = "İsterseniz bir noktalama işareti ekleyebilirsiniz.";
  else advice = "Bu şifre yeterince güçlü.";

  return { score, label: labels[score], advice };
}

/**
 * E-posta bicim kontrolu — kasten GEVSEK.
 * Amac yazim hatasini yakalamak (bosluk, @ eksik, alan adi eksik); RFC 5322'yi
 * tam uygulayan bir regex gecerli adresleri reddetmekle unlu. Gercek dogrulama
 * zaten sunucuda ve e-posta gonderiminde yapilir.
 */
export function isEmailShaped(value: string): boolean {
  const v = value.trim();
  if (!v || /\s/.test(v)) return false;
  const at = v.indexOf("@");
  if (at < 1 || at !== v.lastIndexOf("@")) return false;
  const domain = v.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}
