# BlockCtrl proje iyileştirme raporu

Tarih: 16 Eylül 2026

## Bu geçişte uygulananlar

1. `panel-settings` API'sindeki kritik kalıcılık hatası düzeltildi. Kapak görseli/video, sunucu alt başlığı, kart teması ve geçiş ayarları artık `server_settings.settings` içinde gerçekten saklanıyor.
2. Medya URL'leri, sunucu alt başlığı ve kart geçişleri için sunucu tarafı doğrulama eklendi.
3. Yönetim Merkezi'ndeki işlem yapmayan örnek `Kaydet`, destek türü ve medya kontrolleri kaldırıldı veya gerçek mevcut akışlara bağlandı.
4. Sunucu görünümü için canlı önizleme ve gerçek kaydetme akışı eklendi.
5. Dünya oluştururken şablon seçimi kullanıcıya açıldı; kaynak yönetimi gerçek sunucu paneline yönlendirildi.
6. Bilgilendirme ve destek ekranları mevcut Support Center akışına bağlandı.
7. Sunucu kartındaki ikinci `window.prompt` tabanlı düzenleme akışı kaldırılarak tek yönetim merkezinde birleştirildi.
8. `İşlem Geçmişi` başlığındaki bozuk karakterler düzeltildi.
9. Global CSS'te BlockCtrl yeşil temasını işletim sistemi koyu tema tercihiyle ezen çakışan tema bloğu kaldırıldı.
10. Next.js güvenlik/operasyon yapılandırması düzenlendi; framework imzası kapatıldı, HSTS/Permissions-Policy güncellendi ve CSP raporlama kapsamı genişletildi.
11. `loading.tsx`, `error.tsx`, `not-found.tsx` ve `GET /api/health` eklendi.
12. Proje paket adı `blockctrl-panel` olarak düzeltildi; Node.js motor gereksinimi, `typecheck`, `check` ve agent scriptleri eklendi.
13. README, v0 başlangıç metninden gerçek proje dokümantasyonuna dönüştürüldü.
14. Panel ve agent için ayrı `.env.example` dosyaları eklendi; gerçek anahtar/token içermeden desteklenen ortam değişkenleri belgelendi.
15. Kök klasördeki önemli `(1)` yapılandırma kopyaları, `app` içindeki `globals/layout` kopyaları, `components` içindeki auth/control/infrastructure/file-manager snapshot'ları ve agent içindeki `(1)`/eski `src` snapshot'ı `_archive` klasörüne taşındı. Hiçbiri silinmedi.
16. `PROJECT_AUDIT.md` proje köküne eklenerek bu değişiklikler ve kalan teknik borç görünür hale getirildi.

## Doğrulama

- `next.config.mjs` Node.js sözdizimi kontrolünden geçti.
- `package.json` JSON doğrulamasından geçti.
- TypeScript derleyicisi değiştirilmiş TS/TSX dosyalarında sözdizimi taraması için çalıştırıldı; parse/syntax hatası görülmedi.
- Bu çalışma ortamındaki Drive kopyasında `node_modules` bulunmadığı için tam `pnpm build`/`pnpm lint` bağımlılık çözümlemeli olarak çalıştırılamadı. Proje gerçek çalışma ortamına alındığında ilk CI adımı `pnpm install --frozen-lockfile && pnpm check && pnpm build && pnpm agent:build` olmalı.

## Sonraki öncelikler

- `infrastructure-manager.tsx`, `server-settings-center.tsx` ve `server-security-center.tsx` gibi çok büyük bileşenleri özellik bazlı daha küçük bileşen/hook/service katmanlarına bölmek.
- API route'larında ortak auth, permission ve JSON hata cevaplarını tek yardımcı katmanda toplamak.
- Auth, path traversal, `panel-settings` ve agent komut kuyruğu için otomatik test eklemek.
- Giriş, sunucu oluşturma, görünüm kaydetme, dosya yönetimi ve destek akışları için uçtan uca testler eklemek.
- CSP raporlarını izledikten sonra Report-Only modundan zorunlu CSP'ye geçmek.
- CI üzerinde `pnpm check`, `pnpm build` ve `pnpm agent:build` adımlarını zorunlu hale getirmek.
- `app/servers/[id]` ve `lib/db` altında kalan eski snapshot'ları kimlikleri doğrulandıktan sonra `_archive` içine taşımak.

## Mimari not

Drive klasörü teslim/yedek alanı olarak kullanılabilir; ancak sürüm geçmişi, kod inceleme ve güvenli geri alma için projenin ana kaynağının Git üzerinde tutulması daha sağlıklıdır.

## Dünya & İçerik Yönetimi — 16 Eylül 2026 ikinci geçiş

17. Ana sayfadaki `Yönetim` çekmecesinin ilk kartı `Dünya & İçerik` olarak düzenlendi; kart doğrudan seçili/ilk sunucunun Dünya & İçerik çalışma alanını açıyor.
18. Dünya çalışma alanında dünya oluşturma, aktif dünya yapma, sıfırlama, silme ve içerik yönetimi tek ekranda birleştirildi.
19. `GET /api/worlds` artık dünya ile ilişkili agent komutlarını okuyup bakım durumunu döndürüyor. Kuyruktaki/işlenen işlemler `Bakımda`, tamamlanan işlemler ise 2 dakika `Güncelleniyor / doğrulanıyor` durumunda tutuluyor.
20. Bakımda olan dünyalarda aktif yapma, sıfırlama, silme ve çakışabilecek yedek işlemleri arayüzden geçici olarak kilitleniyor.
21. Yeni oluşturulan dünya, henüz disk taramasında görünmese bile agent kuyruğundaki komuttan sanal dünya satırı olarak listelenebiliyor; böylece kullanıcı oluşturma işleminin ilerlediğini görüyor.
22. `ServerContentManager` seçili dünya kapsamını destekleyecek şekilde genişletildi. Sunucu genelindeki mod, plugin, plugin config, config ve resource packlere ek olarak seçili dünyanın gerçek disk dosyaları listeleniyor.
23. Agent, seçili dünyanın ana klasörü ile Nether/End yan klasörlerini güvenli şekilde tarıyor; symlink ve path traversal kontrolleri korunuyor ve tarama 600 dosya ile sınırlandırılıyor.
24. Dünya içindeki güvenli metin dosyaları (`yml`, `json`, `properties`, `toml`, `ini`, `cfg`, `conf`, `txt`, `md`, `xml`, `mcmeta`, `mcfunction`) panelden görüntülenip düzenlenebiliyor. Kaydetmeden önce mevcut dosya `.bak-*` olarak korunuyor.
25. Seçili dünya içinde yeni güvenli metin dosyası oluşturma eklendi.
26. `level.dat`, `session.lock` ve `.blockctrl-world-profile.json` gibi kritik dünya dosyaları doğrudan içerik yöneticisinden silinemez; tüm dünya silme işlemi ayrı güvenli dünya akışında kalır.
27. Sunucu detayındaki Dünyalar ekranı da yeni bakım durumunu ve Dünya & İçerik yöneticisini kullanacak şekilde güncellendi; dosya düzenleme yetkisi `canFiles`, dünya yaşam döngüsü işlemleri ise `canReset` iznine bağlı tutuldu.

Bu geçişte değiştirilen dosyalarda TypeScript sözdizimi taraması yapıldı ve yeni parse/syntax hatası görülmedi. Çalışma kopyasında bağımlılıklar kurulmadığı için tam bağımlılık çözümlemeli build doğrulaması yine CI/geliştirme ortamında yapılmalıdır.

## Bilgilendirme içerik editörü — 16 Eylül 2026 üçüncü geçiş

28. Sabit Bilgilendirme kartları blok tabanlı, veritabanında saklanan düzenlenebilir bir sayfaya dönüştürüldü.
29. Yetkili hesaplar Bilgilendirme ekranında Bölüm, Başlık, Paragraf, Kopyalanabilir metin, Görsel, Video, PDF ve Ayraç blokları ekleyebilir.
30. Metin tabanlı bloklarda metin rengi, arka plan rengi, hizalama ve yazı boyutu ayarlanabilir.
31. Bloklar sürükle-bırak ile veya yukarı/aşağı düğmeleriyle yeniden sıralanabilir; tek tek düzenlenebilir ve silinebilir.
32. Görsel, video ve PDF blokları hem HTTPS URL ile hem de yetkili doğrudan yüklemesiyle kullanılabilir. Yeni `/api/information-upload` endpoint'i özel Vercel Blob yüklemesi yapar; dosya başına üst sınır 200 MB'dir.
33. Özel Blob dosyaları doğrudan açık URL olarak sunulmaz; `/api/support?informationAsset=...` üzerinden, yalnız yayımlanmış Bilgilendirme bloklarında referans verilen dosyalar okunabilir.
34. PDF blokları panel içinde önizlenebilir ve ayrı sekmede açılabilir; kopyalanabilir metin bloklarında tek tıkla panoya kopyalama eklendi.
35. Bilgilendirme içeriğini yalnız `manager`, `admin` ve `guide` rolleri değiştirebilir; normal üyeler yayımlanmış içeriği salt okunur görür.
36. Bilgilendirme kaydetme işlemi sunucu tarafında blok türü, URL, Blob pathname, renk, hizalama, boyut ve metin uzunluklarını doğrular; en fazla 120 blok kabul edilir.
37. Bilgilendirme değişiklikleri audit log'a `information.update` olayı olarak yazılmaya çalışılır.
38. `information_pages` tablosu için `0003_information_pages.sql` migrasyonu ve Drizzle şema tanımı eklendi; ilk kurulumda mevcut Bilgilendirme metinleri başlangıç içeriği olarak korunur.
39. Yönetim Merkezi'ndeki Bilgilendirme kartı yeni editör özelliklerini açıklayacak ve doğrudan editörü açacak şekilde güncellendi.

Bu geçişte TS/TSX dosyaları TypeScript parse taramasından geçirildi; yeni sözdizimi/parse hatası görülmedi. Çalışma kopyasında `node_modules` bulunmadığı için React/Next/Vercel Blob tiplerinin çözümlenmesine dayalı tam typecheck/build burada çalıştırılamadı. Kalıcı Bilgilendirme kaydı için deployment veritabanında `pnpm db:migrate` çalıştırılmalıdır.

## Sunucu Yönetimi RBAC + Destek/Duyuru Düzeltme Geçişi — 16 Eylül 2026

39. Sunucu erişim modeli tek kurala çekildi: Yönetici global erişim; Admin/Rehber yalnız açık `server_permissions`; Üye kendi oluşturduğu sunucuda varsayılan salt-okunur `overview/logs/players`, paylaşılan sunucuda yalnız açık izin kapsamı.
40. `panel` API'de sunucu sahibi Üye için otomatik `fullAccess` kaldırıldı; dünya/mod/log/operasyon/kayıp eşya verileri izin verilen bölüm ve sahiplik kapsamına göre ayrı ayrı filtreleniyor.
41. `panel-settings`, `worlds`, `server-content`, `files`, `backups`, `server-actions` ve `security` API'lerinde Admin veya sunucu sahibi olmayı tek başına tam yetki sayan bypass yolları kaldırıldı.
42. Dosya görüntüleme ile dosya değiştirme ayrıldı: `files/software` sayfa izni salt-okunur görünüm sağlayabilir; yazma/silme/yükleme için `canFiles` gerekir.
43. Gelişmiş `server-actions` GET sonucu izin verilen sayfa türlerine göre filtreleniyor; dosya indeksi ve toplu indirme kayıtları dosya erişimi olmayan kullanıcılara dönmüyor.
44. Üye kendi node'unu oluşturduktan sonra Node sekmesinde düzenleme, kurulum bilgisini görüntüleme, token yenileme ve silme işlemlerini yapabiliyor; başka kullanıcı node'larına erişemiyor.
45. Kullanıcı onay/rol yönetimine `member` rolü eklendi ve veritabanındaki mevcut varsayılan rolle eşitlendi.
46. Yönetim kartındaki üst/alt `Düzenle` davranışı aynı `manager || canReset` kuralına bağlandı; yetkisiz kullanıcıda düzenleme butonu gösterilmiyor.
47. Oyuncu listesinde yapay ping, yapay güven puanı ve sabit “Düşük risk” kaldırıldı; doğrulanmış telemetri yoksa açıkça `— / Telemetri yok` gösteriliyor.
48. Genel Bakış güvenlik özetindeki sabit Aktif/Güvenli etiketleri kaldırıldı; firewall, dosya taraması, anti-cheat ve güvenlik skoru `/api/security` agent taramasından geliyor. DDoS için ayrı edge/ağ entegrasyonu gerektiği belirtiliyor.
49. Sabit `17 ms` son sinyal ve loglardan türetilen uptime kaldırıldı. Son sinyal heartbeat yaşı olarak gösteriliyor; process uptime telemetrisi yoksa `—` gösteriliyor. `maxPlayers`, online-mode ve whitelist değerleri gerçek panel-settings cevabından okunuyor.
50. Konsol/Günlük seviye ve arama filtreleri gerçek filtrelemeye bağlandı; Agent/Sistem sahte konsol sekmeleri kaldırıldı. Erişim ekranındaki Kullanıcı seçimi çalışır hale getirildi; veritabanı motor/charset sahte seçimleri salt okunur gerçek yapı bilgisi olarak gösteriliyor.
51. Üye de Yönetim butonunu görebiliyor; bu rolde yalnız `Sunucu İstatistikleri` kartı bulunuyor ve sahip/atanmış sunucunun salt-okunur Genel Bakış ekranına yönlendiriyor. Yetkili roller kendi yönetim kartlarını görmeye devam ediyor.
52. Destek Merkezi artık yönetilebilir başlık/açıklama, özel destek türleri, tür rengi/ikonu/aktifliği ve sıralanabilir görsel-video giriş slider'ını destekliyor. Geçiş tipi `fade/slide/zoom/none`, geçiş süresi ayarlanabiliyor.
53. Destek talebi türleri API'de sabit `support/bug` listesinden çıkarıldı; yalnız `support_settings` içindeki aktif türler kullanıcıya sunuluyor ve backend aynı listeyi doğruluyor.
54. Sağ üst alana okunmamış sayacına sahip Duyurular zili eklendi. Yönetim > Duyurular ile taslak, zamanlanmış, yayında ve arşiv durumlarında duyuru oluşturma/düzenleme/silme sağlandı.
55. Duyurular bölüm, başlık, paragraf/TXT, kopyalanabilir metin, görsel, video, PDF ve ayraç bloklarını; renk, arka plan, hizalama, boyut, sıralama ve medya yüklemeyi Bilgilendirme editörüyle aynı güvenli blok modeli üzerinden destekliyor.
56. Duyurularda yayın zamanı ve yayından kalkma zamanı destekleniyor. Kullanıcılarda yalnız aktif zaman aralığındaki duyurular görünür ve `announcement_reads` ile okunmamış sayısı tutulur.
57. `0004_support_announcements.sql` migrasyonu eklendi: `support_settings`, `announcements`, `announcement_reads` tabloları ve yayın indeksi oluşturuluyor.
58. Bu geçişte değiştirilen TS/TSX dosyaları `tsc --noEmit --noResolve` ile parse kontrolünden geçirildi; TS1xxx sözdizimi hatası bulunmadı. Tam proje build'i bağımlılıkları kurulmuş gerçek proje/CI ortamında ayrıca çalıştırılmalıdır.

## Çapraz-loader Kayıp Eşya Takibi — 16 Eylül 2026

59. Kayıp eşya takibi Paper/NeoForge ile sınırlı olmaktan çıkarıldı; panel ve agent artık `vanilla`, `paper`, `fabric`, `forge` ve `neoforge` loader'larının tamamında `itemTrackingEnabled` akışını koruyor.
60. Agent tracker kurulumu loader ve Minecraft sürümüne göre artifact seçiyor. `BLOCKCTRL_TRACKER_DIR/<loader>/<mcVersion>/blockctrl-tracker.jar` öncelikli; loader'a özel environment yolları da destekleniyor. Geçersiz/missing JAR sessizce atlanmak yerine kurulum hatası veriyor.
61. NeoForge adapteri eski/yanlış pickup eventinden çıkarıldı. `ItemTossEvent`, başarılı `ItemEntityPickupEvent.Post`, `ItemExpireEvent`, `LivingDropsEvent` ve entity removal akışı kullanılıyor; ölümde tüm inventory yerine gerçek drop collection kaydediliyor.
62. NeoForge ve Forge manual Q-drop sahipliği item entity persistent data içinde saklanıyor. Chunk unload/save sonrasında sahiplik kaybolmuyor; başarılı pickup'ta kalan stack bittiyse takip işareti temizleniyor.
63. Paper/Bukkit adapteri gerçek death drops + PDC manual-drop sahipliği + despawn/item damage akışını kullanıyor. Manual Q-drop anında “kayıp” sayılmıyor; yalnız gerçekten yok olan item kaydediliyor.
64. Fabric için ayrı server-side tracker projesi eklendi. Fabric API zorunluluğu yok; Fabric Loader + Mixin ile drop, pickup, despawn/destroy ve entity NBT sahiplik kalıcılığı uygulanıyor.
65. Forge için ayrı 1.21.1 baseline tracker projesi eklendi. Forge event bus üzerinden toss, pickup, expire, death drops ve entity removal izleniyor.
66. Saf Vanilla için plugin/mod gerektirmeyen agent fallback'i eklendi. Yaklaşık iki saniyelik `deathCount`, `Inventory`, `Pos`, `Dimension` snapshot'ları kullanılıyor; `keepInventory=true` iken ölüm kaydı üretilmiyor. Bu kayıtlar `approximate=true` metadata'sı ile açıkça ayrılıyor.
67. Tüm loader adapterleri ortak `/item-loss` protokolüne normalize ediliyor; event id, item, miktar, sebep, dünya, koordinat ve loader/tracking metadata'sı backend'e aynı modelde gönderiliyor.
68. Tracker kaynakları için build dokümantasyonu ve Paper/Fabric/Forge/NeoForge artifactlerini agent dizilimine yerleştiren `tracker/build-all.sh` eklendi.
69. Java kaynaklarında classpath olmadan sözdizimi taraması, agent/panel/infrastructure TypeScript dosyalarında `tsc --noResolve` parse taraması yapıldı; yeni parse/syntax hatası görülmedi. Gerçek loader bağımlılıklarıyla Maven/Gradle build'i deployment/CI ortamında ayrıca çalıştırılmalıdır.

## Sunucu Yönetimi Entegrasyon/Ağ/Market/Destek/Günlük Geçişi — 19 Eylül 2026

70. Entegrasyon Merkezi mevcut gerçek Discord webhook, Discord bot, Web API ve canlı yayın akışları korunarak toplu bağlantı testi ve yapılandırma durum özetiyle genişletildi; sahte entegrasyon durumu eklenmedi.
71. Ağ & Portlar ekranına DNS A/AAAA, Minecraft SRV ve panel dışından TCP erişilebilirlik/bağlantı gecikmesi teşhisi eklendi. Sunucu port değişimi 1024–65535 aralığı ve durdurulmuş sunucu koşuluyla daha sıkı doğrulanıyor.
72. Oracle Cloud/OCI NSG kontrol düzlemi doğrudan bağlanmış gibi gösterilmiyor; panel açıkça `not-connected` durumu döndürüyor. Buna karşılık node firewall/port taraması ile dış TCP erişimi gerçek verilerle ayrı ayrı raporlanıyor.
73. Eklentiler / Modlar bölümüne Modrinth ve isteğe bağlı CurseForge katalog araması eklendi. Arama sunucunun Minecraft sürümü ve loader bilgisiyle filtreleniyor; Vanilla sunucularda market kurulumu açılmıyor.
74. Modrinth ve CurseForge için uyumlu sürüm planı ile zorunlu bağımlılık çözümü eklendi. Kurulum planı bağımlılıkları önce, ana paketi sonra agent kuyruğuna gönderiyor; en fazla 24 paket ve 5 bağımlılık derinliği sınırı uygulanıyor.
75. Agent `install-addon` indirmeleri geçici dosyaya alıyor; boyut ve mevcutsa SHA-1 doğrulaması yapıyor, 512 MB sınırı uyguluyor, mevcut hedefi `.bak-*` olarak koruyor ve doğrulamadan sonra hedef dosyaya taşıyor.
76. CurseForge katalog entegrasyonu için kök `.env.example` dosyasına `CURSEFORGE_API_KEY` eklendi. Anahtar yoksa sahte sonuç üretmek yerine açık yapılandırma hatası dönüyor.
77. Sunucu Destek ekranı genel Destek Merkezi'ne yalnız yönlendirme yapan yapıdan çıkarıldı; yeni destek talebi açılırken sunucu adı/ID, bağlantı adresi, loader, Minecraft sürümü, durum, node ve yakın hata sayısı bağlamı otomatik ekleniyor.
78. Günlükler ekranına gerçek `crash-reports/*.txt` kayıtlarını inceleme ve tam log arşivi oluşturma/indirme akışı eklendi. Agent log arşivini kısa ömürlü indirme tokenıyla sunuyor ve geçici arşivi token yaşam döngüsüyle temizliyor.
79. `server-actions` cevaplarında `logs-export` sonuçları da güvenli indirme URL'si alıyor; crash report ve log export işlemleri mevcut RBAC kapsamını koruyor.
80. Bu geçişte değiştirilen TS/TSX dosyaları TypeScript `--noResolve` sözdizimi taramasından geçirildi; yeni TS1xxx parse/syntax hatası görülmedi. Drive'a yazılan kritik dosyalar tekrar okunarak market, destek, ağ teşhisi, log export, agent hash doğrulaması ve ortam değişkeni marker'ları doğrulandı. Tam bağımlılık çözümlemeli `pnpm check/build`, gerçek node/VPS ve production uçtan uca testi ayrıca yapılmalıdır.

## Production Hardening / P0–P3 — 19 Eylül 2026

81. Protected website pages statik deploy içine özel sayfa HTML'i gömmüyor; yalnız doğrulama shell'i yayınlanıyor. Gerçek sayfa render'ı backend runtime-page akışında session + authenticated/role/assigned kontrolünden sonra yapılıyor ve private, no-store dönüyor.
82. Website auth CORS'u wildcard yerine site deployment/production origin allowlist'i kullanıyor; rate-limit verileri PostgreSQL üzerinde tutuluyor.
83. Panel auth güvenlik görünümü Better Auth kalıntısından çıkarıldı. Supabase MFA assurance/factor durumu ve Supabase session güvenlik işlemleri kullanılıyor; diğer oturumları kapatma signOut scope=others ile yapılıyor.
84. CSP Report-Only header'ı ve /api/csp-report endpoint'i eklendi. CSP raporları bounded olarak loglanıyor; mevcut uygulamayı kırmadan policy gözlemlenebiliyor.
85. Agent brute-force, bağlantı burst ve isteğe bağlı IP reputation koruması Güvenlik Merkezi capability durumuna bağlandı. UFW helper süreli IP deny/allow ve connection rate-limit uygular.
86. OCI Request Signing, NSG read diagnostics ve yalnız OCI_NSG_WRITE_ENABLED=true iken kontrollü Minecraft ingress ekleme akışı mevcut; yapılandırma yoksa UI açıkça not-connected gösterir.
87. Structured observability eklendi. /api/health sonuçları yapılandırılmış log olayı üretir; degraded/error sonuçlar dedupe edilmiş webhook ve isteğe bağlı Resend e-posta alarmına aktarılabilir.
88. Transactional e-posta için Resend HTTP provider eklendi. RESEND_API_KEY / EMAIL_FROM yoksa sistem gönderim yapılmış gibi davranmaz.
89. Sunucu detay ekranında 9px/10px metinler kaldırıldı, kritik grid taşmaları responsive hale getirildi ve görünmeyen browser sekmesinde SWR polling durduruluyor.
90. Native confirm/prompt sunucu ana ekranından kaldırıldı; ortak ActionConfirmDialog yazılı onay destekliyor. ServerFeatureActions da aynı modalı kullanıyor.
91. 19 sekmeli sunucu navigasyonu components/server-detail-navigation.tsx içine ayrıldı ve Sunucu / İçerik / Veri & otomasyon / Yönetim / Sistem gruplarına bölündü.
92. Drive kökündeki geçici _patch_stage klasörü doğrulanmış güncel kaynakların gerisinde kaldığı için temizlendi; _archive rollback geçmişi olarak bilinçli şekilde korundu.
93. Agent'ın ürettiği bans ve leaderboard-kills snapshot'ları public site-runtime route'una bağlandı. 5 dakikadan eski snapshot kullanılmıyor; leaderboard-money/health gerçek provider olmadığı için unavailable kalıyor.
94. server-actions ile agent capability uyuşmazlığı düzeltildi: gerçek uygulanmış DB backup/restore/export/import/optimize/repair aksiyonları açıldı. Backup verify/copy agent'a eklendi.
95. Backup işlemleri server-scoped hale getirildi. Restore/delete/verify/copy bir arşivin ilgili serverId dosya prefix'ine ait olduğunu doğruluyor; cross-server backup restore/delete engelleniyor.
96. Generic ServerFeatureActions kendi capability tahminini bıraktı; /api/server-actions tarafından dönen gerçek supportedActions listesine göre buton açıyor. Seçili databaseId gerektiren duplicate generic DB kartı kaldırıldı.
97. Regression contract testleri protected pages, path traversal, grouped navigation, native confirm/prompt yokluğu, website public snapshot provider'ları, backup server scope ve gerçek agent action gate'lerini kapsayacak şekilde genişletildi.
98. Git/Vercel production branch hazırlığı blockctrl/p0-hardening-20260919 üzerinde yapılıyor. Vercel'in son doğrulama denemeleri uygulama build hatası yerine hesap build-rate-limit nedeniyle çalıştırılamadı; bu nedenle tam pnpm check && pnpm build && pnpm agent:build sonucu henüz doğrulanmış sayılmamalıdır.


## Production Hardening / P2 devamı — 19 Eylül 2026

99. Security Center Erişim sekmesi `components/server-security-access-tab.tsx` içine ayrıldı. Supabase oturum sonlandırma akışı native `confirm()` yerine yazılı onay destekli ortak `ActionConfirmDialog` kullanıyor.
100. Security Center içindeki X-Ray strict profil, X-Ray kapatma, karantina restore/delete ve güvenlik politikası uygulama native `confirm()` çağrıları ortak modal akışına taşındı. 8–11px sabit metinler kaldırıldı.
101. Sunucu detay ekranında kalan 11px metinler ve mobil arama alanı minimum genişlik baskısı temizlenerek okunabilirlik/responsive davranış iyileştirildi.
102. Ortak `lib/api-auth.ts` katmanı eklendi. Panel aktörü çözümleme ve standart private/no-store JSON cevap yardımcıları merkezi hale getirilmeye başlandı; `server-actions` ve `security` route'ları ortak actor resolver kullanıyor.
103. Production/preview smoke testi ana sayfaya ek olarak `/api/health` sözleşmesini ve anonim istekte `/api/server-actions` ile `/api/security` için 401 auth sınırını doğruluyor.
104. CSP rollout kontrollü hale getirildi. Varsayılan `Content-Security-Policy-Report-Only` korunuyor; yalnız `BLOCKCTRL_CSP_ENFORCE=true` olduğunda aynı policy zorunlu CSP header'ına dönüşüyor.
105. Contract testleri Security Center'da native confirm geri dönüşünü, küçük sabit fontları, ortak API auth resolver'ını, CSP rollout anahtarını ve genişletilmiş E2E smoke kontrollerini kapsayacak şekilde genişletildi.
106. Vercel/GitHub production doğrulaması tamamlanmadan branch ana dala birleştirilmeyecek; önceki Vercel denemelerinde görülen build-rate-limit uygulama build başarısı olarak kabul edilmiyor.


107. Ortak actor resolver `getPanelActor()` server-actions, security, panel-settings, worlds, server-content, files ve backups route'larına yayıldı; route'ların mevcut RBAC/permission mantığı değiştirilmedi.
108. Ortak actor geçişinde üç sıkıştırılmış route gövdesinde eski auth çağrısının kaldığı ara durum tespit edilip aynı branch üzerinde düzeltildi; contract testi artık bu yedi route'ta eski actor auth kalıbının geri gelmesini engelliyor.
109. Security Center ayrıştırması sırasında bulunan JSX grid/fragment hatası production'a taşınmadan branch üzerinde tespit edilip düzeltildi; ana branch bu çalışmalar boyunca değiştirilmedi.

## Temel altyapı / Sistem Hazırlığı Merkezi — 19 Eylül 2026

133. `/api/health` genişletildi: veritabanı ve migration kontrollerine ek olarak Supabase Auth yapılandırması, agent/node heartbeat, Vercel website yayınlama, Vercel Blob, website runtime bridge, CSP modu, operasyon alarm kanalları ve secret kullanan entegrasyonların temel hazırlık durumu raporlanıyor.
134. Health cevabına `readiness` özeti eklendi. Production yayınını gerçekten engelleyen maddeler `blockers`, çalışmayı tamamen durdurmayan eksikler `warnings` olarak ayrılıyor; panel bu ayrımı sahte başarı etiketi üretmeden gösteriyor.
135. `components/system-readiness-center.tsx` eklendi. Ana paneldeki `Sistem Durumu` sekmesi artık DB, migration, auth, agent, Vercel, Blob, website runtime, güvenlik/CSP ve operasyon alarm durumlarını tek ekranda gösteriyor; yöneticiye güvenli kurulum sırası sunuyor ve secret değerlerini göstermiyor.
136. `InfrastructureManager` içindeki yıkıcı sunucu işlemi, node token yenileme ve node silme akışlarındaki native `window.prompt/window.confirm` kaldırıldı. Ortak `useActionConfirm` diyaloğu ve gerekli yerlerde yazılı isim doğrulaması kullanılıyor.
137. `scripts/check-contracts.mjs` readiness merkezi, health auth/alerting/CSP sözleşmesi ve Infrastructure Manager içinde native popup bulunmaması için regresyon kontrolleriyle genişletildi.
138. GitHub CI doğrulamasında contract tests, unit tests, ESLint, TypeScript typecheck, Next.js panel build ve agent build adımlarının tamamı başarıyla geçti.
