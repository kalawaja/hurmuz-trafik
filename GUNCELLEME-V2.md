# v2 Güncellemesi — Hibrit Mod (resmî istatistik + temsilî animasyon)

Bu paketteki dosyalar v1'in üzerine yazılır. Yenilikler:
- Toplayıcı artık IMF PortWatch'un günlük Hürmüz geçiş serisini de çekiyor
  (straits.live ücretsiz API'si üzerinden, 12 saatte bir) ve boğazdaki AIS ölü
  bölgesine dayanıklı ikinci bir geçiş tespiti kullanıyor ("yaka çıkarımı").
- Site, gerçek AIS izi varsa CANLI modda, yoksa resmî günlük sayıya ölçekli
  TEMSİLÎ modda çalışıyor ve modlar arasında kendiliğinden geçiyor.
- Panelde: resmî günlük geçiş, tanker kırılımı, kriz öncesi taban değeri,
  son 120 günün grafiği ve "normalin %X'i" göstergesi.

## Kurulum sırası

### 1) Veritabanı eki (Neon)
Neon Console → SQL Editor → `db/schema-v2.sql` dosyasının tamamını yapıştır → Run.
(`daily_stats` ve `kv` tabloları oluşur, `transits`e `method` sütunu eklenir.)

### 2) GitHub'a yükleme
Depo sayfası → **Add file → Upload files** → bu zip'ten çıkan `collector`,
`db`, `web` klasörlerini olduğu gibi sürükle (aynı yoldaki dosyaların üzerine
yazar) → Commit changes ("v2 hibrit").

### 3) Sunucuyu güncelle
```
ssh -i ~/.ssh/hurmuz.key ubuntu@MAKINE_IP
cd /opt/hurmuz-trafik && git pull
sudo systemctl restart hurmuz-collector
sleep 5 && journalctl -u hurmuz-collector -n 25 --no-pager
curl -s localhost:8080
```
Logda şu satırı görmelisin: `Günlük seri güncellendi: NNN gün (son gün 2026-..-..)`.
Sağlık çıktısında `gunlukSeriGun` > 0 ve `gunlukSonTarih` dolu olmalı.

### 4) Siteyi yayına al (Vercel)
1. vercel.com → **Add New → Project** → `hurmuz-trafik` deposunu Import et.
2. **Root Directory**'yi `web` yap (Edit ile). Framework: **Other**. → **Deploy**.
3. İlk dağıtım bitince: üst menü **Storage → hurmuz-db → Connect Project** →
   projeyi seç, ortamlar ve önek varsayılan kalsın → Connect.
4. Projeye dön → **Deployments** → en üstteki dağıtımın ⋯ menüsü → **Redeploy**
   (ortam değişkeni bağlandıktan sonra bir kez gerekir).

Doğrulama:
- `https://<proje>.vercel.app/api/stats` → içinde `"daily":[...]` olan JSON.
- Ana sayfa → "Temsilî Mod" rozeti, PortWatch günlük sayıları ve 120 günlük grafik.
- AIS istasyonları döndüğünde sayfa kendiliğinden "Canlı · AIS" moduna geçer.

Kaynak notu: günlük seri IMF PortWatch verisidir (straits.live aracılığıyla;
hesaplanan göstergeler CC0). Sayfadaki dipnotta atıf hazır durumda.
