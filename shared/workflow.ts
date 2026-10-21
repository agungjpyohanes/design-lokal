export const PROCESS_STATUSES = [
  "draft",
  "review_spv",
  "revisi",
  "menunggu_acc_owner",
  "revisi_owner",
  "acc_owner",
  "ditolak_owner",
  "menunggu_josd",
  "menunggu_jod",
  "finalisasi",
  "qc_spv",
  "qc1",
  "qc2",
  "revisi_qc",
  "siap_upload",
  "uploaded",
  "menunggu_close",
  "closed",
] as const;
export type ProcessStatus = (typeof PROCESS_STATUSES)[number];

export const PROCESS_LABELS: Record<ProcessStatus, string> = {
  draft: "Draft",
  review_spv: "Review SPV",
  revisi: "Revisi desain",
  menunggu_acc_owner: "Menunggu ACC Owner",
  revisi_owner: "Revisi Owner",
  acc_owner: "ACC Owner",
  ditolak_owner: "Ditolak Owner",
  menunggu_josd: "Menunggu JOS-D",
  menunggu_jod: "Menunggu JOD",
  finalisasi: "Finalisasi",
  qc_spv: "QC SPV",
  qc1: "QC Checker 1",
  qc2: "QC Checker 2",
  revisi_qc: "Revisi QC",
  siap_upload: "Siap upload",
  uploaded: "Uploaded",
  menunggu_close: "Menunggu penutupan JOD/tiket",
  closed: "Closed",
};

// Target maksimum awal per tahap, mengikuti nilai SLA pada workbook.
export const PROCESS_SLA_STATUSES = ["draft", "review_spv", "menunggu_acc_owner", "menunggu_josd", "menunggu_jod", "finalisasi", "qc_spv", "qc1", "qc2", "siap_upload", "uploaded"] as const;
export type ProcessSlaStatus = (typeof PROCESS_SLA_STATUSES)[number];
export const PROCESS_SLA_HOURS: Record<ProcessSlaStatus, number> = {
  draft: 12,
  review_spv: 24,
  menunggu_acc_owner: 48,
  menunggu_josd: 12,
  menunggu_jod: 12,
  finalisasi: 24,
  qc_spv: 12,
  qc1: 12,
  qc2: 12,
  siap_upload: 12,
  uploaded: 12,
};
export const SLA_RULE_KEYS = ["request_review", ...PROCESS_SLA_STATUSES] as const;
export type SlaRuleKey = (typeof SLA_RULE_KEYS)[number];
export const SLA_DEFAULT_HOURS: Record<SlaRuleKey, number> = { request_review: 24, ...PROCESS_SLA_HOURS };
export const SLA_RULE_LABELS: Record<SlaRuleKey, string> = { request_review: "Review permintaan", ...Object.fromEntries(PROCESS_SLA_STATUSES.map(status => [status, PROCESS_LABELS[status]])) } as Record<SlaRuleKey, string>;

export const JOB_STATUSES = [
  "Belum mulai",
  "Sedang dikerjakan",
  "Menunggu feedback/keputusan",
  "Revisi dikerjakan",
  "Draft dikirim",
  "Final dikirim",
  "Terhambat",
  "Selesai",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const REQUEST_STATUSES = ["baru_masuk", "perlu_dilengkapi", "ditunda", "ditolak", "diterima"] as const;

export const APP_ROLE_LABELS: Record<string, string> = {
  unassigned: "Belum diberi akses",
  marketing: "Marketing",
  owner: "Owner",
  manager: "Manager",
  spv: "SPV Lokal",
  designer: "Designer",
  mpp: "MPP",
  admin: "Admin operasional",
  superadmin: "Administrator aplikasi",
  qc1: "QC Checker 1",
  qc2: "QC Checker 2",
};

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

export const APP_ROLE_VALUES = ["unassigned", "marketing", "owner", "manager", "spv", "designer", "mpp", "admin", "superadmin", "qc1", "qc2"] as const;
export type AppRoleValue = (typeof APP_ROLE_VALUES)[number];
export const ROLES = ["marketing", "owner", "manager", "spv", "designer", "mpp", "admin", "qc1", "qc2"] as const;

export function canSeeAllTickets(role: string) {
  return ["owner", "manager", "spv", "admin", "mpp", "qc1", "qc2"].includes(role);
}
