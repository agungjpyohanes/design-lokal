import { X } from "lucide-react";
import { PROCESS_LABELS, PROCESS_SLA_HOURS, type ProcessStatus } from "@shared/workflow";

export function PageTitle({ kicker, title, subtitle, action }: { kicker: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="page-title-row"><div><p className="eyebrow">{kicker}</p><h1>{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>{action && <div className="page-title-action">{action}</div>}</div>;
}

export function StatusPill({ status }: { status: string }) {
  const label = PROCESS_LABELS[status as ProcessStatus] || status.replaceAll("_", " ");
  const kind = status.includes("revisi") || status === "ditolak_owner" ? "danger" : ["closed", "uploaded", "siap_upload", "acc_owner"].includes(status) ? "success" : status.startsWith("qc") ? "teal" : status.includes("menunggu") ? "amber" : "neutral";
  return <span className={`status-pill ${kind}`}><i />{label}</span>;
}

export function SlaPill({ status, processUpdatedAt, deadline, maxHours }: { status: string; processUpdatedAt?: string | Date | null; deadline?: string | Date | null; maxHours?: number }) {
  const now = Date.now();
  const stageHours = maxHours ?? PROCESS_SLA_HOURS[status as keyof typeof PROCESS_SLA_HOURS];
  const dueTimes: number[] = [];
  if (stageHours && processUpdatedAt) dueTimes.push(new Date(processUpdatedAt).getTime() + stageHours * 60 * 60 * 1000);
  if (deadline) { const date = new Date(deadline); date.setHours(23, 59, 59, 999); dueTimes.push(date.getTime()); }
  if (!dueTimes.length) return null;
  const remainingHours = Math.ceil((Math.min(...dueTimes) - now) / (60 * 60 * 1000));
  return <span className={`status-pill ${remainingHours < 0 ? "danger" : remainingHours <= 12 ? "amber" : "teal"}`}><i />{remainingHours < 0 ? `Lewat ${Math.abs(remainingHours)}j` : `SLA ${remainingHours}j`}</span>;
}

export function PriorityTag({ priority }: { priority?: string | null }) {
  const urgent = priority === "urgent";
  return <span className={`priority-tag ${urgent ? "urgent" : "normal"}`}>{urgent ? "URGENT" : "NORMAL"}</span>;
}

export function MetricCard({ label, value, detail, tone = "plain", icon }: { label: string; value: string | number; detail: string; tone?: string; icon?: React.ReactNode }) {
  return <div className={`metric-card ${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></div>;
}

export function EmptyState({ title, detail, icon }: { title: string; detail: string; icon?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{detail}</p></div>;
}

export function Modal({ title, detail, onClose, children, wide = false }: { title: string; detail?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-panel ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><div><p className="eyebrow">FORM WORKFLOW</p><h2>{title}</h2>{detail && <p>{detail}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Tutup"><X size={18} /></button></header><div className="modal-content">{children}</div></section></div>;
}

export function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatAge(value?: string | Date | null) {
  if (!value) return "—";
  const created = new Date(value).getTime();
  if (Number.isNaN(created)) return "—";
  const days = Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
  return days === 0 ? "Hari ini" : `${days} hari`;
}

export function nextActorLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "SPV Lokal", review_spv: "SPV Lokal", revisi: "Designer", revisi_owner: "Designer",
    menunggu_acc_owner: "Owner", acc_owner: "MPP", menunggu_josd: "MPP", menunggu_jod: "Admin operasional",
    finalisasi: "Designer", qc_spv: "SPV Lokal", qc1: "QC Checker 1", qc2: "QC Checker 2",
    revisi_qc: "Designer", siap_upload: "Admin / SPV", uploaded: "Admin operasional",
    menunggu_close: "Admin operasional", closed: "Selesai", ditolak_owner: "Ditolak Owner",
  };
  return labels[status] || "—";
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function initials(value?: string | null) {
  return (value || "?").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}
