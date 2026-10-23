export const ACC_SESSION_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type AccSessionStatus = (typeof ACC_SESSION_STATUSES)[number];

export const ACC_SESSION_STATUS_LABELS: Record<AccSessionStatus, string> = {
  scheduled: "Terjadwal",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const ACC_DECISION_TYPES = ["pending", "acc", "acc_catatan", "revisi", "tolak"] as const;
export type AccDecisionType = (typeof ACC_DECISION_TYPES)[number];

export const ACC_DECISION_LABELS: Record<AccDecisionType, string> = {
  pending: "Menunggu Review",
  acc: "ACC",
  acc_catatan: "ACC + Catatan",
  revisi: "Minta Revisi",
  tolak: "Ditolak",
};

export function isValidAccSessionNo(sessionNo: string): boolean {
  return /^ACC-\d{4}-(0[1-9]|1[0-2])$/.test(sessionNo.trim());
}

export function formatMonthToAccSessionNo(year: number, month: number): string {
  const m = String(month).padStart(2, "0");
  return `ACC-${year}-${m}`;
}
