# OpenClaw Debian Docker

Setup Docker Compose untuk menjalankan OpenClaw Gateway dan CLI di Debian.

## Isi Project

- `docker-compose.yml` - konfigurasi service `openclaw-gateway` dan `openclaw-cli`
- `.env` - environment lokal untuk token/API key, tidak untuk dicommit
- `enkripsi.env` - contoh/arsip environment terenkripsi SOPS

## Prasyarat

- Docker
- Docker Compose plugin (`docker compose`)
- File `.env` sudah tersedia di root project

Pastikan `.env` berisi konfigurasi yang dibutuhkan OpenClaw, misalnya token gateway dan API key provider yang dipakai.

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
  - "18789:18789"
```

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

## Update Image

Ambil image terbaru:

```bash
docker compose pull
```

Jalankan ulang container:

```bash
docker compose up -d
```

## Data Persisten

State dan konfigurasi OpenClaw disimpan di Docker volume:

- `openclaw_state` -> `/home/node/.openclaw`
- `openclaw_auth` -> `/home/node/.config/openclaw`

`docker compose down` tidak menghapus volume tersebut. Jika benar-benar ingin reset state, hapus volume secara manual setelah memastikan tidak ada data penting yang masih dibutuhkan.

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

Jika port `18789` sudah dipakai proses lain di host, ubah mapping port di `docker-compose.yml`, lalu jalankan ulang:

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
