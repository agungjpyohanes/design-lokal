import { PROCESS_LABELS } from "../tickets/constants";

// Target maksimum awal per tahap, mengikuti nilai SLA pada workbook.
export const PROCESS_SLA_STATUSES = [
  "draft",
  "review_spv",
  "menunggu_acc_owner",
  "menunggu_josd",
  "menunggu_jod",
  "finalisasi",
  "qc_spv",
  "qc1",
  "qc2",
  "siap_upload",
  "uploaded",
] as const;

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

export const SLA_DEFAULT_HOURS: Record<SlaRuleKey, number> = {
  request_review: 24,
  ...PROCESS_SLA_HOURS,
};

export const SLA_RULE_LABELS: Record<SlaRuleKey, string> = {
  request_review: "Review permintaan",
  ...Object.fromEntries(
    PROCESS_SLA_STATUSES.map((status) => [status, PROCESS_LABELS[status]])
  ),
} as Record<SlaRuleKey, string>;
