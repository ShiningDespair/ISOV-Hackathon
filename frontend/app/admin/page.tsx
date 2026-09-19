/**
 * YÖNETİM PANELİ — /admin
 *
 * Sayfanın kendisi ince bir sunucu bileşeni: yalnızca üst veriyi (metadata)
 * tanımlar. Bütün veri çekme işi istemci tarafında (`AdminPanel`), çünkü
 * oturum httpOnly çerezle taşınıyor ve yetki ekranlarının (401 / 403)
 * doğru gösterilmesi ancak tarayıcıdan `credentials:"include"` ile
 * istenirse mümkün.
 *
 * Görünüm yuvası (`data-view-slot`) KULLANILMAZ: yönetim paneli dört
 * görünümün hepsinde erişilebilir olmalı; yuvasız içerik her modda görünür.
 * Kağıda basılmaz — `yon-page` yazdırma bloğunda gizli.
 */

import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin/AdminPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Yönetim Paneli",
  description:
    "Kullanıcı ve rol yönetimi, SMTP yapılandırması, sıralama ağırlıkları, gönderim kaydı ve NACE sektör kapsamı.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminPanel />;
}
