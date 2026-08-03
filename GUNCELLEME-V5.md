# v5 — Bekçi hatası düzeltmesi (sessiz bölge, sonsuza dek açık kalan bağlantı)

Değişen dosya: `collector/index.js`.

## Neydi hata?
Eski bekçi kodu şu kurala bakıyordu: "son mesajdan bu yana 120 sn geçtiyse
bağlantıyı tazele." Ama Hürmüz bölgesinden **hiç** mesaj gelmemişse (`lastMsgAt`
hiç dolmuyorsa) bu kural devreye girmiyordu — bağlantı teknik olarak açık ama
sessiz kalsa bile bekçi bunu fark edemiyordu. Sonuç: bölge yayına dönse bile
toplayıcının bunu yakalayabilmesi şansa kalıyordu.

## Ne değişti?
- Bekçi artık iki ayrı durumu izliyor: (1) önceden mesaj alıp sessizleşen bağlantı
  (eskisi gibi 120 sn'de tazelenir), (2) bağlandığından beri **hiç** mesaj almamış
  bağlantı — bu durumda da 6 saat sessizlik sonunda bağlantı sigortalı şekilde
  yeniden kurulur.
- Sağlık ucuna (`curl localhost:8080`) yeni alan: `bolgeSessizSaat` — bölgeden kaç
  saattir mesaj gelmediğini gösterir, artık elle test scripti çalıştırmaya gerek yok.

## Kurulum
```
ssh -i ~/.ssh/hurmuz.key ubuntu@130.162.225.135
cd /opt/hurmuz-trafik && git pull
sudo systemctl restart hurmuz-collector
sleep 5 && curl -s localhost:8080
```
Çıktıda `bolgeSessizSaat` alanını göreceksin — 0'a yakınsa yeni bağlantı henüz
kurulmuş demektir, saatler içinde artmaya başlarsa bölge hâlâ sessiz demektir
(sorun değil, otomatik tazelenecek). `yazilanKonum` bir anda arttığında bölge
yayına dönmüş demektir; site kendiliğinden Canlı moda geçer.

Ardından, bekleyen güvenlik güncellemeleri için:
```
sudo reboot
```
2 dakika sonra toplayıcı systemd ile kendiliğinden ayağa kalkar.

## GitHub'a yükleme (bu adımı ssh'dan önce/sonra istediğin sırada yap)
GitHub → depo → Add file → Upload files → zip'ten çıkan `collector` klasörünü
sürükle → Commit ("v5: bekçi hatası düzeltmesi") → sonra sunucuda `git pull`.
