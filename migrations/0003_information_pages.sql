CREATE TABLE IF NOT EXISTS information_pages (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT 'Bilgilendirme',
  description text NOT NULL DEFAULT '',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updatedBy" text,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
-- statement: seed-information
INSERT INTO information_pages (id,title,description,blocks)
VALUES (
  'support',
  'Bilgilendirme',
  'Destek sisteminin nasıl çalıştığını ve dosya gönderim kurallarını burada görebilirsiniz.',
  '[
    {"id":"support-request","type":"section","content":"Destek talebi","caption":"Bir sorun yaşadığınızda konu ve açıklama ile talep oluşturursunuz. Talep önce Onay bekliyor durumuna geçer. Rehber, Admin veya Yönetici talebi kabul ettiğinde sohbet açılır."},
    {"id":"bug-report","type":"section","content":"Hata bildirimi","caption":"Panel veya sunucuyla ilgili hata bildirimi oluşturabilir; ekran görüntüsü, fotoğraf ve video ekleyebilirsiniz. Hata bildirimi destek ekibi tarafından incelenir."},
    {"id":"files","type":"section","content":"Metin, görsel, video ve PDF","caption":"Bilgilendirme sayfasında başlık, paragraf, görsel, video, PDF ve kopyalanabilir metin blokları kullanılabilir. Destek mesajlarında dosya başına en fazla 100 MB sınırı uygulanır."},
    {"id":"private-chat","type":"section","content":"Özel sohbet","caption":"Yönetici, Admin veya Rehber bir üyeyi birebir özel görüşmeye davet edebilir. Üye daveti kabul etmeden sohbet açılmaz."},
    {"id":"close-chat","type":"section","content":"Sohbeti kapatma","caption":"Destek talebini talebi açan üye veya ilgili destek yetkilisi kapatabilir. Kapatılan sohbet geçmişi kayıt olarak saklanır."}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;