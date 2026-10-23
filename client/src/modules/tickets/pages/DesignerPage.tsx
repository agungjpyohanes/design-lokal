import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowUpRight,
  Clock3,
  Sparkles,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Download,
  History,
  FileCode,
  Filter,
  Eye,
  Send,
  MessageSquare,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  MetricCard,
  Modal,
  PageTitle,
  PriorityTag,
  StatusPill,
  FormField,
  formatDate,
} from "@/modules/common/components/WorkflowUI";
import { JOB_STATUSES, type JobStatus } from "@shared/workflow";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return "0 B";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDateTime(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const JOB_STATUS_COLORS: Record<string, string> = {
  "Belum mulai": "neutral",
  "Sedang dikerjakan": "teal",
  "Menunggu feedback": "amber",
  "Menunggu feedback/keputusan": "amber",
  "Revisi dikerjakan": "purple",
  "Draft dikirim": "teal",
  "Final dikirim": "success",
  "Terhambat": "danger",
  "Selesai": "success",
};

export function DesignerPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const query = trpc.workflow.tickets.mine.useQuery();
  const slotsQuery = trpc.workflow.settings.designerSlots.useQuery();

  const updateStatus = trpc.workflow.tickets.updateJobStatus.useMutation({
    onSuccess: async () => {
      toast.success("Job status & catatan progres berhasil diperbarui.");
      setStatusModalTicket(null);
      await utils.workflow.tickets.mine.invalidate();
      await utils.workflow.tickets.list.invalidate();
      await utils.workflow.dashboard.invalidate();
    },
  });

  const uploadFileMutation = trpc.workflow.tickets.uploadFile.useMutation({
    onSuccess: async (data) => {
      toast.success(`Berkas ${data.fileName} (v${data.versionNo}) berhasil diunggah.`);
      setUploadModalTicket(null);
      await utils.workflow.tickets.mine.invalidate();
      await utils.workflow.tickets.list.invalidate();
      await utils.workflow.dashboard.invalidate();
    },
  });

  // Modal states
  const [selectedBriefTicket, setSelectedBriefTicket] = useState<any>(null);
  const [statusModalTicket, setStatusModalTicket] = useState<any>(null);
  const [uploadModalTicket, setUploadModalTicket] = useState<any>(null);
  const [historyModalTicket, setHistoryModalTicket] = useState<any>(null);

  // Filters
  const [slotFilter, setSlotFilter] = useState<string>("all");
  const [jobStatusFilter, setJobStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [error, setError] = useState<string>("");

  const rawRows = query.data || [];

  const rows = useMemo(() => {
    return rawRows.filter((ticket) => {
      const queryText =
        `${ticket.ticketNo} ${ticket.request.productType} ${ticket.brief} ${ticket.designerLabel} ${ticket.jobStatus}`.toLowerCase();
      const matchSearch = queryText.includes(search.toLowerCase());
      const matchSlot = slotFilter === "all" || ticket.designerSlot?.slotNumber === Number(slotFilter);
      const matchStatus = jobStatusFilter === "all" || ticket.jobStatus === jobStatusFilter;
      return matchSearch && matchSlot && matchStatus;
    });
  }, [rawRows, search, slotFilter, jobStatusFilter]);

  const activeCount = rawRows.filter(
    (ticket) => ticket.jobStatus === "Sedang dikerjakan" || ticket.jobStatus === "Revisi dikerjakan"
  ).length;
  const queuedCount = rawRows.filter((ticket) => ticket.jobStatus === "Belum mulai").length;
  const waitingFeedbackCount = rawRows.filter(
    (ticket) => ticket.jobStatus === "Menunggu feedback" || ticket.jobStatus === "Menunggu feedback/keputusan"
  ).length;
  const blockedCount = rawRows.filter((ticket) => ticket.jobStatus === "Terhambat").length;
  const completedCount = rawRows.filter(
    (ticket) => ticket.jobStatus === "Selesai" || ticket.processStatus === "closed"
  ).length;

  const handleStatusSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const status = String(data.get("status")) as JobStatus;
      const note = String(data.get("note") || "").trim();
      const eta = String(data.get("eta") || "").trim();

      if (status === "Terhambat" && !note) {
        throw new Error("Wajib mencatat rincian hambatan/kendala saat memilih status Terhambat.");
      }

      await updateStatus.mutateAsync({
        ticketId: statusModalTicket.id,
        status,
        note: note || undefined,
        eta: eta || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui status.");
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const file = data.get("file");
      if (!(file instanceof File) || file.size === 0) {
        throw new Error("Pilih berkas desain yang akan diunggah.");
      }
      if (file.size > 12 * 1024 * 1024) {
        throw new Error("Ukuran berkas maksimal 12 MB.");
      }

      const fileType = String(data.get("fileType")) as "draft" | "final" | "referensi";
      const note = String(data.get("note") || "").trim();

      await uploadFileMutation.mutateAsync({
        ticketId: uploadModalTicket.id,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        fileType,
        note: note || undefined,
        dataBase64: await fileToBase64(file),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah berkas.");
    }
  };

  return (
    <>
      <PageTitle
        kicker="DESIGNER WORKSPACE · OPERASIONAL"
        title="Workspace Designer"
        subtitle="Kelola tiket penugasan, instruksi brief resmi SPV, pembaruan 8 Job Status, serta pengunggahan dan riwayat versi berkas."
      />

      {/* METRIC CARDS */}
      <section className="stats-row" style={{ marginBottom: 20 }}>
        <MetricCard
          label="Dalam Pengerjaan"
          value={activeCount}
          detail="Sedang dikerjakan / revisi"
          tone="teal"
          icon={<Sparkles size={15} />}
        />
        <MetricCard
          label="Belum Mulai"
          value={queuedCount}
          detail="Antrean tiket baru"
          tone="plain"
          icon={<Clock3 size={15} />}
        />
        <MetricCard
          label="Menunggu Feedback"
          value={waitingFeedbackCount}
          detail="Review SPV / Owner"
          tone="amber"
          icon={<MessageSquare size={15} />}
        />
        <MetricCard
          label="Terhambat"
          value={blockedCount}
          detail="Perlu eskalasi SPV"
          tone="danger"
          icon={<AlertTriangle size={15} />}
        />
        <MetricCard
          label="Selesai"
          value={completedCount}
          detail="Telah final / closed"
          tone="success"
          icon={<CheckCircle2 size={15} />}
        />
      </section>

      {/* FILTER & TOOLBAR */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {/* SEARCH */}
          <div className="search-input" style={{ flex: "1 1 240px", display: "flex", alignItems: "center", gap: 8 }}>
            <Filter size={14} color="#8c948b" />
            <input
              className="text-input"
              style={{ border: 0, minHeight: 25, padding: 0, background: "transparent" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari tiket, produk, atau kata kunci brief SPV…"
            />
          </div>

          {/* FILTER SLOT DESIGNER 1-8 */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)" }}>SLOT:</span>
            <select
              className="select-input"
              style={{ minHeight: 32, fontSize: 12, padding: "4px 8px" }}
              value={slotFilter}
              onChange={(e) => setSlotFilter(e.target.value)}
            >
              <option value="all">Semua Slot (1–8)</option>
              {(slotsQuery.data || [])
                .filter((s) => s.slotNumber >= 1 && s.slotNumber <= 8)
                .map((s) => (
                  <option key={s.id} value={s.slotNumber}>
                    Slot {s.slotNumber}: {s.displayName || s.label}
                  </option>
                ))}
            </select>
          </div>

          {/* FILTER JOB STATUS */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)" }}>STATUS:</span>
            <select
              className="select-input"
              style={{ minHeight: 32, fontSize: 12, padding: "4px 8px" }}
              value={jobStatusFilter}
              onChange={(e) => setJobStatusFilter(e.target.value)}
            >
              <option value="all">Semua Job Status</option>
              {JOB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <span className="section-kicker" style={{ marginLeft: "auto" }}>
            {rows.length} TIKET DITUGASKAN
          </span>
        </div>

        {/* TIKET TABLE */}
        {query.isLoading ? (
          <div className="loading-block">Memuat penugasan Designer…</div>
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>No. Tiket</th>
                  <th>Produk & Peminta</th>
                  <th>Brief Resmi SPV</th>
                  <th>Job Status Desainer</th>
                  <th>Target & SLA</th>
                  <th>Berkas & Versi</th>
                  <th>Aksi Kerja</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ticket) => {
                  const filesCount = ticket.files?.length || 0;
                  const latestFile = ticket.files?.[0];
                  const colorClass = JOB_STATUS_COLORS[ticket.jobStatus] || "neutral";

                  return (
                    <tr key={ticket.id}>
                      {/* TICKET NO */}
                      <td>
                        <Link href={`/tickets/${ticket.id}`} className="ticket-link">
                          {ticket.ticketNo}
                        </Link>
                        <span className="cell-sub" style={{ fontWeight: 600, color: "#0f766e" }}>
                          {ticket.designerLabel}
                        </span>
                        <StatusPill status={ticket.processStatus} />
                      </td>

                      {/* PRODUK */}
                      <td>
                        <span className="cell-main">{ticket.request?.productType || "Desain"}</span>
                        <span className="cell-sub">
                          {ticket.request?.requesterName} ({ticket.request?.source})
                        </span>
                        <PriorityTag priority={ticket.request?.finalPriority || ticket.request?.requestedPriority} />
                      </td>

                      {/* BRIEF RESMI */}
                      <td style={{ maxWidth: 280 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--foreground)",
                            lineHeight: 1.35,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {ticket.brief}
                        </div>
                        <button
                          type="button"
                          className="button-quiet button-small"
                          style={{ padding: "2px 0", fontSize: 11, color: "var(--primary, #059669)", fontWeight: 600 }}
                          onClick={() => setSelectedBriefTicket(ticket)}
                        >
                          <Eye size={12} style={{ marginRight: 4 }} /> Baca Brief Lengkap
                        </button>
                      </td>

                      {/* JOB STATUS */}
                      <td>
                        <span className={`status-pill ${colorClass}`}>
                          <i /> {ticket.jobStatus}
                        </span>
                        {ticket.jobNote && (
                          <span
                            className="cell-sub"
                            style={{
                              maxWidth: 180,
                              whiteSpace: "normal",
                              lineHeight: 1.25,
                              marginTop: 4,
                              display: "block",
                            }}
                          >
                            Catatan: {ticket.jobNote}
                          </span>
                        )}
                      </td>

                      {/* TARGET */}
                      <td>
                        <span className="cell-main">{formatDate(ticket.eta || ticket.deadline)}</span>
                        {ticket.eta && <span className="cell-sub">ETA: {formatDate(ticket.eta)}</span>}
                      </td>

                      {/* BERKAS & VERSI */}
                      <td>
                        {filesCount > 0 ? (
                          <div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>
                              {filesCount} Berkas Terunggah
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  background: latestFile?.fileType === "final" ? "#dcfce7" : "#e0f2fe",
                                  color: latestFile?.fileType === "final" ? "#166534" : "#0369a1",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                  fontWeight: 600,
                                }}
                              >
                                {latestFile?.fileType.toUpperCase()} v{latestFile?.versionNo}
                              </span>
                              <button
                                type="button"
                                className="button-quiet button-small"
                                style={{ padding: 0, fontSize: 11 }}
                                onClick={() => setHistoryModalTicket(ticket)}
                                title="Lihat semua riwayat versi"
                              >
                                <History size={12} style={{ marginRight: 2 }} /> Riwayat
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="cell-sub">Belum ada berkas</span>
                        )}
                      </td>

                      {/* AKSI KERJA */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 120 }}>
                          <Button
                            size="sm"
                            className="button-secondary button-small"
                            onClick={() => {
                              setError("");
                              setStatusModalTicket(ticket);
                            }}
                          >
                            <Send size={12} style={{ marginRight: 4 }} /> Ubah Status
                          </Button>
                          <Button
                            size="sm"
                            className="button-primary button-small"
                            onClick={() => {
                              setError("");
                              setUploadModalTicket(ticket);
                            }}
                          >
                            <Upload size={12} style={{ marginRight: 4 }} /> Unggah File
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Tidak ada penugasan tiket yang cocok"
            detail="Tiket yang ditugaskan oleh SPV kepada slot Designer 1–8 akan tampil pada Workspace ini."
            icon={<Sparkles size={22} />}
          />
        )}
      </div>

      {/* ================= MODAL BRIEF RESMI SPV ================= */}
      {selectedBriefTicket && (
        <Modal
          title={`Brief Resmi SPV · ${selectedBriefTicket.ticketNo}`}
          detail={`${selectedBriefTicket.request?.productType} (${selectedBriefTicket.designerLabel})`}
          onClose={() => setSelectedBriefTicket(null)}
          wide
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "rgba(5, 150, 105, 0.05)",
                border: "1px solid #bbf7d0",
                padding: "12px 16px",
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#166534", marginBottom: 6 }}>
                <FileText size={16} />
                <strong>ARAHAN KERJA & INSTRUKSI RESMI DARI SPV</strong>
              </div>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "#1e293b",
                  whiteSpace: "pre-wrap",
                  background: "#ffffff",
                  padding: 12,
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                }}
              >
                {selectedBriefTicket.brief}
              </p>
            </div>

            <div className="form-grid" style={{ gap: 12 }}>
              <div className="detail-card" style={{ padding: 12 }}>
                <span className="cell-sub">PRODUK & UKURAN</span>
                <strong style={{ display: "block", marginTop: 2 }}>
                  {selectedBriefTicket.request?.productType} · {selectedBriefTicket.request?.sizeSpec || "Standar"}
                </strong>
                <small style={{ color: "var(--muted-foreground)" }}>
                  {selectedBriefTicket.request?.seriesCount} varian / series
                </small>
              </div>

              <div className="detail-card" style={{ padding: 12 }}>
                <span className="cell-sub">TEMA VISUAL ACUAN</span>
                <strong style={{ display: "block", marginTop: 2 }}>
                  {selectedBriefTicket.request?.theme || "Sesuai brief resmi"}
                </strong>
                <small style={{ color: "var(--muted-foreground)" }}>
                  Estimasi Produksi: {selectedBriefTicket.request?.productionEstimate || "—"}
                </small>
              </div>
            </div>

            {selectedBriefTicket.request?.referenceLink && (
              <div style={{ fontSize: 13 }}>
                <strong>Tautan / Path Referensi:</strong>{" "}
                <a
                  href={selectedBriefTicket.request.referenceLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#059669", textDecoration: "underline" }}
                >
                  {selectedBriefTicket.request.referenceLink}
                </a>
              </div>
            )}

            <div className="modal-actions" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <Button variant="outline" onClick={() => setSelectedBriefTicket(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= MODAL UPDATE JOB STATUS ================= */}
      {statusModalTicket && (
        <Modal
          title={`Pembaruan Job Status · ${statusModalTicket.ticketNo}`}
          detail={`${statusModalTicket.request?.productType} · ${statusModalTicket.designerLabel}`}
          onClose={() => {
            setStatusModalTicket(null);
            setError("");
          }}
        >
          <form onSubmit={handleStatusSubmit} className="form-grid">
            <FormField label="Pilih Job Status (8 Pilihan Lengkap) *">
              <select name="status" className="select-input" defaultValue={statusModalTicket.jobStatus} required>
                {JOB_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <small style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                Pilih status yang paling mencerminkan kondisi pengerjaan saat ini.
              </small>
            </FormField>

            <FormField label="Target Estimasi Selesai (ETA)">
              <input
                name="eta"
                type="date"
                className="text-input"
                defaultValue={
                  statusModalTicket.eta ? new Date(statusModalTicket.eta).toISOString().split("T")[0] : ""
                }
              />
            </FormField>

            <div className="form-span-2">
              <FormField
                label="Catatan Progres / Kendala / Keterangan Hambatan"
                hint="Wajib jika memilih status Terhambat"
              >
                <textarea
                  name="note"
                  className="text-area"
                  rows={3}
                  defaultValue={statusModalTicket.jobNote || ""}
                  placeholder="Jelaskan progres yang sedang dikerjakan atau kendala yang memerlukan feedback SPV/Owner..."
                />
              </FormField>
            </div>

            {error && <div className="form-error form-span-2">{error}</div>}

            <div className="modal-actions form-span-2">
              <Button type="button" variant="outline" onClick={() => setStatusModalTicket(null)}>
                Batal
              </Button>
              <Button type="submit" className="button-primary" disabled={updateStatus.isPending}>
                {updateStatus.isPending ? "Menyimpan…" : "Simpan Status & Progres"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= MODAL UNGGAH FILE & CATATAN PROGRES ================= */}
      {uploadModalTicket && (
        <Modal
          title={`Unggah Berkas Desain · ${uploadModalTicket.ticketNo}`}
          detail={`${uploadModalTicket.request?.productType} (${uploadModalTicket.designerLabel}) · Versi baru dicatat otomatis`}
          onClose={() => {
            setUploadModalTicket(null);
            setError("");
          }}
          wide
        >
          <form onSubmit={handleUploadSubmit} className="form-grid">
            <FormField label="Jenis Berkas *">
              <select name="fileType" className="select-input" required defaultValue="draft">
                <option value="draft">Draft Desain (Untuk Review SPV & ACC Owner)</option>
                <option value="final">Final Press-Ready (Siap Quality Control / Cetak)</option>
                <option value="referensi">Referensi Tambahan Desainer</option>
              </select>
            </FormField>

            <FormField label="Pilih Berkas Desain (PDF/PNG/JPG/ZIP) *">
              <input
                name="file"
                type="file"
                className="text-input"
                required
                accept=".pdf,.png,.jpg,.jpeg,.zip,.ai,.psd"
              />
              <small style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                Maksimal ukuran 12 MB per berkas.
              </small>
            </FormField>

            <div className="form-span-2">
              <FormField
                label="Catatan Progres / Keterangan Revisi Versi Ini"
                hint="Tercatat permanen dalam riwayat versi berkas"
              >
                <textarea
                  name="note"
                  className="text-area"
                  rows={3}
                  placeholder="Jelaskan perubahan pada versi ini, elemen yang diperbaiki, atau instruksi khusus untuk tim review SPV/QC..."
                />
              </FormField>
            </div>

            {error && <div className="form-error form-span-2">{error}</div>}

            <div className="modal-actions form-span-2">
              <Button type="button" variant="outline" onClick={() => setUploadModalTicket(null)}>
                Batal
              </Button>
              <Button type="submit" className="button-primary" disabled={uploadFileMutation.isPending}>
                {uploadFileMutation.isPending ? "Mengunggah…" : "Unggah & Simpan Versi"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= MODAL RIWAYAT VERSI BERKAS ================= */}
      {historyModalTicket && (
        <Modal
          title={`Riwayat Versi Berkas · ${historyModalTicket.ticketNo}`}
          detail={`${historyModalTicket.request?.productType} · Total ${historyModalTicket.files?.length || 0} berkas tersimpan tanpa tertimpa`}
          onClose={() => setHistoryModalTicket(null)}
          wide
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {historyModalTicket.files && historyModalTicket.files.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Versi</th>
                      <th>Tipe</th>
                      <th>Nama Berkas & Ukuran</th>
                      <th>Catatan Versi / Progres</th>
                      <th>Tanggal & Waktu Unggah</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyModalTicket.files.map((file: any) => (
                      <tr key={file.id}>
                        <td>
                          <span
                            style={{
                              background: "#0f766e",
                              color: "#ffffff",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            v{file.versionNo}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              color: file.fileType === "final" ? "#166534" : "#0369a1",
                            }}
                          >
                            {file.fileType}
                          </span>
                        </td>
                        <td>
                          <strong style={{ display: "block", fontSize: 13, color: "var(--foreground)" }}>
                            {file.fileName}
                          </strong>
                          <small style={{ color: "var(--muted-foreground)" }}>{formatBytes(file.fileSize)}</small>
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          <span style={{ fontSize: 12, color: "#334155" }}>
                            {file.note || <em style={{ color: "#94a3b8" }}>Tanpa catatan</em>}
                          </span>
                        </td>
                        <td>
                          <small style={{ color: "#64748b" }}>{formatDateTime(file.createdAt)}</small>
                        </td>
                        <td>
                          <a
                            className="button-secondary button-small"
                            href={file.downloadUrl || "#"}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            <Download size={12} /> Unduh
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Belum ada riwayat berkas"
                detail="Gunakan tombol 'Unggah File' untuk mengunggah draft atau berkas final."
                icon={<FileCode size={22} />}
              />
            )}

            <div className="modal-actions" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <Button variant="outline" onClick={() => setHistoryModalTicket(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default DesignerPage;