# Hürmüz Boğazı — Canlı Tanker Trafiği

Son 24 saatin gerçek AIS izlerini deniz haritası estetiğiyle hızlandırılmış olarak oynatan,
sayım hattı (56°36′D) geçişlerini 7/24 sayan sistem.

```
aisstream.io ──websocket──▶ TOPLAYICI (Oracle VM / Render)
                                 │ örneklenmiş konumlar + geçişler
                                 ▼
                           Neon Postgres (ücretsiz)
                                 ▲
                    /api/replay  │  /api/stats
                                 │
                         VERCEL (frontend + API)
```

Depo düzeni: `collector/` toplayıcı · `web/` Vercel projesi (statik sayfa + api) · `db/schema.sql` şema.

---

## 1) Veritabanı — Neon (Vercel üzerinden, ücretsiz)

1. Vercel panelinde **Storage → Create Database → Neon (Postgres)** seçin, ücretsiz plan.
2. Oluşan veritabanının **pooled connection string**'ini kopyalayın (`DATABASE_URL`,
   `postgres://...` ile başlar). Bunu hem toplayıcı hem Vercel kullanacak.
3. Neon panelinde **SQL Editor**'ü açıp `db/schema.sql` dosyasının tamamını yapıştırıp çalıştırın.

## 2) AIS anahtarı — aisstream.io (ücretsiz)

1. https://aisstream.io adresinde hesap açın (GitHub ile giriş yapılabiliyor).
2. **API Keys** sayfasından bir anahtar üretin → `AISSTREAM_KEY`.
3. Anahtarı yalnız toplayıcıya verin; asla frontend koduna veya herkese açık depoya koymayın.

## 3) Toplayıcı — Plan A: Oracle Always Free ($0)

1. https://oracle.com/cloud/free hesabı açın (telefon + kredi kartı doğrulama ister; yükseltmedikçe ücret alınmaz).
2. **Compute → Instances → Create Instance**:
   - Shape: **VM.Standard.E2.1.Micro** (Always Free; küçük ama bu iş için fazlasıyla yeterli.
     Ampere A1 kapasite hatası verirse Micro genelde hemen bulunur.)
   - Image: **Ubuntu 24.04**. SSH anahtarınızı ekleyin.
3. SSH ile bağlanıp kurulum:

```bash
sudo apt update && sudo apt install -y nodejs npm git
git clone https://github.com/<kullanici>/hurmuz-trafik.git /opt/hurmuz-trafik
cd /opt/hurmuz-trafik/collector && npm install

sudo tee /etc/hurmuz.env > /dev/null << 'EOF'
AISSTREAM_KEY=BURAYA_ANAHTAR
DATABASE_URL=BURAYA_NEON_URL
EOF
sudo chmod 600 /etc/hurmuz.env

sudo cp hurmuz-collector.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hurmuz-collector
journalctl -u hurmuz-collector -f     # canlı log: "GEÇİŞ ..." satırlarını görmelisiniz
```

> Notlar: (a) Ubuntu deposundaki Node 18+ yeterlidir; isterseniz NodeSource ile Node 20 kurun.
> (b) Servis `ubuntu` kullanıcısıyla çalışır; farklı bir kullanıcı adınız varsa `.service`
> dosyasındaki `User=` satırını düzeltin. (c) **Boşta geri alma:** Oracle, Always Free
> hesaplarda 7 gün boyunca CPU kullanımı çok düşük kalan makineleri geri alabiliyor.
> Kurulum oturunca hesabı **Pay As You Go**'ya yükseltmek bu politikadan muaf tutar ve
> Always Free limitleri içinde kaldıkça yine ücret ödemezsiniz.

## 3′) Toplayıcı — Plan B: Render ücretsiz + ping

1. Depoyu Render'a **Blueprint** olarak bağlayın (kökteki `render.yaml` otomatik algılanır).
2. `AISSTREAM_KEY` ve `DATABASE_URL` ortam değişkenlerini girin.
3. Ücretsiz servisler 15 dk hareketsizlikte uyur: https://uptimerobot.com (ücretsiz) ile
   `https://<servis>.onrender.com/` adresine **5 dakikada bir** HTTP ping kurun.
4. Uyarı: yeniden başlatmalarda küçük veri boşlukları normaldir; kalıcı çözüm Plan A'dır.

## 4) Frontend + API — Vercel

1. Depoyu GitHub'a itin; Vercel'de **Add New → Project** ile içeri alın.
2. **Root Directory: `web`** seçin (Framework: Other).
3. Environment Variables: `DATABASE_URL` (Neon'u Vercel Storage'dan bağladıysanız otomatik gelir).
4. Deploy. Doğrulama: `https://<proje>.vercel.app/api/stats` JSON döndürmeli;
   ana sayfa toplayıcı veri yazmaya başladıktan birkaç dakika sonra canlanır.

## Nasıl çalışır / bakım

- Toplayıcı yalnız **tanker** (AIS tip 80-89) konumlarını, gemi başına ~2 dakikada bir örnekleyerek yazar;
  72 saatten eski konumları kendisi budar. `transits` tablosu kalıcıdır (istatistik tarihçesi burada birikir).
- Sınıflandırma gemi boyundan yapılır: ≥270 m VLCC · ≥230 Suezmax · ≥180 Aframax · altı ürün tankeri.
  Hacim tahmini sınıf başına ortalama yük varsayımıdır (2,0 / 1,0 / 0,7 / 0,35 mn varil).
- AIS tabanlı her sayım **alt sınırdır**: transponderi kapalı gemiler görünmez. Sayfadaki şerh bilinçlidir.
- Sağlık kontrolü: toplayıcı `:8080` (veya `PORT`) üzerinde durum JSON'u döndürür.

## Sonraki adımlar (aşama 3)

Dinamik OG kart görseli (`@vercel/og` ile karttaki önizlemeye güncel istatistik basmak),
X'e doğrudan yüklenecek MP4 dışa aktarma, alan adı.
