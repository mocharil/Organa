# Organa v3.18.5 — UI dan alur fitur

Versi ini dibangun kembali dari arsip v3.18.2 yang tersedia. Source lengkap v3.18.4 tidak berhasil dipulihkan, sehingga v3.18.5 adalah rilis pengganti dengan perubahan dan pengujian yang tercatat di sini.

Tampilan memakai token desain Organa, tipografi yang konsisten, card dengan jarak lebih lega, tombol utama yang jelas, loading, empty state, fokus keyboard, serta dukungan reduced motion. Navigasi utama tetap satu; popup Overview, Performance/Evaluation dan Tasks tidak mengulang sidebar.

| Fitur | Perubahan / perilaku yang diperiksa | Bukti |
| --- | --- | --- |
| Onboarding | Dua jalur setup, review team, validasi, draft saat reload, retry tanpa duplikasi, aktivasi dan misi pertama | [Hasil 24 skenario](qa/onboarding/onboarding-e2e-results.json) |
| Overview | Metrik dari data tersimpan, shortcut ke fitur terkait, North Star, aksi utama yang jelas | [Desktop](qa/ui/company-1440.png), [ponsel](qa/ui/company-390.png) |
| Missions | Search/status, dua jalur intake, draft brief, jawaban klarifikasi pada misi yang sama, aktivasi aman ketika pindah halaman | [Desktop](qa/ui/mission-1440.png), [klarifikasi](qa/ui/clarification-1440.png) |
| Tasks | Search/filter, list lebih dulu di ponsel, nama coworker lengkap, hasil terformat, histori, draft dan pilihan penerima yang bertahan | [Desktop](qa/ui/tasks-1440.png), [ponsel](qa/ui/tasks-390.png) |
| Team | Structure dan People, search coworker, profil/configuration, draft edit, lifecycle dan hiring | [People](qa/ui/people-1440.png), [ponsel](qa/ui/people-390.png) |
| Meetings | Card/search/status, perspektif peserta, decision record, revisi inline, review sesuai versi saat ini | [Desktop](qa/ui/meetings-1440.png), [ponsel](qa/ui/meetings-390.png) |
| Knowledge | Search/count/clear, versi terkini, format heading/list/table/code, provenance, konten HTML tidak dieksekusi | [Dokumen](qa/ui/document-1440.png), [320 px](qa/ui/document-320.png) |
| Approvals | Search/status, feedback revisi yang tersimpan, konteks dan tombol sumber task/meeting | [Desktop](qa/ui/review-1440.png), [ponsel](qa/ui/review-390.png) |
| Stand-up | Brief bertingkat prioritas, sumber task/meeting/approval, empty state dan fallback yang diberi label | [Desktop](qa/ui/standup-1440.png), [ponsel](qa/ui/standup-390.png) |
| Goals / North Star | Versi aktif, constraints, editor dengan draft yang bertahan setelah pindah halaman/reload | [Desktop](qa/ui/goals-1440.png), [ponsel](qa/ui/goals-390.png) |
| Performance / Evaluation | Metrik dari aktivitas tersimpan, progress misi, identitas coworker dan link ke profil | [Desktop](qa/ui/performance-1440.png), [ponsel](qa/ui/performance-390.png) |
| AI Settings | Form lebih rapi, panduan kredensial yang dapat dibuka, mode demo/live yang jelas | [Desktop](qa/ui/settings-1440.png), [ponsel](qa/ui/settings-390.png) |
| Office / landing | Nama lengkap coworker, instruksi orang/divisi/custom, kapasitas meeting, perjalanan antar lantai, detail tanpa tertutup kontrol, musik/video lokal | [Office desktop](qa/office/office-1440.png), [ponsel](qa/office/office-390.png), [landing](qa/office/landing-1440.png) |

Navigasi ponsel menyediakan tombol **All pages** untuk seluruh 12 tujuan. Escape menutup menu tersebut tanpa menutup workspace: [screenshot](qa/ui/mobile-all-pages.png).

## Pemulihan perilaku

Retry membuat satu task, satu misi, atau satu versi North Star untuk request yang sama, termasuk setelah restart. Failed save pada pembuatan, aktivasi, jawaban, review, klarifikasi dan reassignment mengembalikan state yang dapat dicoba ulang. Reassignment tidak melewati dependency yang belum selesai dan tidak mengganti pemilik task yang sedang berjalan, ditinjau atau sudah selesai. Rename coworker mempertahankan identitas penerima. Response worker atau klarifikasi dari organisasi lama tidak menulis hasil ke organisasi yang di-reset.

Misi yang meminta input sekarang menampilkan daftar pertanyaan dan textarea jawaban. Jawabannya mempertahankan ID misi, goal dan histori; rencana baru tetap harus ditinjau sebelum **Start Mission**. Approval source membuka record yang tepat. Hasil request aktivasi tidak mengambil alih halaman lain yang sedang Anda lihat.

## Cara memeriksa

```bash
npm ci
npx playwright install chromium
npm run check
npm test
npm run test:e2e:all
```

[Hasil verifikasi lengkap](END_TO_END_QA.md) membedakan pengujian demo dari uji Gemini live. Screenshot berasal dari data test terisolasi; angka demo dan dokumen fixture bukan bukti kualitas model live.

Perubahan lifecycle team pada Office memerlukan reload untuk membangun ulang roster 3D. UI menampilkan petunjuk reload setelah menyimpan status. File ZIP berisi source, lockfile, test, panduan lokal dan screenshot; dependency dan kredensial lokal tidak dimasukkan.
