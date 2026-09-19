-- OLCUM ICIN SAHTE PROFILLER (8 pozisyon). Olcum bitince silinir.
SET @t := (SELECT id FROM tenants WHERE tenant_key='isov' LIMIT 1);

INSERT INTO users (tenant_id,email,password_hash,full_name,title,role,status)
VALUES
 (@t,'olcum-ust-yonetim@olcum.local','scrypt$0$0$0$x$x','Ölçüm Üst Yönetim','GM','uye','aktif'),
 (@t,'olcum-strateji@olcum.local','scrypt$0$0$0$x$x','Ölçüm Strateji','Strateji','uye','aktif'),
 (@t,'olcum-tesvik-finansman@olcum.local','scrypt$0$0$0$x$x','Ölçüm Teşvik','Teşvik','uye','aktif'),
 (@t,'olcum-dis-ticaret@olcum.local','scrypt$0$0$0$x$x','Ölçüm Dış Ticaret','İhracat','uye','aktif'),
 (@t,'olcum-uretim-operasyon@olcum.local','scrypt$0$0$0$x$x','Ölçüm Üretim','Üretim','uye','aktif'),
 (@t,'olcum-enerji-surdurulebilirlik@olcum.local','scrypt$0$0$0$x$x','Ölçüm Enerji','Enerji','uye','aktif'),
 (@t,'olcum-mevzuat-hukuk@olcum.local','scrypt$0$0$0$x$x','Ölçüm Mevzuat','Hukuk','uye','aktif'),
 (@t,'olcum-medya-iletisim@olcum.local','scrypt$0$0$0$x$x','Ölçüm Medya','İletişim','uye','aktif')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);

INSERT INTO user_profiles
 (user_id,position_code,time_budget_min,primary_sector_code,secondary_sector_codes,region_focus,interest_tag_slugs,muted_tag_slugs,profile_vector_status)
SELECT u.id, p.pos, p.budget, p.prim, p.sec, p.reg, p.ilgi, p.sessiz, 'bekliyor'
FROM users u JOIN (
 SELECT 'olcum-ust-yonetim@olcum.local' em,'ust-yonetim' pos,5 budget,'C28' prim,
        CAST('["C24"]' AS JSON) sec, CAST('["TURKIYE","KURESEL"]' AS JSON) reg,
        CAST('["enflasyon","faiz-karari","buyume"]' AS JSON) ilgi, CAST('[]' AS JSON) sessiz
 UNION ALL SELECT 'olcum-strateji@olcum.local','strateji',5,'C26',
        CAST('["J"]' AS JSON), CAST('["KURESEL","ASYA"]' AS JSON),
        CAST('["yapay-zeka","yatirim","tedarik-zinciri"]' AS JSON), CAST('[]' AS JSON)
 UNION ALL SELECT 'olcum-tesvik-finansman@olcum.local','tesvik-finansman',15,'C25',
        CAST('["C28"]' AS JSON), CAST('["TURKIYE"]' AS JSON),
        CAST('["tesvik","kosgeb","hibe","tubitak"]' AS JSON), CAST('[]' AS JSON)
 UNION ALL SELECT 'olcum-dis-ticaret@olcum.local','dis-ticaret',5,'C13',
        CAST('["C24"]' AS JSON), CAST('["AMERIKA","AVRUPA"]' AS JSON),
        CAST('["ihracat","tarife","anti-damping"]' AS JSON), CAST('[]' AS JSON)
 UNION ALL SELECT 'olcum-uretim-operasyon@olcum.local','uretim-operasyon',5,'C24',
        CAST('["C25"]' AS JSON), CAST('["TURKIYE","KURESEL"]' AS JSON),
        CAST('["tedarik-zinciri","hammadde","navlun","lojistik"]' AS JSON), CAST('[]' AS JSON)
 UNION ALL SELECT 'olcum-enerji-surdurulebilirlik@olcum.local','enerji-surdurulebilirlik',15,'D35',
        CAST('["C20"]' AS JSON), CAST('["AVRUPA","TURKIYE"]' AS JSON),
        CAST('["cbam","enerji-maliyeti","yesil-mutabakat","karbon"]' AS JSON), CAST('[]' AS JSON)
 UNION ALL SELECT 'olcum-mevzuat-hukuk@olcum.local','mevzuat-hukuk',2,'C20',
        CAST('["C22"]' AS JSON), CAST('["TURKIYE"]' AS JSON),
        CAST('["mevzuat-degisikligi","ab-mevzuati","teblig"]' AS JSON), CAST('[]' AS JSON)
 UNION ALL SELECT 'olcum-medya-iletisim@olcum.local','medya-iletisim',2,'J',
        CAST('["G"]' AS JSON), CAST('["TURKIYE","KURESEL"]' AS JSON),
        CAST('["iso","duyuru","sanayi-uretimi"]' AS JSON), CAST('[]' AS JSON)
) p ON p.em = u.email
ON DUPLICATE KEY UPDATE
 position_code=VALUES(position_code), time_budget_min=VALUES(time_budget_min),
 primary_sector_code=VALUES(primary_sector_code), secondary_sector_codes=VALUES(secondary_sector_codes),
 region_focus=VALUES(region_focus), interest_tag_slugs=VALUES(interest_tag_slugs),
 profile_vector_status='bekliyor';

SELECT u.id,u.email,p.position_code,p.time_budget_min FROM users u JOIN user_profiles p ON p.user_id=u.id WHERE u.email LIKE 'olcum-%';
