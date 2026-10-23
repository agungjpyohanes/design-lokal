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

export const JOB_STATUSES = [
  "Belum mulai",
  "Sedang dikerjakan",
  "Menunggu feedback",
  "Menunggu feedback/keputusan",
  "Revisi dikerjakan",
  "Draft dikirim",
  "Final dikirim",
  "Terhambat",
  "Selesai",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
