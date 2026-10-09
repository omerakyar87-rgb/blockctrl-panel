# BlockCtrl

BlockCtrl, Minecraft sunucularını web paneli ve sunucu üzerinde çalışan Node.js agent üzerinden yönetmek için geliştirilmiş bir kontrol paneli ve website builder'dır. Proje v0 ile aynı GitHub reposuna bağlıdır; web uygulaması Vercel üzerinde, Minecraft agent ise sunucunun/VPS'in üzerinde çalışır.

## Mimari

- **Panel:** Next.js 16, React 19, TypeScript
- **Arayüz:** Tailwind CSS, shadcn/Base UI, Framer Motion
- **Panel kimlik doğrulama:** Supabase Auth
- **Uygulama veritabanı:** PostgreSQL / Neon + Drizzle ORM
- **Website Builder:** BlockCtrl dahili yayın modu; Vercel API bağlanırsa ayrı Vercel proje yayını da desteklenir
- **Medya:** Vercel Blob; Blob yoksa küçük/orta dosyalar için PostgreSQL fallback
- **Agent:** Node.js/TypeScript; Oracle VPS veya Minecraft sunucusunun bulunduğu Linux makinede
- **CI/CD:** GitHub Actions + Vercel production gate

> Supabase yalnız panel hesabı, oturum, e-posta doğrulama, şifre sıfırlama ve MFA gibi kimlik doğrulama işleri için kullanılır. Minecraft sunucuları, node'lar, website'ler, izinler, loglar ve uygulama verileri Neon/PostgreSQL'de tutulur.

## v0

Bu repo mevcut v0 projesine bağlıdır:

https://v0.app/chat/projects/prj_jWYTKgks8S3Yw8RFmATcSNmsefWO

v0 ile yapılan kod değişiklikleri GitHub üzerinden aynı projeye aktarılabilir. Production kaynağı GitHub'dır; Drive klasörü yedek/teslim alanı olarak kullanılmalıdır.

## Temel özellikler

- Minecraft node ve sunucu yaşam döngüsü
- Canlı heartbeat, metrikler, konsol ve loglar
- Dosya, dünya, mod/plugin, yedek ve SFTP yönetimi
- Rol/yetki tabanlı erişim
- Oyuncu yönetimi, ban/moderasyon ve leaderboard verileri
- Güvenlik merkezi ve agent güvenlik kontrolleri
- Destek, duyuru ve bilgilendirme sistemi
- Website Builder
- Website ana Minecraft sunucu bağlantısı
- BlueMap/Dynmap
- Website mağaza, wiki, destek ve form modülleri
- Website login/register ve üye sistemi
- Website public data adaptörü
- Dahili website yayınlama ve opsiyonel Vercel yayınlama
- Sağlık/readiness kontrolü: `GET /api/health`

## Yerel kurulum

Gereksinimler:

- Node.js 20.9+
- pnpm 10
- PostgreSQL/Neon bağlantısı
- Supabase Auth projesi

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Kalite kontrolleri:

```bash
pnpm check
pnpm build
pnpm agent:build
```

## Gerekli production ortam değişkenleri

Minimum yayın için:

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=
```

Opsiyonel ilk yönetici bootstrap listesi:

```env
BLOCKCTRL_BOOTSTRAP_MANAGER_EMAILS=admin@example.com
```

Bu değişken boş bırakılırsa paneldeki mevcut ilk-kullanıcı bootstrap akışı ilk hesabı yönetici yapabilir. Kod içinde sabit bir yönetici e-posta adresi tutulmaz.

Website Builder'ın ayrı Vercel projeleri oluşturmasını istiyorsanız ayrıca:

```env
VERCEL_TOKEN=
VERCEL_TEAM_ID=
```

Bu değerler yoksa Website Builder BlockCtrl'ın dahili yayın modunu kullanabilir.

Medya için `BLOB_READ_WRITE_TOKEN` opsiyoneldir; migration seviyesi hazırsa PostgreSQL media fallback kullanılabilir.

Secret kullanan entegrasyonlarda:

```env
INTEGRATION_ENCRYPTION_KEY=
```

güçlü, server-side bir anahtar tanımlanmalıdır.

Tüm desteklenen değişkenler için `.env.example` dosyasına bakın.

## Database migration

Migration dosyaları `migrations/` altında tutulur. `scripts/migrate.ts`:

- PostgreSQL advisory lock kullanır,
- `schema_migrations` ledger'ını oluşturur,
- legacy şemaları fingerprint ile reconcile eder,
- yalnız eksik migration'ları transaction içinde uygular,
- migration tamamlandıktan sonra beklenen şema fingerprint'ini doğrular.

Migration için mümkünse doğrudan/non-pooled Neon bağlantısı kullanın.

Production'a yanlış veritabanında migration uygulamayın. Önce Vercel `DATABASE_URL` hedefinin doğru Neon project/branch/database olduğundan emin olun.

## Supabase Auth

Panel auth akışı:

- `/sign-up`
- `/sign-in`
- `/forgot-password`
- `/reset-password`
- `/auth/callback`
- `/auth/confirmed`

Supabase panel kimliğini sağlar; uygulama kullanıcı profili ve yetkiler Neon/PostgreSQL'deki `user` ve ilgili BlockCtrl tablolarıyla eşleştirilir.

Supabase dashboard'da production ve preview callback URL'lerini izin verilen redirect URL'lerine ekleyin.

## Agent

Agent ayrı pakettir:

```bash
pnpm agent:build
pnpm agent:start
```

Agent üretimde Minecraft sunucusunun bulunduğu Linux/VPS üzerinde çalışır. Panel deploy'u agent binary/service restart'ını otomatik yapmaz.

## Production gate

`.github/workflows/production-gate.yml` production için şu sırayı uygular:

1. deployment credential kontrolü
2. database migration doğrulama/uygulama
3. lint + typecheck + test
4. panel build
5. agent build
6. Vercel production build
7. prebuilt production deploy
8. readiness zorunlu E2E smoke test

Production smoke testi `database=ok`, `migration=ok`, `auth=ok` ve `readiness != blocked` olmadan başarılı sayılmaz.

## Güvenlik

- Secret/token değerlerini repoya eklemeyin.
- Production'da HTTPS kullanın.
- Runtime request içinde DDL çalıştırmayın.
- Node tokenlarını istemciye göndermeyin.
- Path traversal ve symlink kontrollerini kaldırmayın.
- CSP önce Report-Only izlenmeli, temizlendikten sonra `BLOCKCTRL_CSP_ENFORCE=true` ile zorunlu hale getirilmelidir.

## Yayına hazırlık kontrolü

Production deploy öncesinde `/api/health` cevabında en az şunlar doğrulanmalıdır:

- database: `ok`
- migration: `ok`
- auth: `ok`
- readiness: `ready` veya kabul edilmiş uyarılarla `ready-with-warnings`

Agent offline, opsiyonel OAuth/bot/gateway entegrasyonları veya CSP Report-Only durumu warning olabilir; database, migration veya auth problemi production blocker'dır.
