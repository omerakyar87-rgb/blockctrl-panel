# BlockCtrl Node Agent

Bu servis gerçek Minecraft Java süreçlerini kendi Linux hosting sunucunuzda çalıştırır. Node.js 20+, `tar`, `unzip` ve hedef Minecraft sürümünün gerektirdiği Java sürümü kurulu olmalıdır. 1.21.x için Java 21 kullanın.

## Kurulum

Node agent, web panelden ayrı bir Node.js projesidir. Komutları mutlaka `agent` klasörünün içinde çalıştırın.

```bash
cd /opt/blockctrl/agent
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Panelde **Node bağla** ile `NODE_ID` ve yalnız bir kez gösterilen `NODE_TOKEN` değerlerini alın. Agent'ı root olmayan, yalnız BlockCtrl veri dizinine erişebilen ayrı bir Linux kullanıcısı altında çalıştırın.

## Ortam değişkenleri

```ini
PANEL_URL=https://panel-adresiniz.com
NODE_ID=...
NODE_TOKEN=...
DATA_DIR=/srv/blockctrl

# Önerilen: sürüm bazlı kayıp eşya tracker deposu
BLOCKCTRL_TRACKER_DIR=/srv/blockctrl/trackers

# İsterseniz loader başına sabit JAR da verebilirsiniz
PAPER_TRACKER_JAR=/opt/blockctrl/trackers/paper/blockctrl-tracker.jar
FABRIC_TRACKER_JAR=/opt/blockctrl/trackers/fabric/blockctrl-tracker.jar
FORGE_TRACKER_JAR=/opt/blockctrl/trackers/forge/blockctrl-tracker.jar
NEOFORGE_TRACKER_JAR=/opt/blockctrl/trackers/neoforge/blockctrl-tracker.jar
```

`BLOCKCTRL_TRACKER_DIR` kullanıldığında agent önce şu güvenli sürüm-bazlı yolu arar:

```text
/srv/blockctrl/trackers/<loader>/<minecraft-version>/blockctrl-tracker.jar
```

Bulunmayan veya protokol doğrulaması geçmeyen adapter sessizce yüklenmez. Agent güvenli biçimde `death-snapshot` fallback moduna geçer ve panelde bunun yaklaşık takip olduğu açıkça gösterilir; geçersiz bir JAR event-adapter gibi raporlanmaz.


## Website `/register` köprüsü

Paper, Fabric, Forge ve NeoForge adapterleri artık yalnız kayıp eşya takibi için değil, website üyeliği için de kullanılır. Sunucuda item tracking kapalı olsa bile adapter mevcutsa `/register <şifre> [email]` komutu çalışır. Agent process başlatırken `BLOCKCTRL_ITEM_TRACKING_ENABLED=false` gönderir; website kayıt köprüsü aktif kalır. Item tracking kapalıyken agent `/item-loss` kayıtlarını 204 ile yok sayar, böylece kayıp eşya veritabanına yazılmaz.

Vanilla sunucuda mod/plugin katmanı olmadığı için oyun içi `/register` komutu otomatik sağlanamaz; website tarafındaki normal kayıt yöntemi kullanılmalıdır.

## Kayıp eşya takip adapterleri

Tüm adapterler yalnız localhost'taki ortak BlockCtrl protokolüne (`POST /item-loss`) olay yollar. Panel tarafında tek `lost_items` modeli kullanılır.

- **Paper / Bukkit uyumlu türevler:** gerçek `PlayerDeathEvent`, Q-drop, başarılı pickup, despawn ve item hasarı olayları kullanılır. Manual Q-drop ancak gerçekten yok olduğunda kayıp sayılır.
- **NeoForge:** `ItemTossEvent`, başarılı `ItemEntityPickupEvent.Post`, `ItemExpireEvent` ve `LivingDropsEvent` kullanılır. Q-drop sahipliği item entity'nin kalıcı verisine yazılır ve chunk unload/save sonrasında korunur.
- **Forge:** NeoForge ile aynı yaşam döngüsü modeli Forge event bus üzerinden uygulanır; Q-drop sahipliği kalıcı entity verisinde tutulur.
- **Fabric:** player/item mixin'leri gerçek drop, pickup, despawn ve item destruction olaylarını izler. Manual drop sahibi entity NBT'sine de yazılarak chunk save/load sonrasında geri yüklenir.
- **Vanilla:** saf Vanilla'da mod/plugin event API'si bulunmadığı için agent yaklaşık 2 saniyede bir oyuncu envanteri/konumu/dimension/death scoreboard snapshot'ı alır. `keepInventory=true` ise ölüm kaydı üretmez. Vanilla modu ölümde kaybolan envanteri takip eder; Q-drop/pickup/despawn yaşam döngüsünü tam olarak izlediğini iddia etmez. Bu kayıtların metadata alanında `trackingMode=death-snapshot` ve `approximate=true` bulunur.

Paper/Fabric/Forge/NeoForge kayıtları `trackingMode=event-adapter` olarak işaretlenir. Böylece panel hangi kaydın kesin event adapter'ından, hangisinin Vanilla snapshot fallback'inden geldiğini ayırt edebilir.

## systemd

```ini
[Unit]
Description=BlockCtrl Minecraft Node Agent
After=network-online.target

[Service]
Type=simple
User=blockctrl
WorkingDirectory=/opt/blockctrl/agent
EnvironmentFile=/etc/blockctrl-agent.env
ExecStart=/usr/bin/node /opt/blockctrl/agent/dist/index.js
Restart=always
RestartSec=5
NoNewPrivileges=false
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/blockctrl

[Install]
WantedBy=multi-user.target
```

Agent panel ile HTTPS üzerinden konuşur. Kayıp eşya adapterleri yalnız `127.0.0.1:8788` üzerindeki agent ingest servisine erişir. Download bridge varsayılan olarak 8789 kullanır. Canlı sunucu dosyaları `DATA_DIR/servers/<server-id>`, yedekler `DATA_DIR/backups` altında tutulur.

## Kayıp eşyayı oyuncuya geri verme

Panelde **Kayıp Eşya Takibi > Oyuncuya Ver** işlemi doğrudan veritabanını değiştirmez. Panel önce yetki, sunucu durumu, oyuncu adı ve item kimliğini doğrular; ardından node agent'a `lost-item-restore` görevi yollar. Agent çalışan Minecraft process'ini ve FIFO konsol kanalını yeniden doğruladıktan sonra güvenli `give <oyuncu> <item-id> <adet>` komutunu gönderir.

Agent komuttan önce stdout/stderr offsetlerini alır ve yalnız bu komuttan sonra oluşan yeni çıktıyı inceler. Minecraft başarı satırı görülürse kayıt `restored`, açık hata satırı görülürse `restore_failed`, komut gönderildiği halde çıktı doğrulanamazsa çift verme riskini önlemek için `restore_sent` olur. `restore_sent` kayıtları panelden otomatik tekrar gönderilmez.

Bu özelliğin çalışması için agent güncellemesinden sonra `pnpm build` ve servis yeniden başlatması gerekir. Panel veritabanında geri verme yaşam döngüsü sütunları için `0005_lost_item_restore.sql` migrasyonu uygulanmalıdır.


## SFTP temel altyapısı

BlockCtrl SFTP sistemi her Minecraft sunucusu için ayrı `mc_<server-id-prefix>` Linux kullanıcısı üretir. Kullanıcıya normal shell verilmez; OpenSSH `internal-sftp` zorlanır ve oturum `/srv/blockctrl-sftp/<kullanıcı>` chroot alanına kilitlenir. Gerçek Minecraft sunucu dizini chroot içindeki `/files` yoluna bind mount edilir. ACL sayesinde hem `blockctrl` agent kullanıcısı hem SFTP hesabı dosyaları yönetebilir; chroot üst dizinleri root sahipliğinde ve yazılamaz durumda kalır.

Kurulum / güncelleme:

```bash
cd /opt/blockctrl
sudo bash deploy/install-sftp-helper.sh
sudo systemctl restart blockctrl-agent
```

Helper, eksikse `openssh-server`, `acl` ve `util-linux` paketlerini kurar; SSH servisini etkinleştirir, `sshd_config.d/90-blockctrl-sftp.conf` dosyasını doğrular ve yalnız `/usr/local/sbin/blockctrl-sftp-helper` komutu için sınırlı sudo yetkisi tanımlar. Bu nedenle agent servisindeki `NoNewPrivileges=false` yalnız bu dar kapsamlı privileged helper geçişinin çalışabilmesi içindir; agent yine `ProtectSystem=strict` ve `ReadWritePaths=/srv/blockctrl` ile sınırlandırılır.

Paneldeki SFTP sayfası hesap oluşturma, tek kullanımlık parola gösterimi, parola yenileme, altyapı doğrulama, etkinleştirme/devre dışı bırakma, aktif oturumları görüntüleme ve sonlandırma ile hesabı tamamen kaldırma işlemlerini destekler. Parola düz metin olarak veritabanına yazılmaz. Hesap silindiğinde Linux SFTP kullanıcısı, chroot bind mount/fstab kaydı ve kullanıcı ACL girdileri temizlenir; Minecraft sunucu dizininin kendisi silinmez.

`Altyapıyı doğrula` işlemi kullanıcı hesabını, `/files` home ayarını, nologin shell'i, bind mount'u, root-owned chroot izinlerini, etkili sshd ayarını, SSH servis durumunu, portu ve SSH host-key parmak izini kontrol eder. Oracle Cloud Security List/NSG ve VPS firewall'ında SSH/SFTP portunun dışarıdan açık olması panel içi doğrulamadan ayrı bir ağ gereksinimidir.
