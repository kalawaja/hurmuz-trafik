# v4.1 — OG başlık taşması düzeltildi + gerçek favicon dosyaları

Değişen/eklenen dosyalar (hepsi `web/public/` içinde):
- `og.png` — başlık puntosu küçültüldü, sağ kenardan güvenli boşlukla içeride; dikey denge yeniden ayarlandı.
- `index.html` — favicon bağlantıları gömülü SVG yerine gerçek dosyalara çevrildi.
- `favicon-32.png`, `favicon-192.png` (yeni) — tarayıcı sekmesi/Android.
- `apple-touch-icon.png` (yeni) — Safari/iOS ana ekran simgesi.

## Kurulum
GitHub → Add file → Upload files → zip'ten çıkan `web` klasörünü sürükle → Commit.
Vercel otomatik dağıtır.

## Doğrulama
- `hurmuz-trafik.vercel.app/og.png` → başlık kenardan taşmıyor.
- Sekme simgesi: sert yenile; görünmezse sekmeyi kapatıp yeni sekmede aç
  (tarayıcılar faviconu inatla önbellekler).
- X kartı: og.png değiştiği için X'in önbelleği eski görseli bir süre gösterebilir;
  test için linke `?v=3` ekleyebilirsin.
