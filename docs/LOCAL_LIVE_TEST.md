# Uji Gemini di komputer lokal

Paket v3.18.5 menyertakan runner HTTP untuk 17 alur dengan Gemini/Vertex. Pengujian dalam paket ini menggunakan provider demo; autentikasi Google dan kualitas output model live belum diuji.

## Persiapan

Gunakan Node.js 22 atau lebih baru dan jalankan `npm ci`. Simpan konfigurasi pada `.env` lokal. Untuk service account, isi:

```dotenv
ORGANA_LLM_PROVIDER=vertex
ORGANA_DRY_RUN=0
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_CLOUD_LOCATION=asia-southeast1
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json
```

Gunakan akun dan project yang dapat mengakses model Vertex yang dipilih. Runner mewarisi konfigurasi server lokal, termasuk model yang Anda pilih. Alternatif Gemini Developer API memakai `ORGANA_LLM_PROVIDER=gemini` dan `GEMINI_API_KEY` pada server. Simpan kredensial di komputer Anda; tidak perlu mengirimkannya ke percakapan.

## Menjalankan

```bash
npm run test:live -- --preflight
npm run test:live
```

Preflight hanya memeriksa konfigurasi. Pesan “ready” belum membuktikan autentikasi berhasil. Uji live berikutnya melakukan request model nyata dan dapat memakai kuota berbayar.

Runner membuat server sementara pada loopback dengan data Nusa Coffee yang terisolasi. Runner tidak memerlukan `npm start` dan tidak mengubah `data/state.json` atau `.env` Anda. Setelah selesai atau dibatalkan, server dihentikan dan data sementara dibersihkan.

## Batas dan hasil

Default batasnya 30 panggilan model, 8.192 token output per panggilan, 90 detik per request SDK, satu percobaan SDK, dan 20 menit untuk keseluruhan run. Reservasi panggilan ditulis sebelum request; request yang gagal tetap memakai anggaran. Anggaran bertahan saat server test direstart. Batas panggilan bisa diatur 1–200 dan token 1–32.768 melalui variabel `ORGANA_LIVE_CHECK_MAX_CALLS` dan `ORGANA_LIVE_CHECK_MAX_TOKENS`. Nilai token ini membatasi output, bukan seluruh token input atau biaya dalam mata uang.

Hasil tersimpan dalam `.local-qa/live-<timestamp>/results.json`, `report.md`, dan `budget.json`. Error direduksi agar kredensial yang diketahui, private key dan bearer token tidak tampil. Folder hasil lokal diabaikan Git. Jangan membagikan laporan yang masih berisi konteks pekerjaan privat tanpa memeriksanya.

Alur yang dicakup: health/provider/storage, perusahaan dan team, direct instruction, retry task, revisi dan histori, human approval, Knowledge dan provenance, rencana Chief of Staff, retry rencana, retry aktivasi, dependency dan review task, meeting, approval meeting yang tepat, penolakan approval lama, Stand-up, usage/events, serta persistensi setelah restart.

Jika model meminta klarifikasi, menghasilkan rencana tidak valid, tidak menjadwalkan meeting, atau gagal autentikasi, runner menyimpan hasil parsial dan berhenti. Runner tidak menyatakan semua alur live lolos pada kondisi tersebut. Pertanyaan dapat dijawab melalui UI Missions/Tasks untuk pemeriksaan manual.

## Memeriksa runner tanpa request Google

```bash
npm run test:live:runner
node scripts/live-check.cjs --fixture
```

Tujuh test runner memeriksa preflight, redaksi kredensial, batas panggilan/token, failure budget, 17 alur HTTP fixture, dan pembatalan. Mode `--fixture` secara eksplisit memakai provider demo dan menyimpan `liveExecutionVerified: false`. Hasil fixture yang disertakan ada di `docs/qa/live-fixture/`.
