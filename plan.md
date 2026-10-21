# Rencana Implementasi — Desain Lokal

## Produk dan lingkup

Bangun aplikasi internal berbahasa Indonesia untuk mengelola permintaan desain dari intake sampai arsip. Scope MVP: autentikasi Manus; pengaturan role dan pemetaan Designer 1–8; Form Permintaan Marketing dan pencatatan permintaan Owner; gerbang review SPV/Manager; pembuatan tiket DES oleh SPV dengan Designer wajib; dashboard status/tindakan; panel beban kerja; pembaruan Job Status oleh Designer; pengajuan dan keputusan Owner; pencatatan manual JOS-D/JOD/DG; checklist QC SPV → QC1 → QC2; bukti path upload; serta penutupan dan riwayat audit.

Integrasi langsung dengan Clipper dan server `192.168.0.24` **tidak diasumsikan tersedia**. Pada MVP Admin/SPV mencatat nomor JOD, status Clipper dan path server secara manual. Kapasitas beban berbasis jam tidak diklaim tersedia sebelum effort dan kapasitas ditetapkan; panel awal menghitung tiket menurut status dan tenggat.

## Rancangan produk

### Peran dan alur

Pertahankan login Manus OAuth dan tambahkan login lokal `username`/`password` tanpa email sesuai permintaan. Akun lokal `admin` memperoleh role Admin aplikasi; kredensial masuk ke tabel khusus, password hanya disimpan sebagai hash scrypt dengan salt acak, percobaan login dibatasi, dan sesi memakai cookie aplikasi tervalidasi yang sama dengan OAuth. Password bootstrap awal masuk lewat secret terlindungi dan hanya dipakai sekali untuk menginisialisasi hash; jangan menaruh credential pada source/Git/log.

Simpan role aplikasi pada tabel pengguna. Owner proyek menjadi administrator awal melalui mekanisme `ownerOpenId` starter. Admin aplikasi dapat memetakan akun ke role operasional serta memasangkan nama asli ke placeholder Designer 1–8. Label Designer tetap dapat ditampilkan sebelum nama terisi. SPV harus memilih satu Designer penanggung jawab dari slot aktif sebelum menerbitkan tiket, dan dapat mengalihkan tiket aktif ke slot lain saat menyeimbangkan beban; setiap pengalihan tercatat di audit. Designer hanya dapat mengubah Job Status pada tiket yang ditugaskan kepadanya.

Status workflow (misalnya Menunggu Review, Review SPV, Menunggu ACC Owner, Finalisasi, QC dan Closed) dikelola oleh gerbang aplikasi. Job Status terpisah dan diperbarui Designer: Belum mulai, Sedang dikerjakan, Menunggu feedback/keputusan, Revisi dikerjakan, Draft dikirim, Final dikirim, Terhambat (alasan wajib), dan Selesai. Setiap perubahan disimpan sebagai riwayat audit.

### Layar

- Dashboard dengan ringkasan antrean dan aksi yang menunggu peran pengguna, SLA/overdue (termasuk 12 jam untuk tahap pembuatan brief), umur/PIC tiket, tabel tiket terbaru, serta panel workload Designer 1–8; daftar tiket dapat difilter dan assignment aktif dapat dialihkan oleh SPV.
- Intake permintaan: form Marketing dengan field wajib dan validasi prioritas Urgent; permintaan Owner yang dicatat SPV/Manager; keputusan diterima/perlu dilengkapi/ditunda/ditolak dengan alasan.
- Daftar tiket dan halaman detail bertab: brief, file/versi, komentar, keputusan Owner, nomor JOS-D/JOD/DG, checklist QC, aktivitas, dan arsip.
- Workspace Designer untuk update Job Status/progres/hambatan, mengunggah draft/final, dan melihat revisi.
- Workspace QC bertahap dengan 18 item sesuai workbook dan catatan wajib pada kegagalan.
- Pengaturan untuk pemetaan delapan slot Designer serta role aplikasi.

## Pendekatan implementasi

Gunakan starter terpasang React + TypeScript + Tailwind di `client/`, Express + tRPC di `server/`, Drizzle ORM + MySQL di `drizzle/`, dan database terkelola proyek. Manus OAuth tetap aktif; endpoint login lokal menerima hanya username/password dan membuat sesi melalui cookie starter. Tidak membuat login simulasi, tidak menaruh data tiket pada `localStorage`, dan tidak menanam data tiket uji ke database bersama.

File desain/lampiran, bila diaktifkan pada MVP, diunggah melalui helper Storage server `server/storage.ts`; API server memeriksa role, tipe dan batas ukuran, lalu menyimpan indeks file dan pemilik tiket di database. Versi final internal diperlukan sebelum QC sebagai file yang diperiksa; ini berbeda dari upload/catat path produksi pada server `192.168.0.24`, yang baru dapat dilakukan setelah QC2 lolos. Untuk JOD/Clipper dan lokasi server gunakan field input manual yang tersimpan beserta aktor dan waktu.

### Struktur proyek yang dituju

- `client/src/App.tsx`: routing dan shell aplikasi.
- `client/src/pages/`: Dashboard, Requests, Tickets, TicketDetail, DesignerWorkspace, QCWorkspace, Settings.
- `client/src/components/`: sidebar, topbar, status badge/timeline, workload panel, tabel dan dialog; pakai komponen Radix/shadcn yang sudah tersedia.
- `client/src/index.css`: token desain, typography, layout responsif dan animasi ringan.
- `client/index.html`: metadata halaman dan pemuatan keluarga font resmi.
- `client/public/manus-routes.json`: manifest route statis yang sinkron dengan route UI dan disajikan oleh `publicDir` Vite.
- `shared/workflow.ts`: tipe/status, label tahapan, dan aturan transisi bersama.
- `drizzle/schema.ts` + `drizzle/`: tabel pengguna/role, kredensial username lokal dengan hash scrypt, slot Designer, requests, tickets, assignments/status history, approvals, QC, file metadata dan audit events; migrasi additive dan deterministik.
- `server/db.ts`: query terparameterisasi dan transaksi untuk gerbang status.
- `server/features/`: modul backend untuk requests, tickets, designer pool/workload, approvals, QC, attachments/archive.
- `server/routers.ts`: gabungkan router fitur dan terapkan protected procedures serta pemeriksaan role.
- `app.config.ts`: metadata logo proyek berupa URL HTTPS yang valid.

## Aturan penting

- Marketing tidak dapat mengirim form tanpa sumber permintaan, estimasi produksi, justifikasi bisnis dan detail wajib; alasan urgent wajib saat Urgent.
- Hanya permintaan yang diterima yang dapat menjadi tiket. Tiket diterbitkan SPV dan wajib menyimpan satu Designer utama dari slot aktif 1–8.
- Designer tidak mulai tanpa tiket dan memperbarui Job Status; perubahan status aktor dan timestamp tersimpan.
- JOS-D hanya aktif setelah ACC Owner. JOD/DG dan catatan Clipper dapat dimasukkan manual.
- QC SPV → QC1 → QC2 harus berurutan. File final internal tersedia untuk diperiksa pada QC; upload/path produksi baru dapat dicatat setelah QC2 lolos.
- Tiket tidak dapat ditutup sebelum JOD dan arsip wajib lengkap.
- Perubahan akses, reassignment, keputusan, revisi, status, dan arsip disimpan di audit log.

## Rencana tampilan

Tiga arah visual yang mungkin (probabilitas kecil untuk mencatat alternatif, bukan tingkat kepastian):

1. **Editorial production folio** — 0,07: nuansa kertas hangat, garis pemisah seperti lembar kerja, metadata monospasi, dan warna sinyal yang terukur.
2. **Minimalist SaaS grid** — 0,05: panel putih dingin, kartu simetris, dan dekorasi seminimal mungkin.
3. **Dark command center** — 0,03: latar gelap, kontras neon, dan kepadatan data ala pusat operasi digital.

**Pilihan untuk persetujuan: Editorial production folio.**

- **Design Movement:** editorial Swiss/industrial yang mengambil disiplin visual dari lembar produksi dan sistem tiket, tanpa meniru produk tertentu.
- **Core Principles:** status harus dapat dipindai sekilas; identitas tiket selalu terlihat; beban kerja dapat dibandingkan dengan adil; kontrol QC tidak boleh disamarkan sebagai dekorasi.
- **Color Philosophy:** latar ivory terang menjaga layar kerja nyaman; tinta arang memberi kontras; hijau-teal gelap menjadi warna identitas untuk kontrol proses; vermilion hanya menandai urgensi, blokir, atau kegagalan.
- **Layout Paradigm:** navigasi vertikal di sisi kiri, header ringkas, area kerja lebar bertumpu pada tabel/timeline; workload Designer berupa pita/daftar horizontal yang dapat membuka tiket, bukan dashboard kartu simetris penuh.
- **Signature Elements:** aksen nomor tiket monospasi; garis vertikal/tahap untuk timeline; chip status berbentuk label produksi.
- **Interaction Philosophy:** gerbang proses eksplisit; aksi utama diberi label jelas; aksi destruktif atau final membutuhkan konfirmasi; keyboard dan fokus terlihat.
- **Animation:** transisi opacity/posisi ringan 140–180 ms; jangan animasikan angka status berulang atau menunda penyelesaian aksi; hormati reduced motion.
- **Typography System:** IBM Plex Sans untuk antarmuka dan IBM Plex Mono untuk nomor tiket, kode, metadata, dan waktu; skala ringkas dengan angka tabel tabular.
- **Brand Essence:** meja kontrol desain lokal dari permintaan sampai siap produksi; untuk SPV, Designer dan QC; teliti, tenang, akuntabel.
- **Brand Voice:** judul dan aksi singkat, langsung ke tindakan. Contoh: “Tinjau permintaan baru” dan “Menunggu cek QC 2”.
- **Wordmark & Logo:** simbol jalur bertingkat yang membentuk huruf D/lembar kerja, disertai wordmark “DESAIN LOKAL”; dibuat sebagai SVG sebaris sederhana.
- **Signature Brand Color:** deep process teal (hijau-teal gelap) untuk identitas dan aksi primer.

### Aset tipografi

IBM Plex Sans dan IBM Plex Mono digunakan dari Google Fonts sebagai pasangan Sans + Mono yang satu keluarga visual. Sumber: [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans) dan [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono). Antarmuka tetap memiliki fallback system font bila aset eksternal tidak tersedia. Dashboard internal tidak memerlukan ilustrasi dekoratif.

## Penyajian dan batas deployment

Aplikasi akan berjalan pada port `3000` untuk Cloud Preview. Perubahan yang disetujui dicatat sebagai checkpoint Git melalui remote kanonis Manus. `publishing.auto_publish` saat ini `false`; rencana ini tidak mengaktifkan publikasi atau mengubah visibilitas aplikasi. Preview dipakai untuk meninjau hasil. Data development dan produksi berbagi database proyek, sehingga tidak ada destructive reset, test seeding, atau data uji yang dimasukkan ke database bersama.
