# Organa v3.18.5 — verifikasi end to end

Verifikasi rilis menggunakan data terisolasi dan provider deterministic demo. Source dimulai dari arsip v3.18.2, kemudian perbaikan flow dan UI dibangun kembali. Rilis ini bukan salinan identik v3.18.4 yang hilang.

## Hasil

| Pemeriksaan | Hasil | Bukti / command |
| --- | --- | --- |
| Syntax JavaScript | Lolos | `npm run check` |
| Sembilan script regresi core lama | Lolos | `npm test` |
| API onboarding | 12 / 12 | `tests/onboarding-api.cjs` |
| API team, meetings, stand-up dan workflow | 15 / 15 | `tests/workflows-api.cjs` |
| Pemulihan retry, persistence, reassignment, klarifikasi dan reset | 20 / 20 | `tests/recovery-regressions.cjs` |
| Guard dan runner lokal Gemini | 7 / 7 | `tests/live-check-runner.cjs` |
| Browser onboarding | 24 / 24 | [JSON](qa/onboarding/onboarding-e2e-results.json) |
| Browser workflow | 30 / 30 | [JSON](qa/workflows/workflows-e2e-results.json) |
| Browser UI workspace | 14 / 14 | [JSON](qa/ui/workspace-ui-results.json) |
| Browser Office dan landing | 19 / 19 | [JSON](qa/office/office-ui-results.json) |
| Layout workspace | 50 kombinasi | 10 halaman × 320, 390, 768, 1024 dan 1440 px, bagian dari suite UI |
| Runner HTTP dalam mode fixture | 17 / 17 | [JSON](qa/live-fixture/results.json), `liveExecutionVerified: false` |

Total browser: **87 skenario**. Total test dengan pelaporan `node:test`: **54** ditambah sembilan script regresi core. Lima puluh kombinasi layout adalah bagian dari satu skenario UI; 17 alur runner fixture juga dicakup oleh satu test runner. Angka tersebut tidak dijumlahkan ulang sebagai test independen.

## Lingkup yang penting

- Setup dari outcome/template, review edits, coordinator, nama unik, failure/retry, lost-response recovery, reload dan misi pertama.
- Profil/lifecycle/hiring team, validasi dan failed-save recovery; Office yang dibangun ulang memakai roster tersimpan.
- Direct assignment, rencana Chief of Staff, retry identitas, dependency, review, revisi, histori, deliverable dan provenance. Failed save pada task answer/retry/review menjaga versi, approval dan dependency; aktivasi North Star menjaga versi aktif sebelumnya.
- Klarifikasi misi: pertanyaan, draft setelah reload, failed save, jawaban concurrent, history, restart, stale request dan reset organisasi.
- Meeting dari pekerjaan nyata: dependency/participant readiness, independent contributions, revision feedback, failed save, approval saat ini dan penolakan approval lama.
- Stand-up dengan referensi yang valid, priority, source navigation, penggunaan tercatat dan verified fallback.
- Overview/Evaluation tanpa navigasi internal; satu judul halaman, semua route ponsel, keyboard Escape, focus, safe document rendering dan reduced motion.
- Office: identitas avatar, empat floor, whole building, instruksi individu/divisi/custom, kapasitas meeting, empty selection, berjalan melalui tangga, kembali ke desk, task review, kamera, volume musik dan aset video lokal.

## Reproduksi

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:e2e:all
```

Empat suite browser menggunakan server/data sementara. Bila Chromium sudah tersedia, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ke path executable. Verifikasi paket ini memakai Chromium 143 melalui executable lokal karena download Playwright Chromium pada lingkungan kerja menghasilkan arsip terpotong. File Chromium tersebut bukan bagian dari source ZIP.

## Batas bukti

Tidak ada kredensial Gemini yang digunakan dan tidak ada request Google live selama verifikasi ini. Autentikasi service account, kualitas jawaban model live dan perilaku provider di project Anda masih perlu diperiksa lewat [runner lokal](LOCAL_LIVE_TEST.md). Fixture dokumen digunakan untuk memeriksa format dan konten berbahaya, bukan kualitas jawaban AI.

Pengujian browser dilakukan pada Chromium; Safari/Firefox dan perangkat fisik belum diperiksa. Persistensi yang diuji memakai JSON lokal, bukan transaksi Firestore live. Roster Office setelah perubahan lifecycle team mengikuti petunjuk reload yang tampil pada UI. Hasil lolos pada skenario di atas tidak membuktikan tidak ada bug pada setiap kemungkinan input atau integrasi eksternal.
