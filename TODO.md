# TODO — Desain Lokal

## 1. Login, role, dan navigasi aplikasi
- [x] Implementasikan autentikasi Manus OAuth dari starter dan gunakan sesi aplikasi yang valid; jangan membuat akun/login simulasi atau bypass login saat development.
- [x] Sediakan role aplikasi Marketing, Owner, Manager, SPV, Designer, MPP, Admin, QC Checker 1, QC Checker 2, dan Admin aplikasi dengan kontrol akses di server serta UI.
- [x] Role pengguna dan perubahan role hanya dapat dikelola oleh admin yang berwenang; pengguna yang belum memiliki role operasional mendapat status/arah yang jelas.
- [x] Aplikasi responsif dengan navigasi untuk Dashboard, Permintaan, Tiket, Workspace Designer, QC, dan Pengaturan sesuai hak akses.
- [x] Pertahankan login Manus OAuth dan tambahkan satu akun login lokal dengan username `admin`, tanpa email. Akun mendapat role Admin aplikasi (bukan role operasional biasa). Jangan gunakan password default `admin`; gunakan password kuat yang diberikan melalui kartu terlindungi, simpan hanya hash scrypt bersalt acak, batasi percobaan login secara persisten per akun, dan buat sesi melalui cookie aplikasi yang sama seperti OAuth.
- [x] Form login lokal meminta username dan password saja; backend tidak meminta atau mengandalkan alamat email. Jawaban untuk kredensial salah tidak mengungkap apakah username tersedia. Akun admin lokal tersimpan di database secara persisten dan proses bootstrap tidak menimpa password yang sudah ada.

## 2. Pool Designer 1–8, tiket wajib berpenanggung jawab, dan workload
- [x] Sediakan tepat delapan slot placeholder `Designer 1` sampai `Designer 8`; admin dapat memetakan label ke nama asli/akun dan mengaktifkan atau menonaktifkan slot tanpa mengubah riwayat tiket.
- [x] Saat SPV membuat tiket internal dari permintaan yang diterima, sistem mewajibkan pemilihan satu Designer penanggung jawab dari slot aktif 1–8. Sistem tidak menerbitkan atau menugaskan tiket bila Designer belum dipilih atau data minimum tiket/brief belum lengkap.
- [x] Dashboard SPV/Manager menampilkan workload per Designer berupa jumlah tiket aktif, belum mulai, sedang dikerjakan, menunggu pihak lain, revisi, dan overdue; setiap kategori membuka daftar tiket terkait. Designer hanya melihat workload miliknya. SPV dapat mengalihkan tiket aktif ke slot aktif lain saat menyeimbangkan beban, dengan riwayat perpindahan.
- [x] Tampilkan prioritas, target/estimasi selesai dan umur tiket agar SPV dapat membagi pekerjaan. Jangan menyebut jumlah tiket sebagai kapasitas jam kerja yang presisi; kapasitas berbasis effort/jam hanya tampil bila data kapasitas tersedia dan telah ditetapkan.

## 3. Intake permintaan, review gerbang, dan tiket internal
- [x] Marketing dapat mengirim Form Tiket Marketing terstruktur yang memvalidasi sumber permintaan, estimasi produksi, justifikasi bisnis, detail produk/desain, area target, referensi (link/foto/path bila ada), desain serupa, deadline dan prioritas. Alasan wajib bila Urgent; form tidak dapat dikirim jika field wajib kosong.
- [x] Permintaan Owner dapat dicatat oleh SPV/Manager. Manager dan SPV dapat meninjau kelengkapan, estimasi, prioritas, dan opsi reuse/recolor desain serupa.
- [x] Review permintaan menyediakan keputusan `Diterima`, `Perlu dilengkapi`, `Ditunda`, dan `Ditolak`; alasan wajib untuk selain Diterima. Hanya permintaan Diterima dapat menjadi tiket internal.
- [x] SPV membuat tiket internal bernomor format `DES-YYYY-XXX` sebelum Designer mulai bekerja, menyimpan peminta/sumber, brief, produk/ukuran, jumlah series, referensi, deadline, prioritas final, Designer penanggung jawab, dan target draft.
- [x] Hanya SPV yang meneruskan brief/penugasan resmi kepada Designer. Tiket menampilkan status proses, SLA, PIC tindakan berikutnya, riwayat aktivitas, dan file/versi terkait.

## 4. Job Status, progress, file/versi, revisi, dan persetujuan Owner
- [x] Designer melihat hanya tiket yang ditugaskan kepadanya dan dapat memperbarui Job Status tiketnya sendiri: `Belum mulai`, `Sedang dikerjakan`, `Menunggu feedback/keputusan`, `Revisi dikerjakan`, `Draft dikirim`, `Final dikirim`, `Terhambat`, dan `Selesai`. Untuk `Terhambat`, alasan dan tindak lanjut wajib dicatat.
- [x] Designer dapat menambahkan catatan progres dan estimasi tanggal selesai terbaru. Setiap pembaruan Job Status menyimpan pelaku dan waktu, terlihat pada tiket dan workload, serta tidak menggantikan status proses workflow.
- [x] Designer dapat mengunggah draft/final, menautkan file ke versi, menanggapi catatan revisi, dan mempertahankan versi lama. Unggahan memiliki validasi izin/ukuran/jenis dan catatan uploader/time.
- [x] SPV melakukan review dengan hasil `Lolos untuk diajukan` atau `Revisi`; catatan revisi ditautkan ke tiket/versi dan dikembalikan ke Designer.
- [x] Owner dapat memberi `ACC`, `ACC dengan catatan`, `Minta revisi`, atau `Tolak` atas versi yang diajukan; keputusan dan komentar menyimpan aktor/waktu dan tidak menghapus keputusan/file versi terdahulu. Revisi kembali ke Designer melalui SPV.

## 5. JOS-D, JOD, DG, QC, upload, dan penutupan arsip
- [x] Tindakan meminta JOS-D baru tersedia setelah keputusan Owner ACC yang memenuhi aturan; sistem menyimpan nomor/tanggal JOS-D.
- [x] Admin dapat mencatat nomor JOD dan status/tanggal Clipper secara manual. Designer mencatat finalisasi, nomor DG yang berasal dari JOS-D, series/product info serta file/folder final.
- [x] Checklist QC berisi 18 item dari workbook dan dikerjakan berurutan oleh SPV, QC Checker 1, lalu QC Checker 2. Setiap tahap menyimpan pemeriksa, tanggal, hasil `Lolos`/`Revisi`, hasil per item dan catatan. Catatan wajib pada butir gagal.
- [x] Tahap berikutnya terkunci sampai tahap sebelumnya lolos. Kegagalan QC mengembalikan tugas untuk revisi dan mempertahankan histori QC/versi lama. File final internal dapat disimpan sebagai versi untuk diperiksa QC; upload/path produksi hanya dapat dicatat setelah QC Checker 2 lolos.
- [x] Admin/SPV dapat mencatat path file final pada server `192.168.0.24`, nama/versi file, uploader, dan waktu; integrasi langsung server/Clipper tidak diasumsikan ada.
- [x] Admin menutup JOD/tiket hanya setelah status JOD selesai/closed dan arsip lengkap. Arsip tiket memuat form sumber (bila ada), brief, file final, ACC Owner, nomor JOS-D/JOD/DG, checklist QC, path produksi dan riwayat aktivitas. Tiket berstatus Closed tidak dapat dimutasi.

## 6. Dashboard, SLA, audit, dan penyajian
- [x] Dashboard menampilkan ringkasan permintaan baru, menunggu review, pekerjaan berjalan, menunggu Owner, menunggu QC, overdue, selesai dan daftar `Tindakan saya`. Halaman Daftar Tiket menyediakan filter status proses/Job Status/produk/prioritas/Designer/peminta/tanggal/SLA.
- [x] SLA tahapan mengikuti nilai di konsep (review permintaan maks. 0,5–1 hari; pembuatan tiket/brief maks. 0,5 hari; review SPV maks. 1 hari; Owner maks. 2 hari bergantung Owner; JOS-D/JOD/QC/upload maks. 0,5 hari; finalisasi maks. 1 hari). SLA dapat dikonfigurasi; aplikasi menandai mendekati/lewat target dan menampilkan waktu aktif berdasarkan perubahan tahap.
- [x] Audit log menyimpan aktor, aksi, perubahan nilai penting, tanggal/waktu; reassignment, keputusan, pembaruan status, QC, dan penutupan tidak menghapus histori.
- [x] Arah visual yang disetujui adalah Editorial production folio: latar ivory, tinta arang, deep process teal, vermilion untuk risiko; IBM Plex Sans untuk UI dan IBM Plex Mono untuk nomor/metadata; simbol jalur kerja/lembar produksi; layout navigasi vertikal dan tabel/timeline yang dapat dipindai.
- [x] Buat manifest statis `GET /manus-routes.json` yang valid dan lengkap sesuai route halaman, di direktori yang benar-benar disajikan oleh Vite.
- [x] Jangan memasukkan data seed/uji ke database proyek bersama dan jangan melakukan destructive reset. Jangan mengaktifkan auto-publish atau mengubah visibilitas proyek; sediakan Preview dan simpan checkpoint melalui remote kanonis setelah hasil siap.
