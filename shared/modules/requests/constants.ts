export const GATE_DECISIONS = [
  "lanjut",
  "tunda",
  "tolak",
  "desain_existing",
] as const;

export type GateDecision = (typeof GATE_DECISIONS)[number];

export const GATE_DECISION_LABELS: Record<GateDecision, string> = {
  lanjut: "Lanjut (Siap Terbitkan Tiket)",
  tunda: "Tunda",
  tolak: "Tolak",
  desain_existing: "Arahkan ke Desain Existing",
};

export const REQUEST_STATUSES = [
  "baru_masuk",
  "lanjut",
  "tunda",
  "tolak",
  "desain_existing",
  "tiket_terbit",
  "diterima",
  "ditunda",
  "ditolak",
  "perlu_dilengkapi",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  baru_masuk: "Draft Internal / Baru Masuk",
  lanjut: "Lanjut (Siap Tiket)",
  tunda: "Ditunda",
  tolak: "Ditolak",
  desain_existing: "Arahkan ke Desain Existing",
  tiket_terbit: "Tiket Diterbitkan",
  diterima: "Lanjut (Diterima)",
  ditunda: "Ditunda",
  ditolak: "Ditolak",
  perlu_dilengkapi: "Perlu Dilengkapi",
};

export function isReadyForTicket(status?: string | null, gateDecision?: string | null): boolean {
  if (status === "tiket_terbit") return false;
  if (gateDecision === "lanjut") return true;
  return status === "lanjut" || status === "diterima";
}
