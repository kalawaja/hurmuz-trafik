# v3 Güncellemesi — TR/EN/DE · Canlı Brent · yuppiepoff imzası · mobil cila

Tek dosya değişiyor: `web/public/index.html`. Sunucu, veritabanı, API — hiçbirine dokunulmuyor.

## Yenilikler
- **Dil değiştirici (TR / EN / DE):** sağ üstte; seçim tarayıcıda hatırlanır, ilk ziyarette
  tarayıcı diline göre otomatik seçilir. Harita üzerindeki etiketler dahil her şey çevrildi.
- **Brent Petrol · Canlı:** anlık fiyat, 24 saatlik değişim (yeşil/kırmızı) ve 7 günlük mini
  grafik; WTI referansı. Kaynak: straits.live ücretsiz fiyat ucu, 10 dakikada bir tazelenir.
- **İmza:** panelin altında "Bu bir yuppiepoff.com projesidir · X: @yuppiepoff" (her dilde);
  ayrıca sayfanın X kartı meta etiketlerine `twitter:site/creator = @yuppiepoff` eklendi.
- **Mobil/UX:** dokunmatikte daha büyük düğmeler, daralan ekranda sıkılaşan başlık,
  tema rengi, favicon, sekme başlığı ve açıklama metinleri.

## Kurulum (2 dakika)
1. GitHub → depo → **Add file → Upload files** → zip'ten çıkan `web` klasörünü sürükle
   → Commit ("v3").
2. Bitti — Vercel push'u görüp otomatik dağıtır (~1 dk). Sunucuda yapılacak bir şey yok.

## Doğrulama
- Sayfayı aç (gerekirse sert yenile: Cmd+Shift+R).
- Sağ üstte TR | EN | DE — geçişte panel, harita etiketleri ve sayı biçimleri değişmeli.
- Brent kutusu: fiyat + %değişim + çizgi grafik.
- Panel altında yuppiepoff imzası; telefonda düzen tek sütuna akmalı.
