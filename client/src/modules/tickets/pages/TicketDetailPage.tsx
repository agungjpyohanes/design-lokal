import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  Download,
  FilePlus2,
  Lock,
  Server,
  Unlock,
  X,
  XCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { JOB_STATUSES, QC_ITEMS, type QCStage } from "@shared/workflow";
import {
  EmptyState,
  FormField,
  PageTitle,
  PriorityTag,
  SlaPill,
  StatusPill,
  formatDate,
  formatDateTime,
} from "@/modules/common/components/WorkflowUI";
import { Button } from "@/components/ui/button";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
    reader.readAsDataURL(file);
  });
}

export function TicketDetailPage() {
  const [, params] = useRoute("/tickets/:id");
  const ticketId = Number(params?.id);
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const query = trpc.workflow.tickets.detail.useQuery(
    { id: ticketId },
    { enabled: Number.isInteger(ticketId) && ticketId > 0 }
  );
  const designerSlotsQuery = trpc.workflow.settings.designerSlots.useQuery(undefined, {
    enabled: user?.appRole === "spv",
  });
  const [jobStatus, setJobStatus] = useState("");
  const [jobNote, setJobNote] = useState("");
  const [eta, setEta] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [qcAnswers, setQcAnswers] = useState<Record<number, { passed: boolean; note: string }>>({});
  const [qcSummary, setQcSummary] = useState("");
  const [serverPath, setServerPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");

  // Penutupan modal darurat via tombol Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isEmergencyModalOpen) {
        setIsEmergencyModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEmergencyModalOpen]);
  const ticket = query.data;
  const role = user?.appRole || "";
  const invalidate = async () => {
    await Promise.all([
      utils.workflow.tickets.detail.invalidate({ id: ticketId }),
      utils.workflow.tickets.list.invalidate(),
      utils.workflow.dashboard.invalidate(),
    ]);
  };
  const reassignDesigner = trpc.workflow.tickets.reassignDesigner.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.unchanged
          ? "Designer tersebut sudah menjadi penanggung jawab."
          : "Penugasan Designer diperbarui."
      );
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateJob = trpc.workflow.tickets.updateJobStatus.useMutation({
    onSuccess: async () => {
      toast.success("Job Status diperbarui.");
      setJobNote("");
      await invalidate();
    },
  });
  const reviewSpv = trpc.workflow.tickets.spvReview.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.next === "menunggu_acc_owner"
          ? "Review SPV lolos; tiket diajukan ke Owner."
          : "Revisi SPV dikirim ke Designer."
      );
      setReviewNote("");
      await invalidate();
    },
  });
  const ownerDecision = trpc.workflow.tickets.ownerDecision.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.next === "menunggu_josd"
          ? "ACC Owner dicatat; JOS-D dapat diproses."
          : "Keputusan Owner dicatat."
      );
      setReviewNote("");
      await invalidate();
    },
  });
  const requestJosdMutation = trpc.workflow.tickets.requestJosd.useMutation({
    onSuccess: async (result) => {
      toast.success(`Nomor ${result.josdNo} berhasil diterbitkan.`);
      setIsEmergencyModalOpen(false);
      setEmergencyReason("");
      await invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Gagal menerbitkan nomor JOS-D.");
    },
  });
  const updateIds = trpc.workflow.tickets.updateOperationalIds.useMutation({
    onSuccess: async () => {
      toast.success("Nomor proses diperbarui.");
      await invalidate();
    },
  });
  const submitQc = trpc.workflow.tickets.submitQc.useMutation({
    onSuccess: async (result) => {
      toast.success(`Hasil QC tersimpan. Tahap berikutnya: ${result.next.replaceAll("_", " ")}.`);
      setQcAnswers({});
      setQcSummary("");
      await invalidate();
    },
  });
  const upload = trpc.workflow.tickets.uploadFile.useMutation({
    onSuccess: async (result) => {
      toast.success(`${result.fileName} berhasil diunggah sebagai v${result.versionNo}.`);
      await invalidate();
    },
  });
  const uploadPath = trpc.workflow.tickets.registerServerUpload.useMutation({
    onSuccess: async () => {
      toast.success("Path upload produksi dicatat.");
      await invalidate();
    },
  });
  const close = trpc.workflow.tickets.close.useMutation({
    onSuccess: async () => {
      toast.success("JOD dan tiket ditutup.");
      await invalidate();
    },
  });

  const isSuper = role === "superadmin" || user?.isSuperAdmin;
  const qcStage =
    ticket?.processStatus === "qc_spv"
      ? "spv"
      : ticket?.processStatus === "qc1"
        ? "qc1"
        : ticket?.processStatus === "qc2"
          ? "qc2"
          : null;
  const canRunQc =
    qcStage &&
    (qcStage === "spv"
      ? role === "spv" || isSuper || role === "admin"
      : role === qcStage || isSuper || role === "admin" || role === "spv");
  const allowedReviewer = role === "spv" || isSuper || role === "manager" || role === "admin";
  const canSimulateOwner = role === "owner" || isSuper || role === "spv" || role === "admin" || role === "manager";
  const canJob = (role === "designer" && ticket?.designerSlot.userId === user?.id) || isSuper || role === "admin";
  const currentIds = ticket?.operationalIds;
  const isPending = query.isLoading;

  const spvReview = ticket?.qcReviews.find((r: any) => r.stage === "spv");
  const qc1Review = ticket?.qcReviews.find((r: any) => r.stage === "qc1");
  const qc2Review = ticket?.qcReviews.find((r: any) => r.stage === "qc2");

  const isSpvPassed =
    spvReview?.result === "lolos" ||
    ["qc1", "qc2", "siap_upload", "uploaded", "menunggu_close", "closed"].includes(
      ticket?.processStatus || ""
    );
  const isQc1Passed =
    qc1Review?.result === "lolos" ||
    ["qc2", "siap_upload", "uploaded", "menunggu_close", "closed"].includes(
      ticket?.processStatus || ""
    );
  const isQc2Passed =
    qc2Review?.result === "lolos" ||
    ["siap_upload", "uploaded", "menunggu_close", "closed"].includes(
      ticket?.processStatus || ""
    );

  const isServerUnlocked = isQc2Passed;
  const isServerUploaded = Boolean(currentIds?.serverPath && currentIds.serverPath.trim().length > 0);
  const isJodFilled = Boolean(currentIds?.jodNo && currentIds.jodNo.trim().length > 0);
  const isJodClosed = currentIds?.jodStatus === "closed";
  const isClosed = ticket?.processStatus === "closed";
  const isReadyToClose = isQc2Passed && isServerUploaded && isJodFilled;

  const [spvChecklist, setSpvChecklist] = useState({
    themeAndBrief: true,
    dimensionBleed: true,
    bleed3mm: true,
    typographyEmbed: true,
    cmykResolution: true,
  });

  if (!Number.isInteger(ticketId) || ticketId <= 0)
    return <div className="form-error">Nomor tiket tidak valid.</div>;
  if (isPending) return <div className="loading-block">Memuat detail tiket…</div>;
  if (query.error || !ticket)
    return (
      <>
        <Link href="/tickets" className="button-quiet">
          <ArrowLeft size={14} /> Kembali ke tiket
        </Link>
        <div className="form-error" style={{ marginTop: 15 }}>
          {query.error?.message || "Tiket tidak ditemukan."}
        </div>
      </>
    );

  const handleUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    fileType: "draft" | "final" | "referensi"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Ukuran maksimum file adalah 8 MB.");
      event.target.value = "";
      return;
    }
    setBusy(true);
    try {
      await upload.mutateAsync({
        ticketId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        fileType,
        dataBase64: await fileToBase64(file),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload gagal.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  const handleQuickPassAll = () => {
    const nextAnswers: Record<number, { passed: boolean; note: string }> = {};
    QC_ITEMS.forEach((_, idx) => {
      nextAnswers[idx + 1] = { passed: true, note: "" };
    });
    setQcAnswers(nextAnswers);
    toast.success("Semua butir checklist QC dicentang Lolos.");
  };

  const handleQuickReset = () => {
    setQcAnswers({});
    toast.info("Checklist QC direset.");
  };

  const submitQC = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!qcStage) return;

    const items = QC_ITEMS.map((_, index) => ({
      id: index + 1,
      passed: qcAnswers[index + 1]?.passed ?? false,
      note: qcAnswers[index + 1]?.note || undefined,
    }));
    const failed = items.filter((item) => !item.passed);
    const hasNotes = items.some((item) => !item.passed && (item.note || "").trim().length > 0);
    const hasSummary = (qcSummary || "").trim().length > 0;

    if (failed.length > 0 && !hasNotes && !hasSummary) {
      toast.error("Wajib mengisi catatan pada butir yang tidak lolos atau kolom ringkasan revisi.");
      return;
    }

    submitQc.mutate({
      ticketId,
      stage: qcStage as QCStage,
      result: failed.length ? "revisi" : "lolos",
      items,
      summary: qcSummary || undefined,
    });
  };

  const submitIds = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const status = String(data.get("jodStatus") || "");
    updateIds.mutate({
      ticketId,
      josdNo: String(data.get("josdNo") || "") || undefined,
      jodNo: String(data.get("jodNo") || "") || undefined,
      jodStatus: status ? (status as "open" | "in_progress" | "closed") : undefined,
      dgNo: String(data.get("dgNo") || "") || undefined,
    });
  };

  const pushJobStatus = () => {
    if (!jobStatus) return toast.error("Pilih Job Status terlebih dahulu.");
    updateJob.mutate({
      ticketId,
      status: jobStatus as (typeof JOB_STATUSES)[number],
      note: jobNote || undefined,
      eta: eta || undefined,
    });
  };

  const openQcHistory = [...ticket.qcReviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const canEnterIds = ["admin", "spv", "mpp", "superadmin"].includes(role) || isSuper;
  const canRecordUpload = ["admin", "spv", "superadmin", "qc1", "qc2", "designer"].includes(role) || isSuper;
  const canClose = ["admin", "superadmin", "spv"].includes(role) || isSuper;
  const isEarlyReview = ["draft", "review_spv", "revisi", "revisi_owner"].includes(
    ticket.processStatus
  );

  return (
    <>
      <PageTitle
        kicker={`TICKET / ${ticket.ticketNo}`}
        title={ticket.request.productType}
        subtitle={`${ticket.request.requesterName} · ${ticket.request.sizeSpec || "Spesifikasi belum ditentukan"} · ${ticket.request.seriesCount} series`}
        action={
          <Link href="/tickets" className="button-secondary">
            <ArrowLeft size={14} /> Semua tiket
          </Link>
        }
      />
      <div
        style={{
          display: "flex",
          gap: 9,
          alignItems: "center",
          flexWrap: "wrap",
          margin: "-12px 0 17px",
        }}
      >
        <StatusPill status={ticket.processStatus} />
        <span className="status-pill teal">
          <i />
          JOB · {ticket.jobStatus}
        </span>
        <SlaPill
          status={ticket.processStatus}
          processUpdatedAt={ticket.processUpdatedAt}
          deadline={ticket.deadline}
          maxHours={ticket.slaHours}
        />
        <PriorityTag priority={ticket.request.finalPriority || ticket.request.requestedPriority} />
        <span className="section-kicker">
          DESIGNER: {ticket.designerSlot.displayName || ticket.designerSlot.label}
        </span>
      </div>
      <div className="progress-steps" style={{ margin: "0 0 20px" }}>
        <div
          className={`progress-step ${[
            "acc_owner",
            "menunggu_josd",
            "menunggu_jod",
            "finalisasi",
            "qc_spv",
            "qc1",
            "qc2",
            "siap_upload",
            "uploaded",
            "closed",
          ].includes(ticket.processStatus) ? "done" : ""}`}
        >
          <span>1</span>BRIEF
        </div>
        <i className="progress-connector" />
        <div
          className={`progress-step ${[
            "menunggu_josd",
            "menunggu_jod",
            "finalisasi",
            "qc_spv",
            "qc1",
            "qc2",
            "siap_upload",
            "uploaded",
            "closed",
          ].includes(ticket.processStatus) ? "done" : ""}`}
        >
          <span>2</span>OWNER
        </div>
        <i className="progress-connector" />
        <div
          className={`progress-step ${[
            "qc_spv",
            "qc1",
            "qc2",
            "siap_upload",
            "uploaded",
            "closed",
          ].includes(ticket.processStatus) ? "done" : ""}`}
        >
          <span>3</span>FINAL/QC
        </div>
        <i className="progress-connector" />
        <div
          className={`progress-step ${[
            "siap_upload",
            "uploaded",
            "closed",
          ].includes(ticket.processStatus) ? "done" : ""}`}
        >
          <span>4</span>PRODUKSI
        </div>
      </div>
      <div className="ticket-detail-grid">
        <div className="detail-stack">
          <section className="detail-card">
            <div className="section-heading" style={{ margin: "0 0 13px" }}>
              <h2>Brief & permintaan</h2>
              <span className="section-kicker">{ticket.ticketNo}</span>
            </div>
            <p>{ticket.brief}</p>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
            <div className="detail-meta">
              <div>
                <span>Jenis produk</span>
                <strong>{ticket.request.productType}</strong>
              </div>
              <div>
                <span>Ukuran / template</span>
                <strong>{ticket.request.sizeSpec || "—"}</strong>
              </div>
              <div>
                <span>Jumlah series</span>
                <strong>{ticket.request.seriesCount}</strong>
              </div>
              <div>
                <span>Peminta</span>
                <strong>{ticket.request.requesterName}</strong>
              </div>
              <div>
                <span>Estimasi produksi</span>
                <strong>{ticket.request.productionEstimate || "—"}</strong>
              </div>
              <div>
                <span>Deadline</span>
                <strong>{formatDate(ticket.deadline)}</strong>
              </div>
              <div>
                <span>Justifikasi</span>
                <strong>{ticket.request.businessJustification || "—"}</strong>
              </div>
              <div>
                <span>Desain serupa</span>
                <strong>
                  {ticket.request.designReuse === "reuse"
                    ? "Gunakan existing"
                    : ticket.request.designReuse === "recolor"
                      ? "Recolor"
                      : ticket.request.designReuse === "new"
                        ? "Desain baru"
                        : ticket.request.similarDesignRef || "—"}
                </strong>
              </div>
            </div>
          </section>

          {canJob && (
            <section className="detail-card">
              <h2>Update Job Status</h2>
              <div className="form-grid">
                <FormField label="Status pekerjaan">
                  <select
                    className="select-input"
                    value={jobStatus || ticket.jobStatus}
                    onChange={(event) => setJobStatus(event.target.value)}
                  >
                    {JOB_STATUSES.filter(
                      (status) => !["Draft dikirim", "Final dikirim"].includes(status)
                    ).map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Estimasi selesai terbaru">
                  <input
                    type="date"
                    className="text-input"
                    value={
                      eta ||
                      (ticket.eta ? new Date(ticket.eta).toISOString().slice(0, 10) : "")
                    }
                    onChange={(event) => setEta(event.target.value)}
                  />
                </FormField>
                <div className="form-span-2">
                  <FormField
                    label={
                      jobStatus === "Terhambat"
                        ? "Alasan hambatan (wajib)"
                        : "Catatan progres"
                    }
                  >
                    <textarea
                      className="text-area"
                      value={jobNote}
                      onChange={(event) => setJobNote(event.target.value)}
                      placeholder="Apa yang sedang dikerjakan / masukan apa yang ditunggu?"
                    />
                  </FormField>
                </div>
                <div className="modal-actions form-span-2" style={{ paddingTop: 0 }}>
                  <Button
                    className="button-primary"
                    onClick={pushJobStatus}
                    disabled={updateJob.isPending}
                  >
                    {updateJob.isPending ? "Menyimpan…" : "Simpan Job Status"}
                  </Button>
                </div>
              </div>
              <p className="form-helper" style={{ marginTop: 9 }}>
                Job Status adalah progres yang Anda isi. Status proses tiket tetap
                dikendalikan tahap review dan QC; status kirim draft/final akan tercatat
                otomatis saat file diunggah.
              </p>
            </section>
          )}

          {canJob && (
            <section className="detail-card">
              <h2>Kirim file desain</h2>
              <p className="form-helper">
                Versi desain internal disimpan untuk review/QC. Ini bukan upload ke server
                produksi; pencatatan ke 192.168.0.24 baru tersedia setelah QC2 lolos.
              </p>
              <p className="form-helper">
                PDF, PNG, JPG, AI, PSD, EPS atau TIFF · maksimum 8 MB per file.
              </p>
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 12 }}>
                <label className="button-secondary button-small">
                  <FilePlus2 size={13} /> Unggah draft
                  <input
                    type="file"
                    hidden
                    accept=".pdf,.png,.jpg,.jpeg,.ai,.psd,.eps,.tif,.tiff"
                    onChange={(event) => handleUpload(event, "draft")}
                  />
                </label>
                <label className="button-primary button-small">
                  <FilePlus2 size={13} /> Unggah kandidat final
                  <input
                    type="file"
                    hidden
                    accept=".pdf,.png,.jpg,.jpeg,.ai,.psd,.eps,.tif,.tiff"
                    onChange={(event) => handleUpload(event, "final")}
                  />
                </label>
                {busy && <span className="form-helper">Mengunggah file…</span>}
              </div>
            </section>
          )}

          {allowedReviewer && isEarlyReview && (
            <section className="detail-card">
              <h2>Review SPV (Kesesuaian Draft Desain)</h2>
              <div style={{ marginBottom: 12, padding: 12, background: "rgba(0,0,0,0.02)", borderRadius: 6, border: "1px solid var(--line)" }}>
                <span style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8, color: "var(--foreground)" }}>
                  Checklist Verifikasi Teknis SPV:
                </span>
                {[
                  { id: "themeAndBrief", label: "Kesesuaian tema visual dengan brief resmi SPV" },
                  { id: "dimensionBleed", label: "Dimensi template dan margin aman lipatan" },
                  { id: "bleed3mm", label: "Garis bleed minimal 3 mm di sekeliling artboard" },
                  { id: "typographyEmbed", label: "Tipografi & teks terbaca jelas (font outline/embed)" },
                  { id: "cmykResolution", label: "Color mode CMYK & resolusi gambar minimal 300 DPI" },
                ].map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 12,
                      minHeight: 42,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: spvChecklist[item.id as keyof typeof spvChecklist] ? "#f0fdf4" : "#ffffff",
                      border: spvChecklist[item.id as keyof typeof spvChecklist] ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
                      marginBottom: 6,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{ width: 20, height: 20, cursor: "pointer", accentColor: "var(--teal)" }}
                      checked={spvChecklist[item.id as keyof typeof spvChecklist]}
                      onChange={(e) => setSpvChecklist((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                    />
                    <span style={{ fontWeight: spvChecklist[item.id as keyof typeof spvChecklist] ? 600 : 400, color: spvChecklist[item.id as keyof typeof spvChecklist] ? "#15803d" : "#334155" }}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
              <FormField label="Catatan Instruksi Review / Revisi" hint="Wajib jika meminta revisi ke desainer">
                <textarea
                  className="text-area"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Berikan instruksi revisi yang spesifik atau catatan pengajuan ke Owner..."
                />
              </FormField>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button
                  className="button-primary"
                  onClick={() => {
                    const checkedLabels = Object.entries(spvChecklist)
                      .filter(([_, v]) => v)
                      .map(([k]) => k);
                    reviewSpv.mutate({
                      ticketId,
                      decision: "lolos",
                      note: reviewNote || undefined,
                      checklist: checkedLabels,
                    });
                  }}
                  disabled={reviewSpv.isPending}
                >
                  Lolos Diajukan ke Owner
                </Button>
                <Button
                  className="button-danger"
                  onClick={() => {
                    if (!reviewNote.trim()) {
                      toast.error("Wajib mengisi catatan instruksi revisi untuk desainer.");
                      return;
                    }
                    reviewSpv.mutate({ ticketId, decision: "revisi", note: reviewNote });
                  }}
                  disabled={reviewSpv.isPending}
                >
                  Minta Revisi Designer
                </Button>
              </div>
            </section>
          )}

          {canSimulateOwner && ticket.processStatus === "menunggu_acc_owner" && (
            <section className="detail-card">
              <div style={{ background: "rgba(5, 150, 105, 0.06)", border: "1px solid #bbf7d0", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>
                  SIMULASI KEPUTUSAN OWNER (MODE BYPASS)
                </span>
                <p style={{ fontSize: 11, color: "#15803d", margin: "2px 0 0" }}>
                  Aksi simulasi untuk merekam keputusan Owner (ACC, ACC dengan catatan, Revisi, atau Tolak).
                </p>
              </div>
              <h2>Keputusan Owner</h2>
              <FormField label="Catatan Keputusan Owner" hint="Wajib jika ACC dengan catatan, Minta revisi, atau Tolak">
                <textarea
                  className="text-area"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Catatan resmi dari Owner (misal: ACC ornamen warna, catatan barcode samping, dll.)..."
                />
              </FormField>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <Button
                  className="button-primary"
                  onClick={() => ownerDecision.mutate({ ticketId, decision: "acc", note: reviewNote || undefined })}
                  disabled={ownerDecision.isPending}
                >
                  ACC Desain (Lolos)
                </Button>
                <Button
                  className="button-secondary"
                  onClick={() => {
                    if (!reviewNote.trim()) {
                      toast.error("Wajib mencatat keterangan untuk ACC dengan catatan.");
                      return;
                    }
                    ownerDecision.mutate({
                      ticketId,
                      decision: "acc_catatan",
                      note: reviewNote,
                    });
                  }}
                  disabled={ownerDecision.isPending}
                >
                  ACC dengan Catatan
                </Button>
                <Button
                  className="button-secondary"
                  onClick={() => {
                    if (!reviewNote.trim()) {
                      toast.error("Wajib mengisi catatan alasan revisi dari Owner.");
                      return;
                    }
                    ownerDecision.mutate({ ticketId, decision: "revisi", note: reviewNote });
                  }}
                  disabled={ownerDecision.isPending}
                >
                  Minta Revisi (Owner)
                </Button>
                <Button
                  className="button-danger"
                  onClick={() => {
                    if (!reviewNote.trim()) {
                      toast.error("Wajib mengisi catatan alasan penolakan Owner.");
                      return;
                    }
                    ownerDecision.mutate({ ticketId, decision: "tolak", note: reviewNote });
                  }}
                  disabled={ownerDecision.isPending}
                >
                  Tolak Desain
                </Button>
              </div>
            </section>
          )}

          {[
            "acc_owner",
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
          ].includes(ticket.processStatus) && (
            <section className="detail-card">
              <h2>Penomoran Proses Operasional (JOS-D, JOD, DG)</h2>
              <p className="form-helper">
                Catat identitas alur produksi: JOS-D diterbitkan setelah ACC Owner, JOD dari sistem Clipper, dan DG pada tahap finalisasi.
              </p>

              {(!currentIds?.josdNo || ticket.processStatus === "menunggu_josd") && (
                <div>
                  {ticket.accSessionApproval && ["acc", "acc_catatan"].includes(ticket.accSessionApproval.decision) ? (
                    <div
                      style={{
                        margin: "12px 0",
                        padding: "12px 14px",
                        background: "#f0fdf4",
                        border: "1px solid #86efac",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <CheckCircle2 size={16} style={{ color: "#16a34a" }} />
                          <strong style={{ fontSize: 13, color: "#166534" }}>
                            ACC Sesi Bulanan Terverifikasi ({ticket.accSessionApproval.sessionNo})
                          </strong>
                        </div>
                        <small style={{ display: "block", color: "#15803d", marginTop: 4 }}>
                          Disahkan pada meeting tanggal {formatDate(ticket.accSessionApproval.presentationDate)}
                          {ticket.accSessionApproval.notes ? ` — Catatan: "${ticket.accSessionApproval.notes}"` : ""}.
                          Gerbang JOS-D terbuka resmi.
                        </small>
                      </div>
                      <Button
                        type="button"
                        className="button-primary button-small"
                        style={{ background: "#059669", whiteSpace: "nowrap" }}
                        onClick={() => requestJosdMutation.mutate({ ticketId })}
                        disabled={requestJosdMutation.isPending}
                      >
                        <FilePlus2 size={13} style={{ marginRight: 4 }} />
                        {requestJosdMutation.isPending ? "Menerbitkan…" : "Minta Nomor JOS-D"}
                      </Button>
                    </div>
                  ) : (
                    <div
                      style={{
                        margin: "12px 0",
                        padding: "12px 14px",
                        background: "#fffbeb",
                        border: "1px dashed #f59e0b",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Lock size={15} style={{ color: "#d97706" }} />
                          <strong style={{ fontSize: 12, color: "#92400e" }}>
                            Gerbang JOS-D Terkunci (Wajib ACC Sesi Bulanan)
                          </strong>
                        </div>
                        <small style={{ display: "block", color: "#b45309", marginTop: 4, lineHeight: 1.4 }}>
                          Sesuai SOP, nomor JOS-D HANYA dapat diterbitkan untuk tiket yang telah disahkan (ACC / ACC Catatan) dalam Sesi ACC Bulanan Owner.
                        </small>
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Button
                          type="button"
                          className="button-secondary button-small"
                          disabled
                          title="Terkunci sampai ACC Sesi Bulanan"
                          style={{ cursor: "not-allowed" }}
                        >
                          <Lock size={12} style={{ marginRight: 4 }} /> Minta JOS-D
                        </Button>
                        <Button
                          type="button"
                          className="button-secondary button-small"
                          style={{ borderColor: "#f59e0b", color: "#b45309", whiteSpace: "nowrap" }}
                          onClick={() => {
                            setEmergencyReason("");
                            setIsEmergencyModalOpen(true);
                          }}
                        >
                          <AlertTriangle size={12} style={{ marginRight: 4 }} /> ACC di Luar Sesi (Urgent)
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <form className="form-grid" onSubmit={submitIds} style={{ marginTop: 13 }}>
                <FormField label="Nomor JOS-D">
                  <input
                    className="text-input"
                    name="josdNo"
                    defaultValue={currentIds?.josdNo || ""}
                    placeholder="Contoh: JOSD-2026-025"
                  />
                </FormField>
                <FormField label="Nomor JOD (Clipper)">
                  <input
                    className="text-input"
                    name="jodNo"
                    defaultValue={currentIds?.jodNo || ""}
                    placeholder="Contoh: JOD-88410"
                  />
                </FormField>
                <FormField label="Status JOD (Clipper)">
                  <select
                    className="select-input"
                    name="jodStatus"
                    defaultValue={currentIds?.jodStatus || "open"}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="closed">Closed</option>
                  </select>
                </FormField>
                <FormField label="Nomor DG (Arsip Desain Grafis)">
                  <input
                    className="text-input"
                    name="dgNo"
                    defaultValue={currentIds?.dgNo || ""}
                    placeholder="Contoh: DG-3044"
                  />
                </FormField>
                <div className="modal-actions form-span-2" style={{ paddingTop: 0 }}>
                  <Button
                    type="submit"
                    className="button-primary"
                    disabled={updateIds.isPending}
                  >
                    {updateIds.isPending ? "Menyimpan…" : "Simpan / Perbarui Nomor"}
                  </Button>
                </div>
              </form>
              <div className="detail-meta" style={{ marginTop: 13 }}>
                <div>
                  <span>JOS-D</span>
                  <strong>{currentIds?.josdNo || "Belum dicatat"}</strong>
                </div>
                <div>
                  <span>JOD / Clipper</span>
                  <strong>
                    {currentIds?.jodNo || "Belum dicatat"} · {currentIds?.jodStatus || "—"}
                  </strong>
                </div>
                <div>
                  <span>DG</span>
                  <strong>{currentIds?.dgNo || "Belum dicatat"}</strong>
                </div>
              </div>
            </section>
          )}

          {/* MODUL 1: QUALITY CONTROL BERURUTAN (STAGED QC) */}
          <section className="detail-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                <CheckSquare size={16} /> Quality Control Berurutan (Staged QC)
              </h2>
              <span className="section-kicker">GERBANG KETAT 3 TAHAP</span>
            </div>

            {/* Visual 3-Stage Progress Steps */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                marginBottom: 16,
                padding: "10px",
                background: "var(--paper-1, #f8fafc)",
                borderRadius: 8,
                border: "1px solid var(--line, #e2e8f0)",
              }}
            >
              {/* Stage 1: SPV */}
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: isSpvPassed
                    ? "1px solid #86efac"
                    : ticket.processStatus === "qc_spv"
                      ? "1px solid #93c5fd"
                      : "1px solid #cbd5e1",
                  background: isSpvPassed
                    ? "#f0fdf4"
                    : ticket.processStatus === "qc_spv"
                      ? "#eff6ff"
                      : "#ffffff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <strong style={{ fontSize: 11 }}>1. QC SPV</strong>
                  {isSpvPassed ? (
                    <span style={{ color: "#16a34a", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                      <CheckCircle2 size={12} /> LOLOS
                    </span>
                  ) : ticket.processStatus === "qc_spv" ? (
                    <span style={{ color: "#2563eb", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                      <Unlock size={12} /> AKTIF
                    </span>
                  ) : ticket.processStatus === "revisi_qc" ? (
                    <span style={{ color: "#dc2626", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                      <AlertTriangle size={12} /> REVISI
                    </span>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                      <Lock size={12} /> MENUNGGU
                    </span>
                  )}
                </div>
                <small style={{ color: "#64748b", fontSize: 10, display: "block" }}>
                  {spvReview ? `Diperiksa oleh ${spvReview.checkerName || "SPV"}` : "Pemeriksaan SPV Lokal"}
                </small>
              </div>

              {/* Stage 2: QC Checker 1 */}
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: isQc1Passed
                    ? "1px solid #86efac"
                    : ticket.processStatus === "qc1"
                      ? "1px solid #93c5fd"
                      : "1px solid #cbd5e1",
                  background: isQc1Passed
                    ? "#f0fdf4"
                    : ticket.processStatus === "qc1"
                      ? "#eff6ff"
                      : "#ffffff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <strong style={{ fontSize: 11 }}>2. QC Checker 1</strong>
                  {isQc1Passed ? (
                    <span style={{ color: "#16a34a", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                      <CheckCircle2 size={12} /> LOLOS
                    </span>
                  ) : ticket.processStatus === "qc1" ? (
                    <span style={{ color: "#2563eb", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                      <Unlock size={12} /> AKTIF
                    </span>
                  ) : isSpvPassed ? (
                    <span style={{ color: "#64748b", fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                      <Lock size={12} /> SIAP
                    </span>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                      <Lock size={12} /> TERKUNCI
                    </span>
                  )}
                </div>
                <small style={{ color: "#64748b", fontSize: 10, display: "block" }}>
                  {qc1Review ? `Diperiksa oleh ${qc1Review.checkerName || "QC 1"}` : "Terkunci hingga SPV lolos"}
                </small>
              </div>

              {/* Stage 3: QC Checker 2 */}
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: isQc2Passed
                    ? "1px solid #86efac"
                    : ticket.processStatus === "qc2"
                      ? "1px solid #93c5fd"
                      : "1px solid #cbd5e1",
                  background: isQc2Passed
                    ? "#f0fdf4"
                    : ticket.processStatus === "qc2"
                      ? "#eff6ff"
                      : "#ffffff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <strong style={{ fontSize: 11 }}>3. QC Checker 2</strong>
                  {isQc2Passed ? (
                    <span style={{ color: "#16a34a", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                      <CheckCircle2 size={12} /> LOLOS
                    </span>
                  ) : ticket.processStatus === "qc2" ? (
                    <span style={{ color: "#2563eb", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                      <Unlock size={12} /> AKTIF
                    </span>
                  ) : isQc1Passed ? (
                    <span style={{ color: "#64748b", fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                      <Lock size={12} /> SIAP
                    </span>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                      <Lock size={12} /> TERKUNCI
                    </span>
                  )}
                </div>
                <small style={{ color: "#64748b", fontSize: 10, display: "block" }}>
                  {qc2Review ? `Diperiksa oleh ${qc2Review.checkerName || "QC 2"}` : "Terkunci hingga QC1 lolos"}
                </small>
              </div>
            </div>

            {/* Alert Box jika status Revisi QC */}
            {ticket.processStatus === "revisi_qc" && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 6,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#991b1b", fontWeight: 700, fontSize: 11 }}>
                  <AlertTriangle size={15} /> Tiket Memerlukan Revisi QC dari Designer
                </div>
                <p style={{ color: "#7f1d1d", fontSize: 11, margin: "6px 0 0" }}>
                  Pemeriksaan QC menemukan butir yang belum memenuhi standar. Designer penanggung jawab (
                  {ticket.designerSlot.displayName || ticket.designerSlot.label}) wajib memperbaiki berkas dan mengunggah versi final perbaikan untuk mengulang siklus QC.
                </p>
                {openQcHistory[0]?.summary && (
                  <div style={{ marginTop: 8, padding: "6px 10px", background: "#ffffff", borderRadius: 4, border: "1px solid #fed7aa", fontSize: 11 }}>
                    <strong>Catatan QC Terakhir:</strong> {openQcHistory[0].summary}
                  </div>
                )}
              </div>
            )}

            {/* Form Checklist QC Aktif */}
            {canRunQc && qcStage ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 6,
                  border: "1px solid #bfdbfe",
                  background: "#f8fafc",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 12, color: "#1e3a8a" }}>
                      Checklist 18 Butir ·{" "}
                      {qcStage === "spv"
                        ? "Tahap 1: SPV Lokal"
                        : qcStage === "qc1"
                          ? "Tahap 2: QC Checker 1"
                          : "Tahap 3: QC Checker 2 (Gerbang Akhir)"}
                    </h3>
                    <p className="form-helper" style={{ margin: "3px 0 0" }}>
                      Centang butir yang lolos. Jika ada butir yang gagal, wajib sertakan catatan revisi agar desainer dapat menindaklanjuti.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button type="button" className="button-secondary button-small" onClick={handleQuickPassAll}>
                      <CheckCircle2 size={12} /> Centang Semua Lolos (18)
                    </Button>
                    <Button type="button" className="button-quiet button-small" onClick={handleQuickReset}>
                      Reset
                    </Button>
                  </div>
                </div>

                <form onSubmit={submitQC}>
                  <div style={{ display: "grid", gap: 8, maxHeight: "480px", overflowY: "auto", paddingRight: 4 }}>
                    {QC_ITEMS.map((item, index) => {
                      const itemAnswer = qcAnswers[index + 1];
                      const isPassed = itemAnswer?.passed ?? false;
                      const hasInteracted = itemAnswer !== undefined;

                      return (
                        <div
                          key={item}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 6,
                            border: hasInteracted
                              ? isPassed
                                ? "1px solid #86efac"
                                : "1px solid #fca5a5"
                              : "1px solid #e2e8f0",
                            background: hasInteracted
                              ? isPassed
                                ? "#f0fdf4"
                                : "#fff1f2"
                              : "#ffffff",
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
                              <span style={{ font: "11px var(--mono)", fontWeight: 700, color: "#64748b", background: "#f1f5f9", padding: "3px 7px", borderRadius: 4 }}>
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: isPassed ? 600 : 500, color: "#1e293b", lineHeight: 1.4 }}>
                                {item}
                              </span>
                            </div>
                            <label
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                cursor: "pointer",
                                minHeight: 44,
                                padding: "0 14px",
                                borderRadius: 6,
                                border: isPassed ? "2px solid #16a34a" : "1px solid #cbd5e1",
                                background: isPassed ? "#dcfce7" : "#ffffff",
                                transition: "all 120ms ease",
                                userSelect: "none",
                              }}
                            >
                              <input
                                type="checkbox"
                                style={{ width: 20, height: 20, cursor: "pointer", accentColor: "var(--teal)" }}
                                checked={isPassed}
                                onChange={(event) =>
                                  setQcAnswers((prev) => ({
                                    ...prev,
                                    [index + 1]: {
                                      passed: event.target.checked,
                                      note: prev[index + 1]?.note || "",
                                    },
                                  }))
                                }
                              />
                              <span style={{ fontSize: 12, fontWeight: 700, color: isPassed ? "#15803d" : "#475569" }}>
                                {isPassed ? "LOLOS" : "BELUM LOLOS"}
                              </span>
                            </label>
                          </div>
                          {hasInteracted && !isPassed && (
                            <div style={{ marginTop: 4 }}>
                              <textarea
                                className="text-area"
                                style={{ minHeight: 52, fontSize: 12 }}
                                placeholder="Wajib: Tuliskan catatan spesifik kegagalan / revisi untuk butir ini…"
                                value={itemAnswer?.note || ""}
                                onChange={(event) =>
                                  setQcAnswers((prev) => ({
                                    ...prev,
                                    [index + 1]: { passed: false, note: event.target.value },
                                  }))
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <FormField label="Ringkasan Catatan QC">
                      <textarea
                        className="text-area"
                        value={qcSummary}
                        onChange={(event) => setQcSummary(event.target.value)}
                        placeholder="Catatan umum hasil pemeriksaan evaluasi QC (opsional jika butir revisi sudah memiliki catatan spesifik)."
                      />
                    </FormField>
                  </div>

                  <div className="modal-actions" style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    {Object.values(qcAnswers).some((a) => !a.passed && qcAnswers[1] !== undefined) ? (
                      <Button
                        type="submit"
                        className="button-danger"
                        disabled={submitQc.isPending}
                      >
                        <XCircle size={13} /> {submitQc.isPending ? "Menyimpan…" : "Kembalikan ke Revisi Designer"}
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        className="button-primary"
                        disabled={submitQc.isPending}
                      >
                        <CheckCircle2 size={13} />{" "}
                        {submitQc.isPending
                          ? "Menyimpan…"
                          : qcStage === "qc2"
                            ? "Simpan & Loloskan QC (Buka Gerbang Server)"
                            : "Simpan & Loloskan ke Tahap QC Berikutnya"}
                      </Button>
                    )}
                  </div>
                </form>
              </div>
            ) : null}

            {/* Riwayat QC */}
            {openQcHistory.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Riwayat Evaluasi QC
                </strong>
                <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                  {openQcHistory.map((qc: any) => (
                    <div
                      key={qc.id}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 5,
                        background: qc.result === "lolos" ? "#f0fdf4" : "#fef2f2",
                        border: qc.result === "lolos" ? "1px solid #dcfce7" : "1px solid #fee2e2",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: 11 }}>
                          {qc.stage.toUpperCase()}: {qc.result === "lolos" ? "Lolos Checklist 18 Butir" : "Perlu Revisi"}
                        </strong>
                        <span style={{ fontSize: 10, color: "#64748b", display: "block" }}>
                          Pemeriksa: {qc.checkerName || "Checker"} · {formatDateTime(qc.createdAt)}
                        </span>
                        {qc.summary && (
                          <span style={{ fontSize: 10, color: "#334155", display: "block", marginTop: 2 }}>
                            Ringkasan: {qc.summary}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: qc.result === "lolos" ? "#16a34a" : "#dc2626",
                          color: "#ffffff",
                        }}
                      >
                        {qc.result.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* MODUL 2: GERBANG KUNCI UPLOAD SERVER PRODUKSI (192.168.0.24) */}
          <section
            className="detail-card"
            style={{
              border: isServerUnlocked ? "1px solid #86efac" : "1px solid #cbd5e1",
              background: isServerUnlocked ? "#f0fdf4" : "#f8fafc",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                <Server size={16} /> Upload Server Produksi (192.168.0.24)
              </h2>
              {isServerUnlocked ? (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "#16a34a",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Unlock size={11} /> GERBANG TERBUKA (QC2 Lolos)
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "#64748b",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Lock size={11} /> TERKUNCI (STRICT GATE)
                </span>
              )}
            </div>

            {isServerUnlocked ? (
              <>
                <p className="form-helper" style={{ color: "#166534" }}>
                  QC Checker 2 telah dinyatakan Lolos. Gerbang penyimpanan jaringan terbuka. Daftarkan path server produksi internal (`\\192.168.0.24\...`) untuk memastikan berkas siap cetak telah terarsip.
                </p>

                {currentIds?.serverPath && (
                  <div
                    style={{
                      margin: "10px 0",
                      padding: "10px 12px",
                      background: "#ffffff",
                      border: "1px solid #bbf7d0",
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#166534", fontWeight: 600, fontSize: 11 }}>
                      <CheckCircle2 size={14} /> Berkas Final Terverifikasi di Jaringan Produksi
                    </div>
                    <code
                      style={{
                        display: "block",
                        marginTop: 4,
                        fontSize: 10,
                        color: "#0f172a",
                        background: "#f1f5f9",
                        padding: "4px 8px",
                        borderRadius: 4,
                        wordBreak: "break-all",
                      }}
                    >
                      {currentIds.serverPath}
                    </code>
                    {currentIds.uploadedAt && (
                      <small style={{ color: "#64748b", display: "block", marginTop: 4 }}>
                        Waktu pencatatan upload: {formatDateTime(currentIds.uploadedAt)}
                      </small>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                  <input
                    className="text-input"
                    value={serverPath}
                    onChange={(event) => setServerPath(event.target.value)}
                    placeholder="Contoh: \\192.168.0.24\Desain_Produksi\2026\Folder_Produk"
                  />
                  <Button
                    className="button-primary"
                    onClick={() => uploadPath.mutate({ ticketId, serverPath })}
                    disabled={!serverPath.trim() || uploadPath.isPending}
                  >
                    {uploadPath.isPending ? "Mencatat…" : "Catat & Verifikasi Upload Server"}
                  </Button>
                </div>
              </>
            ) : (
              <div style={{ padding: "12px 14px", background: "#ffffff", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                <p style={{ color: "#475569", fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                  <strong>Gerbang Keamanan Produksi Aktif:</strong> Form upload server produksi 192.168.0.24 terkunci total. Modul ini HANYA akan terbuka secara otomatis setelah seluruh rangkaian Quality Control (QC SPV → QC Checker 1 → QC Checker 2) berhasil dilewati dan dinyatakan Lolos.
                </p>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <input
                    className="text-input"
                    disabled
                    value=""
                    placeholder="\\192.168.0.24\... (Terkunci sampai QC Checker 2 Lolos)"
                    style={{ background: "#f1f5f9", cursor: "not-allowed" }}
                  />
                  <Button className="button-secondary" disabled>
                    <Lock size={12} /> Terkunci
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* MODUL 3: PENUTUPAN TIKET & ARSIP (CLOSE JOD & TICKET) */}
          <section
            className="detail-card"
            style={{
              border: isClosed ? "1px solid #86efac" : isReadyToClose ? "1px solid #93c5fd" : "1px solid #cbd5e1",
              background: isClosed ? "#f0fdf4" : "#ffffff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                <Archive size={16} /> Penutupan Tiket & Arsip Produksi
              </h2>
              {isClosed ? (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "#16a34a",
                    color: "#ffffff",
                  }}
                >
                  CLOSED / SELESAI
                </span>
              ) : (
                <span className="section-kicker">VERIFIKASI KELENGKAPAN BERKAS</span>
              )}
            </div>

            {isClosed ? (
              <div
                style={{
                  padding: "12px 14px",
                  background: "#ffffff",
                  border: "1px solid #86efac",
                  borderRadius: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#15803d", fontWeight: 700, fontSize: 12 }}>
                  <CheckCircle2 size={16} /> Tiket & Berkas Produksi Resmi Ditutup & Diarsipkan
                </div>
                <p style={{ margin: "5px 0 0", color: "#166534", fontSize: 11 }}>
                  Nomor JOD Clipper ({currentIds?.jodNo || "—"}) telah ditutup dan file siap produksi tersimpan permanen di arsip server jaringan.
                </p>
                {ticket.closedAt && (
                  <small style={{ color: "#64748b", display: "block", marginTop: 4 }}>
                    Ditutup pada: {formatDateTime(ticket.closedAt)}
                  </small>
                )}
              </div>
            ) : (
              <>
                <p className="form-helper" style={{ marginBottom: 10 }}>
                  Sebelum tiket dapat ditutup secara resmi, sistem memvalidasi kelengkapan berkas dan syarat operasional berikut:
                </p>

                {/* Checklist Validasi Kelengkapan */}
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    padding: "10px 12px",
                    background: "#f8fafc",
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                    <span>1. Seluruh Tahap QC (SPV, QC1, QC2) Selesai & Lolos</span>
                    {isQc2Passed ? (
                      <strong style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: 3 }}>
                        <CheckCircle2 size={13} /> Lengkap
                      </strong>
                    ) : (
                      <span style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: 3 }}>
                        <XCircle size={13} /> Belum Lolos
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                    <span>2. Berkas Final Tercatat di Server Produksi (192.168.0.24)</span>
                    {isServerUploaded ? (
                      <strong style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: 3 }}>
                        <CheckCircle2 size={13} /> Terdaftar
                      </strong>
                    ) : (
                      <span style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: 3 }}>
                        <XCircle size={13} /> Belum Ada
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                    <span>3. Nomor JOD (Clipper) Tercatat: <strong>{currentIds?.jodNo || "—"}</strong></span>
                    {isJodFilled ? (
                      <strong style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: 3 }}>
                        <CheckCircle2 size={13} /> Terisi
                      </strong>
                    ) : (
                      <span style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: 3 }}>
                        <XCircle size={13} /> Belum Diisi
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                    <span>4. Status JOD Clipper: <strong>{currentIds?.jodStatus || "open"}</strong></span>
                    {isJodClosed ? (
                      <strong style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: 3 }}>
                        <CheckCircle2 size={13} /> Closed
                      </strong>
                    ) : (
                      <span style={{ color: "#ca8a04", display: "flex", alignItems: "center", gap: 3 }}>
                        Otomatis di-close saat konfirmasi
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <small style={{ color: isReadyToClose ? "#15803d" : "#64748b", fontSize: 10 }}>
                    {isReadyToClose
                      ? "✓ Semua berkas lengkap. Tiket siap ditutup & diarsipkan."
                      : "⚠ Lengkapi QC, upload server, dan nomor JOD terlebih dahulu."}
                  </small>
                  <Button
                    className="button-primary"
                    onClick={() => close.mutate({ ticketId, jodClosed: true })}
                    disabled={!isReadyToClose || close.isPending}
                  >
                    <Archive size={13} /> {close.isPending ? "Menutup & Mengarsipkan…" : "Konfirmasi Tutup JOD & Tiket"}
                  </Button>
                </div>
              </>
            )}
          </section>

          <section className="detail-card">
            <h2>Referensi permintaan</h2>
            {ticket.requestReferenceFiles.length ? (
              ticket.requestReferenceFiles.map((file: any) => (
                <div className="file-row" key={file.id}>
                  <span>
                    <strong>{file.fileName}</strong>
                    <small>
                      Referensi · {formatDateTime(file.createdAt)}
                    </small>
                  </span>
                  <a
                    className="button-secondary button-small"
                    href={file.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={12} /> Buka
                  </a>
                </div>
              ))
            ) : (
              <p className="form-helper">Tidak ada lampiran referensi.</p>
            )}
            {ticket.request.referenceLink &&
              (ticket.request.referenceLink.startsWith("http://") ||
              ticket.request.referenceLink.startsWith("https://") ? (
                <a
                  className="button-quiet button-small"
                  href={ticket.request.referenceLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Buka tautan
                </a>
              ) : (
                <p className="form-helper">Path jaringan: {ticket.request.referenceLink}</p>
              ))}
          </section>
          <section className="detail-card">
            <h2>File & versi</h2>
            {ticket.files.length ? (
              ticket.files.map((file: any) => (
                <div className="file-row" key={file.id}>
                  <span>
                    <strong>{file.fileName}</strong>
                    <small>
                      {file.fileType.toUpperCase()} · v{file.versionNo} ·{" "}
                      {(file.fileSize / 1024 / 1024).toFixed(1)} MB ·{" "}
                      {file.uploaderName || "Akun"} · {formatDateTime(file.createdAt)}
                    </small>
                    {file.note && (
                      <span className="cell-sub" style={{ display: "block", marginTop: 2, color: "#475569" }}>
                        Catatan: {file.note}
                      </span>
                    )}
                  </span>
                  <a
                    className="button-secondary button-small"
                    href={file.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={12} /> Buka
                  </a>
                </div>
              ))
            ) : (
              <EmptyState
                title="Belum ada file"
                detail="Draft dan final yang diunggah akan tersimpan sebagai versi tiket."
                icon={<FilePlus2 size={18} />}
              />
            )}
          </section>
        </div>

        <aside className="detail-stack">
          <section className="detail-card">
            <h2>Status & pemilik</h2>
            <div className="detail-meta">
              <div>
                <span>Status proses</span>
                <strong>
                  <StatusPill status={ticket.processStatus} />
                </strong>
              </div>
              <div>
                <span>Job Status</span>
                <strong>{ticket.jobStatus}</strong>
              </div>
              <div>
                <span>Designer penanggung jawab</span>
                <strong>
                  {ticket.designerSlot.displayName || ticket.designerSlot.label}
                </strong>
              </div>
              <div>
                <span>Prioritas</span>
                <strong>
                  <PriorityTag
                    priority={
                      ticket.request.finalPriority || ticket.request.requestedPriority
                    }
                  />
                </strong>
              </div>
              <div>
                <span>Target selesai</span>
                <strong>{formatDate(ticket.eta || ticket.deadline)}</strong>
              </div>
              <div>
                <span>Nomor JOD</span>
                <strong>{currentIds?.jodNo || "—"}</strong>
              </div>
            </div>
          </section>
          {role === "spv" && !["closed", "ditolak_owner"].includes(ticket.processStatus) && (
            <section className="detail-card">
              <h2>Penugasan Designer</h2>
              <p className="form-helper">
                SPV dapat memindahkan tiket ke slot aktif lain untuk menyeimbangkan
                workload; perubahan dicatat di riwayat.
              </p>
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  reassignDesigner.mutate({
                    ticketId,
                    designerSlotId: Number(form.get("designerSlotId")),
                  });
                }}
              >
                <div className="form-span-2">
                  <FormField label="Designer penanggung jawab">
                    <select
                      className="select-input"
                      name="designerSlotId"
                      defaultValue={String(ticket.designerSlotId)}
                      required
                    >
                      {(designerSlotsQuery.data || [])
                        .filter(
                          (slot) => slot.isActive || slot.id === ticket.designerSlot.id
                        )
                        .map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {slot.displayName || slot.label}
                            {slot.isActive ? "" : " · nonaktif (penugasan lama)"}
                          </option>
                        ))}
                    </select>
                  </FormField>
                </div>
                <div className="modal-actions form-span-2" style={{ paddingTop: 0 }}>
                  <Button
                    type="submit"
                    className="button-primary"
                    disabled={
                      reassignDesigner.isPending || designerSlotsQuery.isLoading
                    }
                  >
                    {reassignDesigner.isPending ? "Menyimpan…" : "Simpan penugasan"}
                  </Button>
                </div>
              </form>
            </section>
          )}
          <section className="detail-card">
            <h2>Riwayat aktivitas</h2>
            {ticket.events.length ? (
              ticket.events.map((item: any) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-dot" />
                  <span>
                    <strong>{item.eventType.replaceAll("_", " ")}</strong>
                    <small>
                      {item.detail || "Perubahan tiket"}
                      <br />
                      {item.actorName || `Akun #${item.actorUserId ?? "—"}`} ·{" "}
                      {formatDateTime(item.createdAt)}
                    </small>
                  </span>
                </div>
              ))
            ) : (
              <p className="form-helper">Aktivitas akan dicatat seiring tiket bergerak.</p>
            )}
          </section>
          <section className="detail-card">
            <h2>Riwayat Job Status</h2>
            {ticket.jobUpdates.length ? (
              ticket.jobUpdates.map((item: any) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-dot" />
                  <span>
                    <strong>{item.status}</strong>
                    <small>
                      {item.note || "Pembaruan status"}
                      <br />
                      {item.designerName || "Designer"} ·{" "}
                      {formatDateTime(item.createdAt)}
                    </small>
                  </span>
                </div>
              ))
            ) : (
              <p className="form-helper">Belum ada pembaruan oleh Designer.</p>
            )}
          </section>
          <section className="detail-card">
            <h2>Keputusan Owner / review</h2>
            {ticket.approvals.length ? (
              ticket.approvals.map((item: any) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-dot" />
                  <span>
                    <strong>
                      {item.stage.replaceAll("_", " ")} · {item.decision}
                    </strong>
                    <small>
                      {item.note || "Tanpa catatan"}
                      <br />
                      {item.reviewerName || "Reviewer"} ·{" "}
                      {formatDateTime(item.createdAt)}
                    </small>
                  </span>
                </div>
              ))
            ) : (
              <p className="form-helper">Belum ada keputusan yang dicatat.</p>
            )}
          </section>
          <section className="detail-card">
            <h2>Riwayat QC</h2>
            {openQcHistory.length ? (
              openQcHistory.map((item: any) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-dot" />
                  <span>
                    <strong>
                      {item.stage.toUpperCase()} · {item.result.toUpperCase()}
                    </strong>
                    <small>
                      {item.summary ||
                        `${item.items.filter((answer: any) => answer.passed).length}/${item.items.length} butir lolos`}
                      <br />
                      {item.checkerName || "Checker"} ·{" "}
                      {formatDateTime(item.createdAt)}
                    </small>
                  </span>
                </div>
              ))
            ) : (
              <p className="form-helper">
                QC dimulai setelah finalisasi JOD/DG dan file final tersedia.
              </p>
            )}
          </section>
        </aside>
      </div>

      {/* MODAL PENGECEUALIAN DARURAT: ACC DI LUAR SESI */}
      {isEmergencyModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsEmergencyModalOpen(false);
          }}
        >
          <div className="modal-panel" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#92400e" }}>
                <AlertTriangle size={18} style={{ color: "#d97706" }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                  Pengecualian Darurat: ACC di Luar Sesi
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsEmergencyModalOpen(false)}
                aria-label="Tutup modal darurat"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-content">
              <p style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, margin: "0 0 14px" }}>
                Mode ini khusus untuk kebutuhan darurat / *urgent* (misalnya pesanan mendesak, tenggat tender, atau persetujuan langsung Owner). Alasan pengecualian wajib dicatat dan akan tersimpan secara permanen di audit log aktivitas tiket.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!emergencyReason.trim()) {
                    toast.error("Alasan darurat wajib diisi.");
                    return;
                  }
                  requestJosdMutation.mutate({
                    ticketId,
                    isEmergencyOutOfSession: true,
                    emergencyReason: emergencyReason.trim(),
                  });
                }}
              >
                <FormField label="Alasan / Justifikasi Darurat (Wajib Diisi)">
                  <textarea
                    className="text-area"
                    style={{ minHeight: 80 }}
                    value={emergencyReason}
                    onChange={(e) => setEmergencyReason(e.target.value)}
                    placeholder="Contoh: Pesanan urgent pameran lusa. Owner telah menyetujui langsung via telepon/WhatsApp kepada SPV pada 22 Okt 2026..."
                    required
                  />
                </FormField>

                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <Button
                    type="button"
                    className="button-secondary"
                    onClick={() => setIsEmergencyModalOpen(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    className="button-primary"
                    style={{ background: "#d97706" }}
                    disabled={requestJosdMutation.isPending || !emergencyReason.trim()}
                  >
                    {requestJosdMutation.isPending ? "Menerbitkan…" : "Konfirmasi Terbitkan JOS-D"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TicketDetailPage;
