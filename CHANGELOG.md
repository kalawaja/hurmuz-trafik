# Sürüm Günlüğü — Hürmüz Boğazı Tanker Trafiği

Ayrıntılı notlar: [`docs/`](docs/) klasörü. Canlı site: https://hurmuz-trafik.vercel.app

## v4.1 — 27 Temmuz 2026
- OG kart görselinde başlık puntosu küçültüldü; sağ çerçeveden taşma giderildi.
- Gömülü SVG favicon yerine gerçek dosyalar: `favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png` (Safari/iOS uyumu).

## v4 — 27 Temmuz 2026
- X/OG kart görseli eklendi (`og.png`, 1200×630, site estetiğinde) ve `og:image` / `twitter:image` / `og:url` etiketleri bağlandı.
- Kaydet (WebM) düğmesi ve kayıt kodu kaldırıldı.
- yuppiepoff imzası alt çubuğa taşındı; eski bilgi notu kaldırıldı.
- Temsilî mod bandı haritanın üzerinden alınıp haritanın altına, kendi satırına yerleştirildi.
- Tüm dış bağlantılar yeni sekmede açılıyor.

## v3 — 27 Temmuz 2026
- Üç dil: TR / EN / DE — harita etiketleri ve sayı biçimleri dahil; seçim hatırlanır, ilk ziyarette tarayıcı diline göre açılır.
- Canlı Brent bloğu: anlık fiyat, 24 saatlik değişim, 7 günlük mini grafik, WTI referansı (kaynak: straits.live).
- "Bu bir yuppiepoff.com projesidir · X: @yuppiepoff" imzası ve `twitter:site/creator` meta etiketleri.
- Mobil/UX cilası: dokunmatikte büyük düğmeler, daralan başlık, favicon, tema rengi, meta açıklamaları.

## v2 — 27 Temmuz 2026
- Hibrit mimari: gerçek AIS izi varsa CANLI mod, yoksa resmî günlük sayıya ölçekli TEMSİLÎ mod (otomatik geçiş).
- IMF PortWatch günlük Hürmüz serisi (straits.live aracılığıyla) toplayıcıya bağlandı; `daily_stats` + `kv` tabloları ve `transits.method` sütunu eklendi.
- Boğazdaki AIS ölü bölgesine dayanıklı ikinci geçiş tespiti ("yaka çıkarımı").
- Panele resmî günlük geçiş, tanker kırılımı, kriz öncesi taban değeri ve 120 günlük grafik eklendi.

## v1 — 26 Temmuz 2026
- İlk uçtan uca sistem: aisstream.io websocket toplayıcısı (Oracle VM, systemd), Neon Postgres şeması, Vercel API uçları (`/api/stats`, `/api/replay`) ve deniz haritası estetiğinde, son 24 saati hızlandırılmış oynatan canlı-veri arayüzü.
