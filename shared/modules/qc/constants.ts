export const QC_STAGES = ["spv", "qc1", "qc2"] as const;
export type QCStage = (typeof QC_STAGES)[number];

export const QC_ITEMS = [
  "Desain sesuai dengan Brief & permintaan awal",
  "Desain sesuai dengan ACC Owner (jika sudah ACC)",
  "Ukuran sesuai template / spesifikasi produk",
  "Layout rapi, proporsional, dan tidak berantakan",
  "Warna & elemen visual sesuai yang diminta",
  "Series design lengkap (jika ada lebih dari 1 desain)",
  "Product info sudah diisi dengan benar",
  "Nomor DG sudah terpasang di file / folder",
  "Nama folder & file sesuai standar penamaan",
  "Tidak ada elemen yang tertinggal / hilang",
  "Resolusi file cukup untuk produksi",
  "Format file sesuai standar (sesuai jenis produk)",
  "Tidak ada overlapping / elemen yang bertabrakan",
  "Margin / bleed sudah sesuai (jika diperlukan)",
  "File siap untuk masuk mesin produksi",
  "Semua catatan revisi sebelumnya sudah ditindaklanjuti",
  "Softfile sudah berada di path / folder yang benar",
  "Tidak ada file sampah / versi lama yang tertinggal",
] as const;

export type QCItem = (typeof QC_ITEMS)[number];
