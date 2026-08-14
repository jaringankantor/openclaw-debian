# OpenClaw Debian Docker

Setup Docker Compose untuk menjalankan OpenClaw Gateway dan CLI di Debian.

## Isi Project

- `docker-compose.yml` - konfigurasi service `openclaw-gateway` dan `openclaw-cli`
- `.env` - environment lokal untuk token/API key, tidak untuk dicommit
- `.env.opencodeadapter` - kredensial OpenCode Server untuk service adapter, tidak untuk dicommit
- `opencode-adapter/` - adapter API OpenAI-compatible untuk OpenCode Server
- `enkripsi.env` - contoh/arsip environment terenkripsi SOPS
- `enkripsi.env.opencodeadapter` - arsip SOPS untuk environment adapter

## Prasyarat

- Docker
- Docker Compose plugin (`docker compose`)
- File `.env` sudah tersedia di root project

Pastikan `.env` berisi konfigurasi yang dibutuhkan OpenClaw, misalnya token gateway dan API key provider yang dipakai.

Variabel yang didukung oleh `docker-compose.yml`:

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `OPENCLAW_GATEWAY_TOKEN` | wajib diisi | Token autentikasi gateway |
| `OPENCLAW_IMAGE` | `ghcr.io/openclaw/openclaw:latest` | Image atau versi OpenClaw |
| `OPENCLAW_GATEWAY_BIND` | `lan` | Interface tempat gateway mendengarkan |
| `OPENCLAW_GATEWAY_PORT` | `18789` | Port dashboard pada host |
| `OPENCLAW_STATE_PATH` | `./data/openclaw` | Lokasi state, konfigurasi, dan workspace |
| `OPENCLAW_AUTH_PATH` | `./data/auth` | Lokasi data autentikasi tambahan |
| `TZ` | `Asia/Jakarta` | Zona waktu container |
| `OPENCLAW_TZ` | `Asia/Jakarta` | Zona waktu yang digunakan OpenClaw |
| `XAI_API_KEY` | kosong | API key xAI, jika digunakan |
| `DEEPSEEK_API_KEY` | kosong | API key DeepSeek, jika digunakan |

Contoh minimal `.env`:

```dotenv
OPENCLAW_GATEWAY_TOKEN=ganti-dengan-token-yang-kuat
TZ=Asia/Jakarta
OPENCLAW_TZ=Asia/Jakarta
```

## Setup Pertama Kali

Jalankan onboarding OpenClaw:

```bash
docker compose run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js onboard --mode local --no-install-daemon
```

Set konfigurasi gateway untuk mode lokal dan akses dashboard dari browser:

```bash
docker compose run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js config set --batch-json '[{"path":"gateway.mode","value":"local"},{"path":"gateway.bind","value":"lan"},{"path":"gateway.controlUi.allowInsecureAuth","value":true},{"path":"gateway.controlUi.allowedOrigins","value":["http://localhost:18789","http://127.0.0.1:18789"]}]'
```

Jalankan gateway:

```bash
docker compose up -d
```

## Akses Dashboard

Buka:

```text
http://127.0.0.1:18789
```

Port dashboard dipetakan dari container ke host lewat konfigurasi:

```yaml
ports:
  - "${OPENCLAW_GATEWAY_PORT:-18789}:18789"
```

Jika `OPENCLAW_GATEWAY_PORT` diubah di `.env`, gunakan port tersebut pada URL
dashboard.

Jika membuka dashboard dari mesin lain lewat IP LAN, browser akan melihatnya sebagai plain HTTP remote origin, misalnya:

```text
http://10.252.23.8:18789
```

OpenClaw membutuhkan secure browser context untuk membuat device identity. Gunakan salah satu opsi berikut:

- Buka `http://127.0.0.1:18789` langsung dari host yang menjalankan gateway.
- Gunakan HTTPS, misalnya lewat Tailscale Serve atau reverse proxy TLS.
- Untuk akses sementara yang hanya mengandalkan token lokal, aktifkan `gateway.controlUi.allowInsecureAuth: true`. Jangan gunakan opsi ini untuk akses remote HTTP yang terbuka.

## Perintah Harian

Lihat status container:

```bash
docker compose ps
```

Lihat log gateway:

```bash
docker compose logs -f openclaw-gateway
```

Jalankan CLI OpenClaw:

```bash
docker compose run --rm openclaw-cli --help
```

Masuk ke CLI dengan argumen lain:

```bash
docker compose run --rm openclaw-cli <command>
```

Restart gateway:

```bash
docker compose restart openclaw-gateway
```

Stop semua service:

```bash
docker compose down
```

## DeepSeek Provider

Karena OpenClaw berjalan lewat Docker Compose, jalankan perintah `openclaw` melalui service `openclaw-cli`.

Pastikan gateway sudah berjalan:

```bash
docker compose up -d
```

Install plugin DeepSeek:

```bash
docker compose run --rm openclaw-cli plugins install @openclaw/deepseek-provider
```

Restart gateway:

```bash
docker compose restart openclaw-gateway
```

Jalankan onboarding dengan pilihan DeepSeek API key:

```bash
docker compose run --rm openclaw-cli onboard --auth-choice deepseek-api-key
```

Jika perintah dokumentasi OpenClaw menyebut:

```bash
openclaw gateway restart
```

Untuk setup Docker Compose ini gunakan:

```bash
docker compose restart openclaw-gateway
```

## OpenCode Server dan Adapter

OpenCode Server menggunakan API session sendiri, bukan API provider model
OpenAI-compatible. Service `opencode-adapter` menerjemahkan API tersebut menjadi
endpoint `/v1/models` dan `/v1/chat/completions` agar OpenClaw dapat memakai
OpenCode sebagai provider `opencode/openclaw`.

```text
OpenClaw Gateway
    -> http://opencode-adapter:4091/v1
    -> http://host.docker.internal:4090
    -> OpenCode Server (agent openclaw-consultant)
```

Port adapter hanya dipublikasikan pada `127.0.0.1:4091` di host. Antar-container
menggunakan nama service Docker `opencode-adapter:4091`.

### Menjalankan OpenCode Server

OpenCode pada host harus mendengarkan pada interface yang dapat dijangkau dari
container, bukan hanya `127.0.0.1`:

```bash
OPENCODE_SERVER_USERNAME='opencode_anwar' \
OPENCODE_SERVER_PASSWORD='ganti-dengan-password-yang-kuat' \
opencode serve --hostname 0.0.0.0 --port 4090
```

Batasi akses port `4090` melalui firewall karena bind `0.0.0.0` dapat membuat
service dapat diakses dari jaringan lain. Jangan commit kredensial ke repository.

### Environment adapter

Buat `.env.opencodeadapter` dengan isi berikut:

```dotenv
PORT=4091
OPENCODE_URL=http://host.docker.internal:4090
OPENCODE_USERNAME=opencode_anwar
OPENCODE_PASSWORD=ganti-dengan-password-yang-kuat
OPENCODE_AGENT=openclaw-consultant
```

File `.env.opencodeadapter` dicakup pola `.env.*` pada `.gitignore` sehingga
kredensial tidak ikut ter-commit.

### Build dan menjalankan adapter

Build dan jalankan seluruh service:

```bash
docker compose up -d --build
```

Atau hanya build dan jalankan adapter:

```bash
docker compose up -d --build opencode-adapter
```

Periksa status dan log:

```bash
docker compose ps
docker compose logs --tail=100 opencode-adapter
```

Tes health adapter dari host:

```bash
curl http://127.0.0.1:4091/health
curl http://127.0.0.1:4091/v1/models
```

Tes jalur yang dipakai gateway dari jaringan Docker:

```bash
docker compose exec openclaw-gateway node -e \
  "fetch('http://opencode-adapter:4091/health').then(async response => console.log(response.status, await response.text())).catch(console.error)"
```

Respons health yang benar memiliki nilai `healthy: true`, upstream
`http://host.docker.internal:4090`, dan agent `openclaw-consultant`.

### Provider OpenClaw

Provider yang tersimpan di konfigurasi OpenClaw menggunakan nilai utama berikut:

```json
{
  "models": {
    "providers": {
      "opencode": {
        "baseUrl": "http://opencode-adapter:4091/v1",
        "apiKey": "local-adapter",
        "api": "openai-completions",
        "timeoutSeconds": 300,
        "models": [
          {
            "id": "openclaw",
            "name": "OpenCode",
            "reasoning": false,
            "input": ["text"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 128000,
            "maxTokens": 16384,
            "api": "openai-completions"
          }
        ]
      }
    }
  }
}
```

`apiKey` hanya merupakan nilai placeholder karena adapter saat ini tidak
memvalidasi Bearer token. Basic Auth ke OpenCode Server tetap berada di
`.env.opencodeadapter`.

Verifikasi dan pilih model:

```bash
docker compose run --rm openclaw-cli config get models.providers.opencode
docker compose run --rm openclaw-cli models list --provider opencode --all
docker compose run --rm openclaw-cli models set opencode/openclaw
docker compose restart openclaw-gateway
```

Adapter membuat session OpenCode baru untuk setiap request chat. Streaming
didukung dalam format SSE, tetapi jawaban upstream dikumpulkan terlebih dahulu
sebelum dikirim sebagai satu bagian teks. Nilai penggunaan token dikembalikan
sebagai `0` karena OpenCode Server tidak memberikan statistik token melalui
respons yang dipakai adapter.

### Plugin OpenCode Consult

Plugin lokal `opencode-consult` tetap tersedia sebagai jalur terpisah untuk
konsultasi coding read-only. Plugin menyediakan tool `opencode_consult`; OpenCode
memberikan diagnosis dan saran, sedangkan OpenClaw tetap menjadi pelaksana.

Verifikasi plugin:

```bash
docker compose run --rm openclaw-cli plugins info opencode-consult
docker compose run --rm openclaw-cli config get plugins.entries.opencode-consult
```

Contoh permintaan:

```text
Gunakan opencode_consult untuk menganalisis penyebab test ini gagal. Jangan ubah
file sebelum hasil konsultasi ditinjau.
```

Jika adapter menampilkan `ECONNREFUSED`, periksa listener upstream:

```bash
ss -ltnp | grep ':4090'
```

Listener harus terlihat pada `0.0.0.0:4090`. HTTP `401` menunjukkan kredensial
OpenCode tidak sesuai. Error agent tidak ditemukan menunjukkan nilai
`OPENCODE_AGENT` tidak tersedia pada OpenCode Server.

## Menautkan Nomor WhatsApp

OpenClaw menautkan WhatsApp sebagai perangkat tertaut melalui WhatsApp Web.
Nomor yang direkomendasikan adalah nomor khusus untuk asisten, meskipun nomor
pribadi tetap dapat digunakan. Session dan kredensial WhatsApp disimpan di
`${OPENCLAW_STATE_PATH:-./data/openclaw}` pada host.

Pastikan gateway berjalan:

```bash
docker compose up -d
```

Install plugin WhatsApp jika belum tersedia:

```bash
docker compose run --rm openclaw-cli \
  plugins install clawhub:@openclaw/whatsapp
```

Mulai login interaktif untuk session/account `default`:

```bash
docker compose run --rm openclaw-cli \
  channels login --channel whatsapp --account default
```

Setelah QR muncul di terminal:

1. Buka WhatsApp pada ponsel dengan nomor yang akan dipakai OpenClaw.
2. Pilih **Perangkat tertaut** atau **Linked devices**.
3. Pilih **Tautkan perangkat** atau **Link a device**.
4. Pindai QR dari terminal dan tunggu sampai login selesai.

QR memiliki masa berlaku singkat. Jika kedaluwarsa, jalankan kembali perintah
login untuk membuat QR baru.

Restart gateway agar listener memakai session yang baru ditautkan:

```bash
docker compose restart openclaw-gateway
```

Periksa status channel:

```bash
docker compose run --rm openclaw-cli channels status
docker compose logs --tail=100 openclaw-gateway
```

Secara default, pesan langsung dari nomor baru memakai kebijakan pairing. Kirim
pesan ke nomor WhatsApp OpenClaw, lalu lihat dan setujui permintaan pairing:

```bash
docker compose run --rm openclaw-cli pairing list whatsapp
docker compose run --rm openclaw-cli pairing approve whatsapp <CODE>
```

Ganti `<CODE>` dengan kode yang ditampilkan oleh perintah `pairing list`.
Permintaan pairing berlaku selama satu jam.

Untuk menautkan nomor tambahan, gunakan nama account yang berbeda, misalnya
`work`:

```bash
docker compose run --rm openclaw-cli \
  channels login --channel whatsapp --account work
```

Untuk melepas session tertentu:

```bash
docker compose run --rm openclaw-cli \
  channels logout --channel whatsapp --account default
```

Jangan menjalankan login berulang kali jika channel sudah tersambung karena hal
tersebut dapat menimbulkan konflik session WhatsApp. Cek status terlebih dahulu.

## Backup dan Restore

State aktif berada di `./data/openclaw` dan data autentikasi tambahan berada di
`./data/auth`, kecuali lokasinya diubah melalui `.env`. Hentikan gateway sebelum
menyalin data agar backup konsisten.

### Membuat backup

Buat nama direktori backup, misalnya `openclaw-YYYYMMDD-HHMMSS`, lalu jalankan:

```bash
docker compose stop openclaw-gateway
sudo mkdir -p backup/openclaw-YYYYMMDD-HHMMSS/openclaw
sudo mkdir -p backup/openclaw-YYYYMMDD-HHMMSS/auth
sudo cp -a data/openclaw/. backup/openclaw-YYYYMMDD-HHMMSS/openclaw/
sudo cp -a data/auth/. backup/openclaw-YYYYMMDD-HHMMSS/auth/
docker compose start openclaw-gateway
```

Ganti `YYYYMMDD-HHMMSS` dengan waktu pembuatan backup. Simpan direktori backup
secara privat karena dapat berisi token, session channel, identitas perangkat,
dan kredensial.

### Restore state

Contoh berikut mempertahankan state aktif sebagai rollback sebelum memasang
backup. Ganti `<BACKUP_NAME>` dengan nama direktori backup yang akan digunakan:

```bash
docker compose down
sudo mv data/openclaw data/openclaw.before-restore-YYYYMMDD-HHMMSS
sudo mv data/auth data/auth.before-restore-YYYYMMDD-HHMMSS
sudo mkdir -p data/openclaw data/auth
sudo cp -a backup/<BACKUP_NAME>/openclaw/. data/openclaw/
sudo cp -a backup/<BACKUP_NAME>/auth/. data/auth/
docker compose up -d
```

Jika backup lama hanya berisi isi state secara langsung—misalnya terdapat
`openclaw.json`, `workspace`, dan `credentials` tepat di bawah direktori
backup—pertahankan `data/auth` yang aktif dan restore state dengan urutan
berikut:

```bash
docker compose down
sudo mv data/openclaw data/openclaw.before-restore-YYYYMMDD-HHMMSS
sudo mkdir -p data/openclaw
sudo cp -a backup/<BACKUP_NAME>/. data/openclaw/
docker compose up -d
```

Setelah restore, verifikasi gateway dan channel:

```bash
docker compose ps
docker compose logs --tail=100 openclaw-gateway
docker compose run --rm openclaw-cli channels status
```

Direktori `data/*.before-restore-YYYYMMDD-HHMMSS` dapat dipakai untuk rollback.
Jangan menghapusnya sebelum konfigurasi, workspace, plugin, dan channel pada
hasil restore sudah dipastikan berfungsi.

## Upgrade OpenClaw

Jalankan perintah berikut dari root project:

```bash
cd /root/docker/openclaw-debian
docker compose pull
docker compose up -d
```

`docker compose pull` mengambil versi terbaru dari image yang ditentukan oleh
`OPENCLAW_IMAGE` (default `ghcr.io/openclaw/openclaw:latest`). Perintah
`docker compose up -d` kemudian membuat ulang container jika image berubah.

Verifikasi bahwa gateway kembali sehat:

```bash
docker compose ps
docker compose logs --tail=100 openclaw-gateway
```

Konfigurasi, autentikasi, dan workspace tetap tersimpan pada direktori host yang
ditentukan oleh `OPENCLAW_STATE_PATH` dan `OPENCLAW_AUTH_PATH`, sehingga tidak
hilang saat container dibuat ulang.

> Jangan menghapus direktori state atau auth ketika melakukan upgrade. Buat
> backup terlebih dahulu sebelum mengubah lokasi kedua direktori tersebut.

Setelah memastikan versi baru berjalan dengan baik, image lama yang tidak lagi
digunakan dapat dibersihkan secara opsional:

```bash
docker image prune
```

## Data Persisten

Data OpenClaw menggunakan bind mount agar mudah dicadangkan dari host:

| Lokasi host | Lokasi container | Isi |
| --- | --- | --- |
| `${OPENCLAW_STATE_PATH:-./data/openclaw}` | `/home/node/.openclaw` | Konfigurasi, workspace, plugin, dan session channel |
| `${OPENCLAW_AUTH_PATH:-./data/auth}` | `/home/node/.config/openclaw` | Data autentikasi tambahan |

`docker compose down` maupun pembuatan ulang container tidak menghapus kedua
direktori tersebut. Jangan menghapusnya kecuali memang ingin mereset OpenClaw
dan sudah membuat backup data yang diperlukan.

Sebagian file mungkin dimiliki oleh UID pengguna di dalam container sehingga
perintah host biasa menampilkan `Permission denied`. Gunakan `sudo` hanya untuk
operasi backup, restore, atau pemeriksaan file yang memang diperlukan; jangan
mengubah permission secara rekursif ketika gateway sedang berjalan.

## Troubleshooting

Cek healthcheck dan status:

```bash
docker compose ps
```

Jika dashboard tidak bisa dibuka, cek log:

```bash
docker compose logs --tail=100 openclaw-gateway
```

Jika konfigurasi berubah tetapi belum terbaca, restart gateway:

```bash
docker compose restart openclaw-gateway
```

Jika port `18789` sudah dipakai proses lain, set port lain di `.env`, misalnya:

```dotenv
OPENCLAW_GATEWAY_PORT=18790
```

Lalu jalankan ulang:

```bash
docker compose up -d
```

### Secure Browser Context Required

Jika muncul error:

```text
Secure browser context required
This page is running over plain HTTP, so the browser cannot create the device identity the Gateway expects.
```

Penyebabnya biasanya dashboard dibuka dari IP LAN seperti `http://10.252.23.8:18789`. Browser hanya menganggap `localhost`/`127.0.0.1` atau HTTPS sebagai secure context.

Solusi yang disarankan:

```text
http://127.0.0.1:18789
```

Jika harus dibuka dari perangkat lain, gunakan HTTPS. Jika hanya untuk kompatibilitas lokal dan paham risikonya, jalankan:

```bash
docker compose run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js config set --batch-json '[{"path":"gateway.controlUi.allowInsecureAuth","value":true},{"path":"gateway.controlUi.allowedOrigins","value":["http://localhost:18789","http://127.0.0.1:18789","http://10.252.23.8:18789"]}]'
```

Lalu restart gateway:

```bash
docker compose restart openclaw-gateway
```

## Catatan Keamanan

- Jangan commit `.env`, token, API key, atau file rahasia lain.
- Simpan secret terenkripsi dengan SOPS/age jika perlu dibagikan antar mesin.
- Service sudah memakai `no-new-privileges:true` dan drop capability `NET_RAW` serta `NET_ADMIN`.
