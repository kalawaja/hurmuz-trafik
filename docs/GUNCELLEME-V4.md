# v4 — OG kart görseli + arayüz düzeltmeleri

Değişen/eklenen dosyalar: `web/public/index.html` (güncellendi) ve `web/public/og.png` (yeni).

## Yenilikler
- **X/OG kart görseli:** Link artık kartta site estetiğinde 1200×630 bir görselle çıkar
  (harita + başlık + adres + yuppiepoff imzası). `og:image`, `twitter:image`, `og:url`
  etiketleri eklendi.
- **Kaydet düğmesi kaldırıldı.**
- **İmza taşındı:** "Bu bir yuppiepoff.com projesidir · X: @yuppiepoff" artık alt çubukta,
  eski bilgi notunun yerinde; not metni kaldırıldı.
- **Temsilî mod bandı** haritanın üzerinden alındı; artık haritanın hemen altında kendi
  satırında duruyor, animasyonu hiçbir ekran boyutunda örtmüyor.
- **Tüm dış bağlantılar yeni sekmede** açılıyor.

## Kurulum
GitHub → Add file → Upload files → zip'ten çıkan `web` klasörünü sürükle → Commit.
Vercel otomatik dağıtır (~1 dk). Sunucu/veritabanı işlemi yok.

## Doğrulama
- Sayfayı sert yenile (Cmd+Shift+R): Kaydet yok, imza alt çubukta, temsilî bandı
  haritanın altında, dipnottaki linkler yeni sekmede.
- `https://hurmuz-trafik.vercel.app/og.png` tarayıcıda doğrudan açılmalı.
- X kart önizlemesi: X, linkleri önbelleğe alır; görsel ilk denemede çıkmazsa birkaç
  saat bekle ya da paylaşım testinde linke `?v=2` ekle.
