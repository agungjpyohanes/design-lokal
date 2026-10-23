import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FilePlus2,
  Search,
  ClipboardList,
  ArrowRight,
  Ticket as TicketIcon,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  AlertCircle,
  Layers,
  LayoutGrid,
  Table as TableIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  FormField,
  Modal,
  PageTitle,
  PriorityTag,
  SlaPill,
  formatDate,
} from "@/modules/common/components/WorkflowUI";
import {
  GATE_DECISION_LABELS,
  REQUEST_STATUS_LABELS,
  isReadyForTicket,
  type GateDecision,
} from "@shared/workflow";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
    reader.readAsDataURL(file);
  });
}

export function RequestsPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const query = trpc.workflow.requests.list.useQuery();
  const slotsQuery = trpc.workflow.settings.designerSlots.useQuery(undefined, {
    enabled: ["superadmin", "admin", "spv", "manager", "owner"].includes(user?.appRole || ""),
  });

  const create = trpc.workflow.requests.create.useMutation({
    onSuccess: async (data) => {
      toast.success(`Permintaan ${data.requestNo} berhasil dicatat.`);
      setOpen(false);
      resetFormStates();
      await utils.workflow.requests.list.invalidate();
      await utils.workflow.dashboard.invalidate();
    },
  });

  const review = trpc.workflow.requests.review.useMutation({
    onSuccess: async () => {
      toast.success("Keputusan gerbang tersimpan.");
      setReviewing(null);
      await utils.workflow.requests.list.invalidate();
      await utils.workflow.dashboard.invalidate();
      await utils.workflow.tickets.list.invalidate();
    },
  });

  const createTicket = trpc.workflow.tickets.createFromRequest.useMutation({
    onSuccess: async (data) => {
      toast.success(`Tiket ${data.ticketNo} berhasil diterbitkan dan ditugaskan.`);
      setTicketModalRequest(null);
      await utils.workflow.tickets.list.invalidate();
      await utils.workflow.requests.list.invalidate();
      await utils.workflow.dashboard.invalidate();
    },
  });

  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<any>(null);
  const [ticketModalRequest, setTicketModalRequest] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"auto" | "table" | "cards">("auto");

  // Controlled form states for capture request
  const [sourceValue, setSourceValue] = useState<"marketing" | "owner" | "other">("marketing");
  const [gateDecisionValue, setGateDecisionValue] = useState<GateDecision | "">("lanjut");
  const [similarDesignValue, setSimilarDesignValue] = useState("tidak");
  const [sourceReasonValue, setSourceReasonValue] = useState("Riset pasar");
  const [requestedPriorityValue, setRequestedPriorityValue] = useState<"normal" | "urgent">("normal");

  // Review modal state
  const [reviewGateDecision, setReviewGateDecision] = useState<GateDecision>("lanjut");

  const resetFormStates = () => {
    setGateDecisionValue("lanjut");
    setSimilarDesignValue("tidak");
    setSourceReasonValue("Riset pasar");
    setRequestedPriorityValue("normal");
    setSourceValue("marketing");
    setError("");
  };

  const isInternal = ["spv", "manager", "admin", "superadmin"].includes(user?.appRole || "");
  const canReview = ["spv", "manager", "admin", "superadmin"].includes(user?.appRole || "");
  const canCreate = ["marketing", "owner", "manager", "spv", "admin", "superadmin"].includes(user?.appRole || "");
  const canIssueTicket = ["spv", "manager", "admin", "superadmin"].includes(user?.appRole || "");

  const rows = useMemo(
    () =>
      (query.data || []).filter((item) =>
        `${item.requestNo} ${item.requesterName} ${item.productType} ${item.status} ${item.gateDecision || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [query.data, search]
  );

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const attachment = data.get("referenceFile");
      if (attachment instanceof File && attachment.size > 8 * 1024 * 1024) {
        throw new Error("Ukuran maksimum lampiran referensi adalah 8 MB.");
      }

      const selectedGate = (String(data.get("gateDecision") || "") as GateDecision) || undefined;
      const gateReason = String(data.get("gateReason") || "").trim();

      if (selectedGate && selectedGate !== "lanjut" && !gateReason) {
        throw new Error(`Alasan wajib diisi jika keputusan gerbang adalah ${GATE_DECISION_LABELS[selectedGate]}.`);
      }

      await create.mutateAsync({
        source: sourceValue,
        requesterName: String(data.get("requesterName") || "") || undefined,
        contact: String(data.get("contact") || "") || undefined,
        productType: String(data.get("productType") || ""),
        sizeSpec: String(data.get("sizeSpec") || "") || undefined,
        seriesCount: Number(data.get("seriesCount") || 1),
        theme: String(data.get("theme") || "") || undefined,
        sourceReason: String(data.get("sourceReason") || "") || undefined,
        competitorReference: String(data.get("competitorReference") || "") || undefined,
        productionEstimate: String(data.get("productionEstimate") || "") || undefined,
        targetArea: String(data.get("targetArea") || "") || undefined,
        businessJustification: String(data.get("businessJustification") || "") || undefined,
        similarDesign: String(data.get("similarDesign") || "tidak") as "ya" | "tidak" | "tidak_tahu",
        similarDesignRef: String(data.get("similarDesignRef") || "") || undefined,
        designReuse: (String(data.get("designReuse") || "") as "reuse" | "recolor" | "new") || undefined,
        requestedPriority: requestedPriorityValue,
        urgentReason: String(data.get("urgentReason") || "") || undefined,
        deadline: String(data.get("deadline") || "") || undefined,
        referenceLink: String(data.get("referenceLink") || "") || undefined,
        notes: String(data.get("notes") || "") || undefined,
        gateDecision: selectedGate,
        gateReason: gateReason || undefined,
        internalNotes: String(data.get("internalNotes") || "") || undefined,
        referenceFile:
          attachment instanceof File && attachment.size > 0
            ? {
                fileName: attachment.name,
                contentType: attachment.type || "application/octet-stream",
                dataBase64: await fileToBase64(attachment),
              }
            : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permintaan gagal disimpan.");
    }
  };

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const decision = reviewGateDecision;
      const reason = String(data.get("reason") || "").trim();

      if (decision !== "lanjut" && !reason) {
        throw new Error(`Alasan wajib diisi jika keputusan gerbang adalah ${GATE_DECISION_LABELS[decision]}.`);
      }

      await review.mutateAsync({
        id: reviewing.id,
        decision,
        reason: reason || undefined,
        finalPriority: String(data.get("finalPriority") || "normal") as "normal" | "urgent",
        designReuse: (String(data.get("designReuse") || "") as "reuse" | "recolor" | "new") || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Keputusan gagal disimpan.");
    }
  };

  const submitDirectTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const slotId = Number(data.get("designerSlotId"));
      const brief = String(data.get("brief") || "").trim();

      if (!slotId) {
        throw new Error("Penanggung Jawab Designer wajib dipilih dari Slot 1 sampai 8.");
      }
      if (!brief || brief.length < 5) {
        throw new Error("Brief resmi dari SPV wajib diisi minimal 5 karakter.");
      }

      await createTicket.mutateAsync({
        requestId: ticketModalRequest.id,
        designerSlotId: slotId,
        brief,
        deadline: String(data.get("deadline") || "") || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Penerbitan tiket gagal.");
    }
  };

  const getStatusBadge = (item: any) => {
    const status = item.status;
    const gate = item.gateDecision;

    if (status === "tiket_terbit") {
      return (
        <span className="status-pill success">
          <i /> Tiket Diterbitkan
        </span>
      );
    }
    if (status === "lanjut" || gate === "lanjut" || status === "diterima") {
      return (
        <span className="status-pill success" style={{ background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" }}>
          <CheckCircle2 size={12} style={{ marginRight: 4 }} /> Lanjut (Siap Tiket)
        </span>
      );
    }
    if (status === "tunda" || gate === "tunda" || status === "ditunda") {
      return (
        <span className="status-pill amber">
          <Clock size={12} style={{ marginRight: 4 }} /> Ditunda
        </span>
      );
    }
    if (status === "tolak" || gate === "tolak" || status === "ditolak") {
      return (
        <span className="status-pill danger">
          <XCircle size={12} style={{ marginRight: 4 }} /> Ditolak
        </span>
      );
    }
    if (status === "desain_existing" || gate === "desain_existing") {
      return (
        <span className="status-pill teal" style={{ background: "#f5f3ff", color: "#6b21a8", borderColor: "#ddd6fe" }}>
          <Layers size={12} style={{ marginRight: 4 }} /> Desain Existing
        </span>
      );
    }
    return (
      <span className="status-pill neutral">
        <i /> {REQUEST_STATUS_LABELS[status] || status}
      </span>
    );
  };

  return (
    <>
      <PageTitle
        kicker="FORM CAPTURE & INTAKE"
        title="Capture Permintaan & Tiket Internal"
        subtitle="Form capture internal (Manager/SPV/Admin), evaluasi Gerbang Keputusan, dan penerbitan tiket internal format DES-YYYY-XXX."
        action={
          canCreate ? (
            <Button
              className="button-primary"
              onClick={() => {
                resetFormStates();
                setOpen(true);
              }}
            >
              <FilePlus2 size={15} /> Form Capture Request
            </Button>
          ) : undefined
        }
      />

      <div className="panel">
        <div className="filter-bar">
          <div className="search-input" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={14} color="#8c948b" />
            <input
              className="text-input"
              style={{ border: 0, minHeight: 25, padding: 0, background: "transparent" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor REQ, produk, peminta, keputusan…"
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexWrap: "wrap" }}>
            <div className="view-toggle-bar">
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
                onClick={() => setViewMode("table")}
                title="Tampilan Tabel (Geser Horizontal)"
              >
                <TableIcon size={12} /> Tabel
              </button>
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === "cards" ? "active" : ""}`}
                onClick={() => setViewMode("cards")}
                title="Tampilan Kartu (Responsif Mobile)"
              >
                <LayoutGrid size={12} /> Kartu
              </button>
            </div>
            <span className="section-kicker">{rows.length} PERMINTAAN TERCATAT</span>
          </div>
        </div>

        {query.isLoading ? (
          <div className="loading-block">Memuat data permintaan…</div>
        ) : rows.length ? (
          <>
            {/* Tampilan Tabel (Aktif pada mode table atau mode auto desktop) */}
            <div className={`table-wrap ${viewMode === "auto" ? "desktop-table-only" : viewMode === "table" ? "block" : "hidden"}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>No. Permintaan</th>
                    <th>Peminta & Sumber</th>
                    <th>Detail Produk</th>
                    <th>Estimasi & Justifikasi</th>
                    <th>Prioritas</th>
                    <th>Gerbang Keputusan</th>
                    <th>SLA / Deadline</th>
                    <th>Aksi Operasional</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const readyForTicket = isReadyForTicket(item.status, item.gateDecision);
                    return (
                      <tr key={item.id}>
                        <td>
                          <span className="ticket-link">{item.requestNo}</span>
                          <span className="cell-sub">{formatDate(item.createdAt)}</span>
                        </td>
                        <td>
                          <span className="cell-main">{item.requesterName}</span>
                          <span className="cell-sub" style={{ textTransform: "capitalize" }}>
                            Sumber: {item.source} · {item.sourceReason || "—"}
                          </span>
                        </td>
                        <td>
                          <span className="cell-main">{item.productType}</span>
                          <span className="cell-sub">
                            {item.sizeSpec || "Ukuran standar"} · {item.seriesCount} varian
                          </span>
                          {item.theme && <span className="cell-sub" style={{ fontStyle: "italic" }}>"{item.theme}"</span>}
                        </td>
                        <td>
                          <span className="cell-main" style={{ color: "#0f766e", fontWeight: 600 }}>
                            {item.productionEstimate || "—"}
                          </span>
                          <span className="cell-sub" title={item.businessJustification || ""}>
                            {item.businessJustification
                              ? item.businessJustification.slice(0, 48) + (item.businessJustification.length > 48 ? "…" : "")
                              : item.targetArea || "—"}
                          </span>
                        </td>
                        <td>
                          <PriorityTag priority={item.finalPriority || item.requestedPriority} />
                        </td>
                        <td>
                          {getStatusBadge(item)}
                          {(item.gateReason || item.reviewReason) && (
                            <span
                              className="cell-sub"
                              style={{
                                maxWidth: 220,
                                whiteSpace: "normal",
                                lineHeight: 1.25,
                                marginTop: 4,
                                display: "block",
                              }}
                            >
                              {item.gateReason || item.reviewReason}
                            </span>
                          )}
                        </td>
                        <td>
                          {["baru_masuk", "perlu_dilengkapi"].includes(item.status) && (
                            <SlaPill status="review_spv" processUpdatedAt={item.createdAt} maxHours={item.slaHours} />
                          )}
                          <span className="cell-sub">{formatDate(item.deadline)}</span>
                        </td>
                        <td>
                          {readyForTicket && canIssueTicket ? (
                            <Button
                              size="sm"
                              className="button-primary button-small"
                              style={{ background: "#059669", borderColor: "#047857" }}
                              onClick={() => {
                                setError("");
                                setTicketModalRequest(item);
                              }}
                            >
                              <TicketIcon size={13} style={{ marginRight: 4 }} /> Terbitkan Tiket DES
                            </Button>
                          ) : item.status === "tiket_terbit" ? (
                            <Link className="button-quiet button-small" href="/tickets">
                              Lihat Tiket <ArrowRight size={12} />
                            </Link>
                          ) : canReview && ["baru_masuk", "perlu_dilengkapi"].includes(item.status) ? (
                            <button
                              className="button-secondary button-small"
                              onClick={() => {
                                setError("");
                                setReviewGateDecision("lanjut");
                                setReviewing(item);
                              }}
                            >
                              Gerbang Keputusan
                            </button>
                          ) : (
                            <span className="cell-sub">{item.gateDecision ? GATE_DECISION_LABELS[item.gateDecision as GateDecision] : "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Tampilan Kartu Responsif (Aktif pada mode cards atau mode auto mobile/tablet) */}
            <div className={`mobile-card-list ${viewMode === "auto" ? "mobile-cards-only" : viewMode === "cards" ? "flex" : "hidden"}`}>
              {rows.map((item) => {
                const readyForTicket = isReadyForTicket(item.status, item.gateDecision);
                return (
                  <div key={item.id} className="mobile-data-card">
                    <div className="mobile-card-header">
                      <div>
                        <span className="ticket-link" style={{ fontSize: 13, fontWeight: 700 }}>
                          {item.requestNo}
                        </span>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                          {formatDate(item.createdAt)}
                        </div>
                      </div>
                      <PriorityTag priority={item.finalPriority || item.requestedPriority} />
                    </div>

                    <div className="mobile-card-title">{item.productType}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: -4 }}>
                      {item.sizeSpec || "Ukuran standar"} · {item.seriesCount} varian {item.theme ? `· "${item.theme}"` : ""}
                    </div>

                    <div className="mobile-card-row" style={{ marginTop: 4 }}>
                      <span className="mobile-card-label">Peminta:</span>
                      <span className="mobile-card-val">
                        {item.requesterName} ({item.source})
                      </span>
                    </div>

                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Estimasi:</span>
                      <span className="mobile-card-val" style={{ color: "#0f766e", fontWeight: 600 }}>
                        {item.productionEstimate || "—"}
                      </span>
                    </div>

                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Status Gerbang:</span>
                      <div style={{ textAlign: "right" }}>
                        {getStatusBadge(item)}
                      </div>
                    </div>

                    {(item.gateReason || item.reviewReason) && (
                      <div style={{ fontSize: 10, color: "#64748b", background: "#f8fafc", padding: "6px 8px", borderRadius: 4, border: "1px solid #f1f5f9" }}>
                        <strong>Alasan:</strong> {item.gateReason || item.reviewReason}
                      </div>
                    )}

                    <div className="mobile-card-footer">
                      <span style={{ fontSize: 10, color: "#64748b" }}>
                        Tenggat: {formatDate(item.deadline)}
                      </span>
                      <div>
                        {readyForTicket && canIssueTicket ? (
                          <Button
                            size="sm"
                            className="button-primary button-small"
                            style={{ background: "#059669", borderColor: "#047857" }}
                            onClick={() => {
                              setError("");
                              setTicketModalRequest(item);
                            }}
                          >
                            <TicketIcon size={12} style={{ marginRight: 4 }} /> Terbitkan Tiket
                          </Button>
                        ) : item.status === "tiket_terbit" ? (
                          <Link className="button-quiet button-small" href="/tickets">
                            Lihat Tiket <ArrowRight size={12} />
                          </Link>
                        ) : canReview && ["baru_masuk", "perlu_dilengkapi"].includes(item.status) ? (
                          <button
                            className="button-secondary button-small"
                            onClick={() => {
                              setError("");
                              setReviewGateDecision("lanjut");
                              setReviewing(item);
                            }}
                          >
                            Keputusan
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            title="Belum ada permintaan"
            detail="Gunakan tombol 'Form Capture Request' untuk mencatat kebutuhan internal lengkap dengan data peminta, estimasi produksi, dan gerbang keputusan."
            icon={<ClipboardList size={22} />}
          />
        )}
      </div>

      {/* ================= MODAL CAPTURE REQUEST INTERNAL ================= */}
      {open && (
        <Modal
          title="Form Capture Request Desain Internal"
          detail="Diisi oleh internal (Manager/SPV/Admin). Menampung data peminta, estimasi produksi, justifikasi bisnis, dan Gerbang Keputusan awal."
          onClose={() => {
            setOpen(false);
            setError("");
          }}
          wide
        >
          <form onSubmit={submitRequest} className="form-grid">
            {/* 1. SEKSI DATA PEMINTA */}
            <div className="form-span-2" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 4 }}>
              <strong style={{ fontSize: 13, color: "var(--foreground)", letterSpacing: "0.02em" }}>
                1. DATA PEMINTA (OWNER / MARKETING)
              </strong>
            </div>

            <FormField label="Pihak Peminta *">
              <select
                name="source"
                className="select-input"
                value={sourceValue}
                onChange={(e) => setSourceValue(e.target.value as any)}
                required
              >
                <option value="marketing">Marketing Team</option>
                <option value="owner">Owner / Direksi</option>
                <option value="other">Internal Operasional Lainnya</option>
              </select>
            </FormField>

            <FormField label="Nama Peminta / Kontak Person *">
              <input
                name="requesterName"
                className="text-input"
                required
                placeholder={sourceValue === "owner" ? "Hendro Wijaya (Owner)" : "Dewi Lestari (Marketing)"}
                defaultValue={sourceValue === "owner" ? "Hendro Wijaya" : user?.name || "Dewi Lestari"}
              />
            </FormField>

            <FormField label="Nomor Kontak / WhatsApp">
              <input name="contact" className="text-input" placeholder="0812-xxxx-xxxx" />
            </FormField>

            <FormField label="Prioritas & Urgensi *">
              <select
                name="requestedPriority"
                className="select-input"
                value={requestedPriorityValue}
                onChange={(e) => setRequestedPriorityValue(e.target.value as any)}
              >
                <option value="normal">Normal (Sesuai SLA Reguler)</option>
                <option value="urgent">Urgent (Prioritas Cepat)</option>
              </select>
            </FormField>

            {requestedPriorityValue === "urgent" && (
              <div className="form-span-2">
                <FormField label="Alasan Urgent *" hint="Wajib dijelaskan jika prioritas Urgent">
                  <input
                    name="urgentReason"
                    className="text-input"
                    required
                    placeholder="Contoh: Jadwal pameran expo H-14 / Pesanan buyer siap PO"
                  />
                </FormField>
              </div>
            )}

            {/* 2. SEKSI DETAIL PRODUK */}
            <div className="form-span-2" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 6, margin: "10px 0 4px" }}>
              <strong style={{ fontSize: 13, color: "var(--foreground)", letterSpacing: "0.02em" }}>
                2. DETAIL PRODUK & SPESIFIKASI TEKNIK
              </strong>
            </div>

            <FormField label="Jenis Produk *">
              <select name="productType" className="select-input" required defaultValue="Kemasan">
                <option value="">Pilih Jenis Produk</option>
                {[
                  "Kemasan",
                  "Standing Pouch",
                  "Box Hampers",
                  "Buku Tulis",
                  "Sketchbook",
                  "Binder",
                  "Amplop",
                  "Paperbag",
                  "Kalender Meja",
                  "Stiker / Label",
                  "Kwitansi",
                  "Kertas Kado",
                  "Lainnya",
                ].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Spesifikasi / Dimensi / Material *">
              <input
                name="sizeSpec"
                className="text-input"
                required
                placeholder="Contoh: Foil Matte 14x22 cm, Ivory 230gsm, Ring Kawat"
              />
            </FormField>

            <FormField label="Jumlah Varian / Series">
              <input name="seriesCount" type="number" min="1" defaultValue="1" className="text-input" />
            </FormField>

            <FormField label="Target Deadline Desain">
              <input name="deadline" type="date" className="text-input" />
            </FormField>

            <div className="form-span-2">
              <FormField label="Tema / Konsep Desain Visual *">
                <textarea
                  name="theme"
                  className="text-area"
                  rows={2}
                  required
                  placeholder="Jelaskan konsep visual, moodboard, tone warna (misal: Pastel floral, Rustic vintage, dll.)"
                />
              </FormField>
            </div>

            {/* 3. SEKSI SUMBER, ESTIMASI PRODUKSI & JUSTIFIKASI */}
            <div className="form-span-2" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 6, margin: "10px 0 4px" }}>
              <strong style={{ fontSize: 13, color: "var(--foreground)", letterSpacing: "0.02em" }}>
                3. SUMBER, ESTIMASI PRODUKSI & JUSTIFIKASI EKONOMI
              </strong>
            </div>

            <FormField label="Sumber / Alasan Permintaan *">
              <select
                name="sourceReason"
                className="select-input"
                value={sourceReasonValue}
                onChange={(e) => setSourceReasonValue(e.target.value)}
                required
              >
                {[
                  "Riset pasar",
                  "Permintaan buyer",
                  "Request cabang",
                  "Kompetitor",
                  "Ide internal",
                  "Seasonal",
                  "Rebranding",
                  "Lainnya",
                ].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Estimasi Kebutuhan Produksi *">
              <input
                name="productionEstimate"
                className="text-input"
                required
                placeholder="Contoh: 25.000 pcs / semester atau 10.000 box"
              />
            </FormField>

            <FormField label="Target Area / Cabang Pemasaran *">
              <input name="targetArea" className="text-input" required placeholder="Nasional / Jawa Timur & Bali / Ekspor" />
            </FormField>

            <FormField label="Pemeriksaan Desain Serupa">
              <select
                name="similarDesign"
                className="select-input"
                value={similarDesignValue}
                onChange={(e) => setSimilarDesignValue(e.target.value)}
              >
                <option value="tidak">Tidak ada (Desain Baru)</option>
                <option value="ya">Ya, ada desain serupa</option>
                <option value="tidak_tahu">Belum diketahui</option>
              </select>
            </FormField>

            {similarDesignValue === "ya" && (
              <>
                <FormField label="Nomor DG / Nama Desain Acuan *">
                  <input
                    name="similarDesignRef"
                    className="text-input"
                    required
                    placeholder="Sebutkan nomor DG atau nama desain eksisting"
                  />
                </FormField>
                <FormField label="Rencana Penanganan Desain">
                  <select name="designReuse" className="select-input" defaultValue="recolor">
                    <option value="reuse">Reuse (Gunakan langsung)</option>
                    <option value="recolor">Recolor / Resizing</option>
                    <option value="new">Desain Baru terinspirasi acuan</option>
                  </select>
                </FormField>
              </>
            )}

            <div className="form-span-2">
              <FormField label="Justifikasi Bisnis (Nilai Ekonomi) *">
                <textarea
                  name="businessJustification"
                  className="text-area"
                  rows={2}
                  required
                  placeholder="Mengapa produk ini perlu diproduksi? Apa dampak profitabilitas atau target pasarnya?"
                />
              </FormField>
            </div>

            {sourceReasonValue === "Kompetitor" && (
              <div className="form-span-2">
                <FormField label="Referensi Kompetitor / Pasar">
                  <input
                    name="competitorReference"
                    className="text-input"
                    placeholder="Nama merek acuan, produk pembanding di pasaran"
                  />
                </FormField>
              </div>
            )}

            {/* 4. SEKSI GERBANG KEPUTUSAN INTERNAL */}
            <div
              className="form-span-2"
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "14px 16px",
                background: "rgba(0, 0, 0, 0.015)",
                margin: "10px 0 4px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <CheckCircle2 size={16} color="#059669" />
                <strong style={{ fontSize: 13, color: "var(--foreground)" }}>
                  4. GERBANG KEPUTUSAN INTERNAL (GATE DECISION)
                </strong>
              </div>

              <div className="form-grid">
                <FormField label="Keputusan Gerbang *">
                  <select
                    name="gateDecision"
                    className="select-input"
                    value={gateDecisionValue}
                    onChange={(e) => setGateDecisionValue(e.target.value as any)}
                    required
                  >
                    <option value="lanjut">Lanjut (Lolos Gerbang & Siap Tiket DES)</option>
                    <option value="tunda">Tunda (Tangguhkan sementara)</option>
                    <option value="tolak">Tolak (Tidak dilanjutkan)</option>
                    <option value="desain_existing">Arahkan ke Desain Existing (Gunakan DG Eksisting)</option>
                  </select>
                </FormField>

                <FormField
                  label={`Alasan Keputusan Gerbang ${gateDecisionValue !== "lanjut" ? "*" : "(Opsional)"}`}
                  hint={gateDecisionValue !== "lanjut" ? "Wajib diisi jika selain Lanjut" : undefined}
                >
                  <input
                    name="gateReason"
                    className="text-input"
                    required={gateDecisionValue !== "lanjut"}
                    placeholder={
                      gateDecisionValue === "lanjut"
                        ? "Volume memenuhi kuota & kelayakan terverifikasi"
                        : gateDecisionValue === "tunda"
                          ? "Sebutkan alasan penundaan (misal: kapasitas mesin/jadwal seasonal)"
                          : gateDecisionValue === "tolak"
                            ? "Sebutkan alasan penolakan (misal: MOQ tidak ekonomis)"
                            : "Sebutkan arahan nomor DG eksisting yang akan digunakan"
                    }
                  />
                </FormField>

                <div className="form-span-2">
                  <FormField label="Catatan Tambahan / Internal Notes">
                    <input name="internalNotes" className="text-input" placeholder="Instruksi khusus dari SPV atau Manager" />
                  </FormField>
                </div>
              </div>
            </div>

            {/* 5. SEKSI LAMPIRAN & LINK */}
            <FormField label="Tautan / Path Jaringan (Opsional)">
              <input name="referenceLink" className="text-input" placeholder="https:// atau \\192.168.0.24\..." />
            </FormField>

            <FormField label="Unggah Berkas Acuan (PDF/PNG/JPG)">
              <input name="referenceFile" type="file" className="text-input" accept=".png,.jpg,.jpeg,.pdf" />
            </FormField>

            {error && <div className="form-error form-span-2">{error}</div>}

            <div className="modal-actions form-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" className="button-primary" disabled={create.isPending}>
                {create.isPending ? "Menyimpan…" : "Simpan & Proses Gerbang"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= MODAL REVIEW / GERBANG KEPUTUSAN ================= */}
      {reviewing && (
        <Modal
          title={`Gerbang Keputusan: ${reviewing.requestNo}`}
          detail={`${reviewing.productType} · Peminta: ${reviewing.requesterName} (${reviewing.source})`}
          onClose={() => {
            setReviewing(null);
            setError("");
          }}
        >
          <form onSubmit={submitReview} className="form-grid">
            <FormField label="Keputusan Gerbang *">
              <select
                name="decision"
                className="select-input"
                value={reviewGateDecision}
                onChange={(e) => setReviewGateDecision(e.target.value as any)}
                required
              >
                <option value="lanjut">Lanjut (Siap Diterbitkan Tiket Internal)</option>
                <option value="tunda">Tunda (Penundaan Sementara)</option>
                <option value="tolak">Tolak (Batalkan Permintaan)</option>
                <option value="desain_existing">Arahkan ke Desain Existing</option>
              </select>
            </FormField>

            <FormField label="Prioritas Final">
              <select name="finalPriority" className="select-input" defaultValue={reviewing.requestedPriority || "normal"}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </FormField>

            {reviewGateDecision === "desain_existing" && (
              <div className="form-span-2">
                <FormField label="Penanganan Desain Serupa *">
                  <select name="designReuse" className="select-input" defaultValue={reviewing.designReuse || "reuse"} required>
                    <option value="reuse">Reuse (Gunakan langsung desain eksisting)</option>
                    <option value="recolor">Recolor / Resizing dari template acuan</option>
                    <option value="new">Penyesuaian teks tanpa ubah grafis utama</option>
                  </select>
                </FormField>
              </div>
            )}

            <div className="form-span-2">
              <FormField
                label={`Alasan & Catatan Gerbang Keputusan ${reviewGateDecision !== "lanjut" ? "*" : "(Opsional)"}`}
                hint={reviewGateDecision !== "lanjut" ? "Wajib diisi jika selain Lanjut" : undefined}
              >
                <textarea
                  name="reason"
                  className="text-area"
                  rows={3}
                  required={reviewGateDecision !== "lanjut"}
                  placeholder={
                    reviewGateDecision === "lanjut"
                      ? "Catatan persetujuan (opsional)"
                      : reviewGateDecision === "tunda"
                        ? "Alasan penundaan (misal: antrean mesin atau prioritas musiman)"
                        : reviewGateDecision === "tolak"
                          ? "Alasan penolakan (misal: tidak memenuhi batas MOQ atau profitabilitas)"
                          : "Sebutkan nomor DG eksisting yang diarahkan"
                  }
                  defaultValue={reviewing.gateReason || ""}
                />
              </FormField>
            </div>

            {error && <div className="form-error form-span-2">{error}</div>}

            <div className="modal-actions form-span-2">
              <Button type="button" variant="outline" onClick={() => setReviewing(null)}>
                Batal
              </Button>
              <Button type="submit" className="button-primary" disabled={review.isPending}>
                {review.isPending ? "Menyimpan…" : "Simpan Keputusan"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= MODAL TERBITKAN TIKET INTERNAL (DES-YYYY-XXX) ================= */}
      {ticketModalRequest && (
        <Modal
          title={`Terbitkan Tiket Internal (Format DES-${new Date().getFullYear()}-XXX)`}
          detail={`Permintaan ${ticketModalRequest.requestNo} · ${ticketModalRequest.productType} (${ticketModalRequest.requesterName})`}
          onClose={() => {
            setTicketModalRequest(null);
            setError("");
          }}
          wide
        >
          <form onSubmit={submitDirectTicket} className="form-grid">
            <div
              className="form-span-2"
              style={{
                background: "rgba(5, 150, 105, 0.06)",
                border: "1px solid #bbf7d0",
                padding: "10px 14px",
                borderRadius: 8,
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#166534", fontSize: 13, fontWeight: 600 }}>
                <CheckCircle2 size={15} />
                <span>Status Gerbang: Lolos Lanjut · Nomor Tiket Otomatis DES-{new Date().getFullYear()}-XXX</span>
              </div>
              <small style={{ color: "#15803d", marginTop: 2, display: "block" }}>
                Spesifikasi: {ticketModalRequest.sizeSpec || "Standar"} · Estimasi Produksi: {ticketModalRequest.productionEstimate || "—"}
              </small>
            </div>

            <FormField label="Penanggung Jawab Designer (Wajib Slot 1–8) *">
              <select className="select-input" name="designerSlotId" required defaultValue="">
                <option value="">-- Pilih Slot Designer 1 sampai 8 --</option>
                {(slotsQuery.data || [])
                  .filter((s) => s.slotNumber >= 1 && s.slotNumber <= 8 && s.isActive)
                  .map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      Slot {slot.slotNumber}: {slot.displayName || slot.label}
                    </option>
                  ))}
              </select>
              <small style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                Slot 1 sampai 8 mewakili Designer 1–8 pada tim produksi lokal.
              </small>
            </FormField>

            <FormField label="Target Deadline Draft Desain">
              <input
                className="text-input"
                name="deadline"
                type="date"
                defaultValue={
                  ticketModalRequest.deadline
                    ? new Date(ticketModalRequest.deadline).toISOString().split("T")[0]
                    : ""
                }
              />
            </FormField>

            <div className="form-span-2">
              <FormField label="Brief Resmi dari SPV (Instruksi Kerja Desain) *">
                <textarea
                  className="text-area"
                  name="brief"
                  required
                  rows={4}
                  minLength={5}
                  defaultValue={
                    ticketModalRequest.theme
                      ? `Instruksi pengerjaan: Buat desain ${ticketModalRequest.productType} (${ticketModalRequest.sizeSpec || ""}) dengan konsep ${ticketModalRequest.theme}. Pastikan margin lipatan aman dan bleed 3mm.`
                      : ""
                  }
                  placeholder="Instruksi terinci dari SPV: tema, warna acuan, elemen grafis, spesifikasi bleed/margin, dan batas waktu draft pertama."
                />
              </FormField>
            </div>

            {error && <div className="form-error form-span-2">{error}</div>}

            <div className="modal-actions form-span-2">
              <Button type="button" variant="outline" onClick={() => setTicketModalRequest(null)}>
                Batal
              </Button>
              <Button type="submit" className="button-primary" disabled={createTicket.isPending}>
                {createTicket.isPending ? "Menerbitkan…" : "Terbitkan Tiket Internal"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default RequestsPage;