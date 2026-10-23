import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  CalendarDays,
  CalendarCheck,
  Plus,
  Users,
  FileText,
  CheckCircle2,
  Clock,
  ChevronRight,
  X,
  Search,
  Filter,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Edit2,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  EmptyState,
  FormField,
  PageTitle,
  StatusPill,
  formatDate,
  formatDateTime,
} from "@/modules/common/components/WorkflowUI";
import { Button } from "@/components/ui/button";
import {
  ACC_SESSION_STATUS_LABELS,
  ACC_DECISION_LABELS,
  isValidAccSessionNo,
  formatMonthToAccSessionNo,
  type AccSessionStatus,
  type AccDecisionType,
} from "@shared/workflow";

const DEFAULT_ATTENDEES_PRESETS = [
  "Pak Hendro (Owner)",
  "Budi Santoso (SPV)",
  "Eka Rahmawati (Marketing Lead)",
  "Cindy Permata (Senior Designer)",
  "Fajar Nugraha (QC Specialist)",
];

export function AccSessionsPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const sessionsQuery = trpc.workflow.accSessions.list.useQuery();
  const availableTicketsQuery = trpc.workflow.accSessions.availableTickets.useQuery();
  const sessions = sessionsQuery.data || [];
  const availableTickets = availableTicketsQuery.data || [];

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "completed" | "scheduled">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Add Item to Session State
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | "">("");
  const [itemDecision, setItemDecision] = useState<AccDecisionType>("acc");
  const [itemFileVersion, setItemFileVersion] = useState("v1");
  const [itemNotes, setItemNotes] = useState("");

  // Edit Item Decision State
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editDecision, setEditDecision] = useState<AccDecisionType>("acc");
  const [editNotes, setEditNotes] = useState("");

  // Penutupan modal via tombol Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isCreateOpen) setIsCreateOpen(false);
        if (selectedSessionId !== null) {
          setSelectedSessionId(null);
          setIsAddingItem(false);
          setEditingItemId(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCreateOpen, selectedSessionId]);
  const [editFileVersion, setEditFileVersion] = useState("v1");

  // Create Form State
  const today = new Date();
  const defaultYear = today.getFullYear();
  const defaultMonth = today.getMonth() + 1;
  const [sessionNo, setSessionNo] = useState(formatMonthToAccSessionNo(defaultYear, defaultMonth));
  const [presentationDate, setPresentationDate] = useState(today.toISOString().split("T")[0]);
  const [attendees, setAttendees] = useState<string[]>([
    "Pak Hendro (Owner)",
    "Budi Santoso (SPV)",
    "Eka Rahmawati (Marketing Lead)",
  ]);
  const [newAttendeeInput, setNewAttendeeInput] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [sessionStatus, setSessionStatus] = useState<AccSessionStatus>("completed");

  // Mutations
  const createMutation = trpc.workflow.accSessions.create.useMutation({
    onSuccess: (res) => {
      toast.success(`Sesi ACC ${res.sessionNo} berhasil dicatat.`);
      setIsCreateOpen(false);
      resetCreateForm();
      utils.workflow.accSessions.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Gagal membuat sesi ACC.");
    },
  });

  const addItemMutation = trpc.workflow.accSessions.addItem.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Keputusan berhasil disimpan! Status tiket otomatis disinkronkan ke: ${res.nextProcess?.replaceAll("_", " ")}.`
      );
      setIsAddingItem(false);
      resetAddItemForm();
      utils.workflow.accSessions.detail.invalidate({ id: selectedSessionId! });
      utils.workflow.accSessions.list.invalidate();
      utils.workflow.accSessions.availableTickets.invalidate();
      utils.workflow.tickets.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Gagal menambahkan baris keputusan.");
    },
  });

  const updateItemMutation = trpc.workflow.accSessions.updateItemDecision.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Keputusan diperbarui! Status tiket disinkronkan ke: ${res.nextProcess?.replaceAll("_", " ")}.`
      );
      setEditingItemId(null);
      utils.workflow.accSessions.detail.invalidate({ id: selectedSessionId! });
      utils.workflow.accSessions.list.invalidate();
      utils.workflow.accSessions.availableTickets.invalidate();
      utils.workflow.tickets.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Gagal memperbarui keputusan.");
    },
  });

  const removeItemMutation = trpc.workflow.accSessions.removeItem.useMutation({
    onSuccess: () => {
      toast.success("Baris tiket dihapus dari sesi ACC.");
      utils.workflow.accSessions.detail.invalidate({ id: selectedSessionId! });
      utils.workflow.accSessions.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Gagal menghapus baris item.");
    },
  });

  const updateSessionMutation = trpc.workflow.accSessions.update.useMutation({
    onSuccess: () => {
      toast.success("Status sesi berhasil diperbarui.");
      utils.workflow.accSessions.detail.invalidate({ id: selectedSessionId! });
      utils.workflow.accSessions.list.invalidate();
    },
  });

  const detailQuery = trpc.workflow.accSessions.detail.useQuery(
    { id: selectedSessionId! },
    { enabled: selectedSessionId !== null && selectedSessionId > 0 }
  );

  const resetCreateForm = () => {
    setSessionNo(formatMonthToAccSessionNo(defaultYear, defaultMonth));
    setPresentationDate(today.toISOString().split("T")[0]);
    setAttendees([
      "Pak Hendro (Owner)",
      "Budi Santoso (SPV)",
      "Eka Rahmawati (Marketing Lead)",
    ]);
    setNewAttendeeInput("");
    setGeneralNotes("");
    setSessionStatus("completed");
  };

  const resetAddItemForm = () => {
    setSelectedTicketId("");
    setItemDecision("acc");
    setItemFileVersion("v1");
    setItemNotes("");
  };

  const handleAddAttendee = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (attendees.includes(trimmed)) {
      toast.info("Peserta sudah terdaftar dalam daftar.");
      return;
    }
    setAttendees((prev) => [...prev, trimmed]);
    setNewAttendeeInput("");
  };

  const handleRemoveAttendee = (name: string) => {
    setAttendees((prev) => prev.filter((a) => a !== name));
  };

  const handleDateChange = (dateStr: string) => {
    setPresentationDate(dateStr);
    if (dateStr) {
      const parts = dateStr.split("-");
      if (parts.length >= 2) {
        setSessionNo(`ACC-${parts[0]}-${parts[1]}`);
      }
    }
  };

  const handleTicketSelectChange = (ticketIdVal: number) => {
    setSelectedTicketId(ticketIdVal);
    const chosen = availableTickets.find((t) => t.id === ticketIdVal);
    if (chosen) {
      setItemFileVersion(chosen.latestVersion.split(" ")[0] || "v1");
    }
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAccSessionNo(sessionNo)) {
      toast.error("Format Nomor Sesi harus ACC-YYYY-MM (contoh: ACC-2026-10)");
      return;
    }
    if (!presentationDate) {
      toast.error("Tanggal presentasi wajib diisi.");
      return;
    }
    if (attendees.length === 0) {
      toast.error("Minimal harus menyertakan 1 peserta meeting.");
      return;
    }

    createMutation.mutate({
      sessionNo,
      presentationDate,
      attendees,
      generalNotes: generalNotes.trim() || undefined,
      status: sessionStatus,
    });
  };

  const handleSubmitAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId) return;
    if (!selectedTicketId) {
      toast.error("Pilih tiket desain terlebih dahulu.");
      return;
    }
    if ((itemDecision === "revisi" || itemDecision === "tolak") && !itemNotes.trim()) {
      toast.error(`Wajib mengisi catatan/alasan jika keputusan Owner adalah ${itemDecision === "revisi" ? "Revisi" : "Tolak"}.`);
      return;
    }

    const t = availableTickets.find((tick) => tick.id === Number(selectedTicketId));
    addItemMutation.mutate({
      sessionId: selectedSessionId,
      ticketId: Number(selectedTicketId),
      title: t ? `${t.ticketNo} - ${t.productType}` : `Tiket #${selectedTicketId}`,
      fileVersion: itemFileVersion.trim() || "v1",
      decision: itemDecision,
      notes: itemNotes.trim() || undefined,
    });
  };

  const handleStartEditItem = (item: any) => {
    setEditingItemId(item.id);
    setEditDecision(item.decision);
    setEditNotes(item.notes || "");
    setEditFileVersion(item.fileVersion || "v1");
  };

  const handleSaveEditItem = (itemId: number) => {
    if ((editDecision === "revisi" || editDecision === "tolak") && !editNotes.trim()) {
      toast.error(`Wajib mengisi catatan/alasan jika keputusan Owner adalah ${editDecision === "revisi" ? "Revisi" : "Tolak"}.`);
      return;
    }

    updateItemMutation.mutate({
      itemId,
      decision: editDecision,
      notes: editNotes.trim() || undefined,
      fileVersion: editFileVersion.trim() || "v1",
    });
  };

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filterTab === "completed" && s.status !== "completed") return false;
      if (filterTab === "scheduled" && s.status !== "scheduled") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNo = s.sessionNo.toLowerCase().includes(q);
        const matchNotes = (s.generalNotes || "").toLowerCase().includes(q);
        const matchAttendees = s.attendees.some((a: string) => a.toLowerCase().includes(q));
        if (!matchNo && !matchNotes && !matchAttendees) return false;
      }
      return true;
    });
  }, [sessions, filterTab, searchQuery]);

  // Counts
  const completedCount = sessions.filter((s) => s.status === "completed").length;
  const scheduledCount = sessions.filter((s) => s.status === "scheduled").length;

  return (
    <>
      <PageTitle
        kicker="MONTHLY OWNER PRESENTATION / REVIEW"
        title="Sesi ACC Bulanan"
        subtitle="Manajemen sesi presentasi berkala desain lokal dengan Owner & pencatatan baris keputusan desain terintegrasi."
        action={
          <Button
            className="button-primary"
            onClick={() => {
              resetCreateForm();
              setIsCreateOpen(true);
            }}
          >
            <Plus size={14} /> Buat Sesi ACC Baru
          </Button>
        }
      />

      {/* Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          margin: "-5px 0 20px",
        }}
      >
        <div className="detail-card" style={{ padding: "14px 16px" }}>
          <span style={{ fontSize: 9, font: "var(--mono)", color: "#64748b", textTransform: "uppercase" }}>
            Total Sesi ACC
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <strong style={{ fontSize: 24, color: "var(--teal, #0f766e)" }}>{sessions.length}</strong>
            <small style={{ color: "#64748b" }}>Presentasi Terdata</small>
          </div>
        </div>

        <div className="detail-card" style={{ padding: "14px 16px" }}>
          <span style={{ fontSize: 9, font: "var(--mono)", color: "#64748b", textTransform: "uppercase" }}>
            Sesi Terlaksana
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <strong style={{ fontSize: 24, color: "#16a34a" }}>{completedCount}</strong>
            <small style={{ color: "#64748b" }}>Selesai Disahkan</small>
          </div>
        </div>

        <div className="detail-card" style={{ padding: "14px 16px" }}>
          <span style={{ fontSize: 9, font: "var(--mono)", color: "#64748b", textTransform: "uppercase" }}>
            Sesi Terjadwal
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <strong style={{ fontSize: 24, color: "#2563eb" }}>{scheduledCount}</strong>
            <small style={{ color: "#64748b" }}>Akan Datang</small>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`button-small ${filterTab === "all" ? "button-primary" : "button-secondary"}`}
            onClick={() => setFilterTab("all")}
          >
            Semua Sesi ({sessions.length})
          </button>
          <button
            className={`button-small ${filterTab === "completed" ? "button-primary" : "button-secondary"}`}
            onClick={() => setFilterTab("completed")}
          >
            <CheckCircle2 size={12} /> Selesai ({completedCount})
          </button>
          <button
            className={`button-small ${filterTab === "scheduled" ? "button-primary" : "button-secondary"}`}
            onClick={() => setFilterTab("scheduled")}
          >
            <Clock size={12} /> Terjadwal ({scheduledCount})
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Search size={14} style={{ color: "#64748b" }} />
          <input
            className="text-input"
            style={{ width: 220, fontSize: 11, padding: "5px 9px" }}
            placeholder="Cari nomor sesi, peserta, catatan…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Sessions List */}
      <div className="panel">
        {sessionsQuery.isLoading ? (
          <div className="loading-block">Memuat riwayat sesi ACC…</div>
        ) : filteredSessions.length > 0 ? (
          <div style={{ display: "grid", gap: 12, padding: "12px" }}>
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--line, #e2e8f0)",
                  background: "#ffffff",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "var(--mono)",
                          background: "#f1f5f9",
                          padding: "3px 8px",
                          borderRadius: 4,
                          border: "1px solid #cbd5e1",
                          color: "#0f172a",
                        }}
                      >
                        {session.sessionNo}
                      </span>
                      {session.status === "completed" ? (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 4,
                            background: "#dcfce7",
                            color: "#15803d",
                            border: "1px solid #86efac",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <CheckCircle2 size={11} /> SELESAI
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 4,
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            border: "1px solid #93c5fd",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <Clock size={11} /> TERJADWAL
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, color: "#64748b", fontSize: 11 }}>
                      <CalendarDays size={13} />
                      <span>
                        Tanggal Presentasi: <strong>{formatDate(session.presentationDate)}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Dicatat oleh: <strong>{session.recorderName}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Item Dibahas: <strong>{session.itemsCount} Desain</strong>
                      </span>
                    </div>
                  </div>

                  <Button
                    className="button-primary button-small"
                    onClick={() => {
                      setSelectedSessionId(session.id);
                      setIsAddingItem(false);
                      setEditingItemId(null);
                    }}
                  >
                    Buka Rincian Keputusan <ChevronRight size={13} />
                  </Button>
                </div>

                {/* Attendees list */}
                <div>
                  <span style={{ fontSize: 9, font: "var(--mono)", color: "#64748b", textTransform: "uppercase" }}>
                    Daftar Peserta Meeting ({session.attendees.length}):
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {session.attendees.map((attendee: string) => (
                      <span
                        key={attendee}
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 12,
                          background: attendee.includes("Owner") ? "#fef3c7" : "#f1f5f9",
                          color: attendee.includes("Owner") ? "#92400e" : "#334155",
                          border: attendee.includes("Owner") ? "1px solid #fde68a" : "1px solid #e2e8f0",
                          fontWeight: attendee.includes("Owner") ? 600 : 400,
                        }}
                      >
                        {attendee}
                      </span>
                    ))}
                  </div>
                </div>

                {/* General Notes Snippet */}
                {session.generalNotes && (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "#f8fafc",
                      borderRadius: 6,
                      border: "1px solid #f1f5f9",
                      fontSize: 11,
                      color: "#334155",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: "#0f766e", display: "block", marginBottom: 2 }}>
                      Catatan & Hasil Diskusi Meeting:
                    </strong>
                    {session.generalNotes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Belum ada Sesi ACC Bulanan"
            detail="Buat sesi baru untuk mencatat presentasi desain bulanan bersama Owner dan tim."
            icon={<CalendarCheck size={24} />}
          />
        )}
      </div>

      {/* MODAL: BUAT SESI ACC BARU */}
      {isCreateOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsCreateOpen(false);
          }}
        >
          <div className="modal-panel" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">SESI PRESENTASI BULANAN</p>
                <h2 style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 6 }}>
                  <CalendarCheck size={18} /> Buat Sesi ACC Bulanan Baru
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Tutup"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-content">
              <form onSubmit={handleSubmitCreate}>
              <div style={{ display: "grid", gap: 12 }}>
                {/* Session Number & Preset Helpers */}
                <FormField
                  label="Nomor Sesi (Format: ACC-YYYY-MM)"
                  hint="Contoh penamaan standar: ACC-2026-10"
                >
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="text-input"
                      value={sessionNo}
                      onChange={(e) => setSessionNo(e.target.value)}
                      placeholder="ACC-2026-10"
                      required
                    />
                    <Button
                      type="button"
                      className="button-secondary button-small"
                      onClick={() => setSessionNo(formatMonthToAccSessionNo(defaultYear, defaultMonth))}
                    >
                      Bulan Ini
                    </Button>
                    <Button
                      type="button"
                      className="button-secondary button-small"
                      onClick={() => {
                        const nextMonth = defaultMonth === 12 ? 1 : defaultMonth + 1;
                        const nextYear = defaultMonth === 12 ? defaultYear + 1 : defaultYear;
                        setSessionNo(formatMonthToAccSessionNo(nextYear, nextMonth));
                      }}
                    >
                      Bulan Depan
                    </Button>
                  </div>
                </FormField>

                {/* Presentation Date & Status */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <FormField label="Tanggal Presentasi">
                    <input
                      type="date"
                      className="text-input"
                      value={presentationDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      required
                    />
                  </FormField>

                  <FormField label="Status Sesi">
                    <select
                      className="text-input"
                      value={sessionStatus}
                      onChange={(e) => setSessionStatus(e.target.value as AccSessionStatus)}
                    >
                      <option value="completed">Selesai (Sudah Dilaksanakan)</option>
                      <option value="scheduled">Terjadwal (Akan Datang)</option>
                    </select>
                  </FormField>
                </div>

                {/* Attendees Tagging */}
                <div>
                  <label style={{ display: "block", fontSize: 10, font: "var(--mono)", color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>
                    Daftar Peserta Meeting (Owner, SPV, Designer, Marketing)
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {attendees.map((attendee) => (
                      <span
                        key={attendee}
                        style={{
                          fontSize: 10,
                          padding: "3px 8px",
                          borderRadius: 12,
                          background: attendee.includes("Owner") ? "#fef3c7" : "#f1f5f9",
                          color: attendee.includes("Owner") ? "#92400e" : "#334155",
                          border: "1px solid #cbd5e1",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {attendee}
                        <button
                          type="button"
                          onClick={() => handleRemoveAttendee(attendee)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Quick Add Presets */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    <small style={{ fontSize: 9, color: "#64748b", width: "100%", display: "block" }}>
                      Tambah cepat peserta standar:
                    </small>
                    {DEFAULT_ATTENDEES_PRESETS.map((preset) => (
                      <button
                        type="button"
                        key={preset}
                        className="button-quiet button-small"
                        style={{ fontSize: 9, padding: "2px 6px" }}
                        onClick={() => handleAddAttendee(preset)}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>

                  {/* Manual Add Input */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="text-input"
                      placeholder="Ketik nama / jabatan peserta baru…"
                      value={newAttendeeInput}
                      onChange={(e) => setNewAttendeeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddAttendee(newAttendeeInput);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="button-secondary button-small"
                      onClick={() => handleAddAttendee(newAttendeeInput)}
                    >
                      Tambah
                    </Button>
                  </div>
                </div>

                {/* General Notes */}
                <FormField
                  label="Catatan Umum & Notulen Meeting"
                  hint="Rangkuman poin penting, arahan Owner, atau tindak lanjut desain."
                >
                  <textarea
                    className="text-area"
                    style={{ minHeight: 70 }}
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    placeholder="Contoh: Owner meng-ACC seri cover Botanical dan Amplop Lebaran. Revisi pada ketebalan foil emas dan saturasi warna 5%..."
                  />
                </FormField>

                <div className="modal-actions" style={{ marginTop: 10 }}>
                  <Button
                    type="button"
                    className="button-secondary"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    className="button-primary"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? "Menyimpan…" : "Simpan Sesi ACC"}
                  </Button>
                </div>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / VIEW: RINCIAN SESI ACC & BARIS KEPUTUSAN TIKET */}
      {selectedSessionId !== null && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedSessionId(null);
              setIsAddingItem(false);
              setEditingItemId(null);
            }
          }}
        >
          <div className="modal-panel modal-wide" style={{ maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
            {detailQuery.isLoading ? (
              <div className="loading-block">Memuat rincian sesi…</div>
            ) : detailQuery.data ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
                {/* Header Sesi (Fixed Top) */}
                <div className="modal-header">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          fontFamily: "var(--mono)",
                          background: "#f1f5f9",
                          padding: "4px 9px",
                          borderRadius: 4,
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        {detailQuery.data.sessionNo}
                      </span>
                      {detailQuery.data.status === "completed" ? (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 4,
                            background: "#dcfce7",
                            color: "#15803d",
                            border: "1px solid #86efac",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <CheckCircle2 size={12} /> SELESAI
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 4,
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            border: "1px solid #93c5fd",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Clock size={12} /> TERJADWAL
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b" }}>
                      Tanggal: <strong>{formatDate(detailQuery.data.presentationDate)}</strong> · Notulis: <strong>{detailQuery.data.recorderName}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => {
                      setSelectedSessionId(null);
                      setIsAddingItem(false);
                      setEditingItemId(null);
                    }}
                    aria-label="Tutup"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal Content Scrollable Area */}
                <div className="modal-content" style={{ flex: 1, overflowY: "auto" }}>
                  <div style={{ display: "grid", gap: 14 }}>
                  {/* Peserta & Notulen Umum */}
                  <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      <strong style={{ fontSize: 10, font: "var(--mono)", color: "#64748b", textTransform: "uppercase", width: "100%" }}>
                        Peserta Rapat Hadir:
                      </strong>
                      {detailQuery.data.attendees.map((a: string) => (
                        <span
                          key={a}
                          style={{
                            fontSize: 10,
                            padding: "2px 7px",
                            borderRadius: 12,
                            background: a.includes("Owner") ? "#fef3c7" : "#ffffff",
                            color: a.includes("Owner") ? "#92400e" : "#334155",
                            border: a.includes("Owner") ? "1px solid #fde68a" : "1px solid #cbd5e1",
                            fontWeight: a.includes("Owner") ? 600 : 400,
                          }}
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                    {detailQuery.data.generalNotes && (
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        <strong style={{ color: "#0f766e" }}>Arahan Umum Owner: </strong>
                        {detailQuery.data.generalNotes}
                      </p>
                    )}
                  </div>

                  {/* KARTU REKAPITULASI & RINGKASAN LAPORAN SESI */}
                  {(() => {
                    const sessionItems = detailQuery.data.items || [];
                    const totalItems = sessionItems.length;
                    const accCount = sessionItems.filter((i: any) => i.decision === "acc").length;
                    const accCatatanCount = sessionItems.filter((i: any) => i.decision === "acc_catatan").length;
                    const revisiCount = sessionItems.filter((i: any) => i.decision === "revisi").length;
                    const tolakCount = sessionItems.filter((i: any) => i.decision === "tolak").length;
                    const approvalRate = totalItems > 0 ? Math.round(((accCount + accCatatanCount) / totalItems) * 100) : 0;

                    return (
                      <div
                        style={{
                          padding: "12px 14px",
                          background: "#ffffff",
                          borderRadius: 8,
                          border: "1px solid var(--line, #e2e8f0)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <strong style={{ fontSize: 11, font: "var(--mono)", color: "#475569", textTransform: "uppercase" }}>
                            Rekapitulasi Keputusan Presentasi Bulanan
                          </strong>
                          {totalItems > 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 4,
                                background: approvalRate >= 70 ? "#dcfce7" : "#fef3c7",
                                color: approvalRate >= 70 ? "#15803d" : "#92400e",
                              }}
                            >
                              Approval Rate: {approvalRate}%
                            </span>
                          )}
                        </div>

                        <div className="acc-recap-grid">
                          <div style={{ padding: "8px 4px", borderRadius: 6, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                            <span style={{ fontSize: 9, font: "var(--mono)", color: "#64748b", textTransform: "uppercase", display: "block" }}>
                              Total Desain
                            </span>
                            <strong style={{ fontSize: 18, color: "#0f172a", marginTop: 2, display: "block" }}>
                              {totalItems}
                            </strong>
                          </div>

                          <div style={{ padding: "8px 4px", borderRadius: 6, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                            <span style={{ fontSize: 9, font: "var(--mono)", color: "#166534", textTransform: "uppercase", display: "block" }}>
                              ACC
                            </span>
                            <strong style={{ fontSize: 18, color: "#15803d", marginTop: 2, display: "block" }}>
                              {accCount}
                            </strong>
                          </div>

                          <div style={{ padding: "8px 4px", borderRadius: 6, background: "#fefce8", border: "1px solid #fef08a" }}>
                            <span style={{ fontSize: 9, font: "var(--mono)", color: "#854d0e", textTransform: "uppercase", display: "block" }}>
                              ACC Catatan
                            </span>
                            <strong style={{ fontSize: 18, color: "#a16207", marginTop: 2, display: "block" }}>
                              {accCatatanCount}
                            </strong>
                          </div>

                          <div style={{ padding: "8px 4px", borderRadius: 6, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                            <span style={{ fontSize: 9, font: "var(--mono)", color: "#9a3412", textTransform: "uppercase", display: "block" }}>
                              Revisi
                            </span>
                            <strong style={{ fontSize: 18, color: "#c2410c", marginTop: 2, display: "block" }}>
                              {revisiCount}
                            </strong>
                          </div>

                          <div style={{ padding: "8px 4px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fecaca" }}>
                            <span style={{ fontSize: 9, font: "var(--mono)", color: "#991b1b", textTransform: "uppercase", display: "block" }}>
                              Ditolak
                            </span>
                            <strong style={{ fontSize: 18, color: "#b91c1c", marginTop: 2, display: "block" }}>
                              {tolakCount}
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* SECTION: BARIS KEPUTUSAN TIKET (ACC_SESSION_ITEMS) */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                          <FileText size={15} /> Baris Keputusan Tiket Desain ({detailQuery.data.items?.length || 0})
                        </h3>
                        <p className="form-helper" style={{ margin: "2px 0 0" }}>
                          Setiap keputusan (ACC, ACC Catatan, Revisi, Tolak) akan menyinkronkan status tiket secara otomatis.
                        </p>
                      </div>

                      {!isAddingItem && (
                        <Button
                          className="button-primary button-small"
                          onClick={() => {
                            resetAddItemForm();
                            setIsAddingItem(true);
                          }}
                        >
                          <Plus size={13} /> Tambah Tiket ke Sesi
                        </Button>
                      )}
                    </div>

                    {/* FORM TAMBAH ITEM KE SESI */}
                    {isAddingItem && (
                      <div
                        style={{
                          padding: 12,
                          background: "#eff6ff",
                          borderRadius: 6,
                          border: "1px solid #bfdbfe",
                          marginBottom: 12,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <strong style={{ fontSize: 11, color: "#1e40af" }}>
                            Form Keputusan Desain (Presentasi Owner)
                          </strong>
                          <button
                            type="button"
                            className="button-quiet button-small"
                            onClick={() => setIsAddingItem(false)}
                          >
                            <X size={13} />
                          </button>
                        </div>

                        <form onSubmit={handleSubmitAddItem}>
                          <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                              <FormField label="Pilih Tiket Desain">
                                <select
                                  className="text-input"
                                  value={selectedTicketId}
                                  onChange={(e) => handleTicketSelectChange(Number(e.target.value))}
                                  required
                                >
                                  <option value="">-- Pilih Tiket yang Dipresentasikan --</option>
                                  {availableTickets.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.ticketNo} - {t.productType} [{t.processStatus}] ({t.latestVersion})
                                    </option>
                                  ))}
                                </select>
                              </FormField>

                              <FormField label="Versi File">
                                <input
                                  className="text-input"
                                  value={itemFileVersion}
                                  onChange={(e) => setItemFileVersion(e.target.value)}
                                  placeholder="Contoh: v1, v2"
                                  required
                                />
                              </FormField>
                            </div>

                            {/* Pilihan Keputusan Owner */}
                            <div>
                              <label style={{ display: "block", fontSize: 10, font: "var(--mono)", color: "#1e40af", textTransform: "uppercase", marginBottom: 4 }}>
                                Keputusan Owner:
                              </label>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                                <label
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 3,
                                    padding: "6px 8px",
                                    borderRadius: 6,
                                    border: itemDecision === "acc" ? "2px solid #16a34a" : "1px solid #cbd5e1",
                                    background: itemDecision === "acc" ? "#f0fdf4" : "#ffffff",
                                    cursor: "pointer",
                                    fontSize: 10,
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <input
                                      type="radio"
                                      name="decision"
                                      value="acc"
                                      checked={itemDecision === "acc"}
                                      onChange={() => setItemDecision("acc")}
                                    />
                                    <strong style={{ color: "#15803d" }}>ACC</strong>
                                  </div>
                                  <span style={{ fontSize: 9, color: "#64748b" }}>Lanjut ke JOS-D</span>
                                </label>

                                <label
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 3,
                                    padding: "6px 8px",
                                    borderRadius: 6,
                                    border: itemDecision === "acc_catatan" ? "2px solid #ca8a04" : "1px solid #cbd5e1",
                                    background: itemDecision === "acc_catatan" ? "#fefce8" : "#ffffff",
                                    cursor: "pointer",
                                    fontSize: 10,
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <input
                                      type="radio"
                                      name="decision"
                                      value="acc_catatan"
                                      checked={itemDecision === "acc_catatan"}
                                      onChange={() => setItemDecision("acc_catatan")}
                                    />
                                    <strong style={{ color: "#a16207" }}>ACC + Catatan</strong>
                                  </div>
                                  <span style={{ fontSize: 9, color: "#64748b" }}>Lanjut JOS-D dgn catatan</span>
                                </label>

                                <label
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 3,
                                    padding: "6px 8px",
                                    borderRadius: 6,
                                    border: itemDecision === "revisi" ? "2px solid #ea580c" : "1px solid #cbd5e1",
                                    background: itemDecision === "revisi" ? "#fff7ed" : "#ffffff",
                                    cursor: "pointer",
                                    fontSize: 10,
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <input
                                      type="radio"
                                      name="decision"
                                      value="revisi"
                                      checked={itemDecision === "revisi"}
                                      onChange={() => setItemDecision("revisi")}
                                    />
                                    <strong style={{ color: "#c2410c" }}>Revisi</strong>
                                  </div>
                                  <span style={{ fontSize: 9, color: "#64748b" }}>Kembali ke Desainer</span>
                                </label>

                                <label
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 3,
                                    padding: "6px 8px",
                                    borderRadius: 6,
                                    border: itemDecision === "tolak" ? "2px solid #dc2626" : "1px solid #cbd5e1",
                                    background: itemDecision === "tolak" ? "#fef2f2" : "#ffffff",
                                    cursor: "pointer",
                                    fontSize: 10,
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <input
                                      type="radio"
                                      name="decision"
                                      value="tolak"
                                      checked={itemDecision === "tolak"}
                                      onChange={() => setItemDecision("tolak")}
                                    />
                                    <strong style={{ color: "#b91c1c" }}>Tolak</strong>
                                  </div>
                                  <span style={{ fontSize: 9, color: "#64748b" }}>Desain Ditolak</span>
                                </label>
                              </div>
                            </div>

                            <FormField
                              label={
                                itemDecision === "revisi" || itemDecision === "tolak"
                                  ? "Catatan / Alasan Keputusan (Wajib Diisi)"
                                  : "Catatan / Arahan Khusus Owner (Opsional)"
                              }
                            >
                              <textarea
                                className="text-area"
                                style={{ minHeight: 45 }}
                                value={itemNotes}
                                onChange={(e) => setItemNotes(e.target.value)}
                                placeholder={
                                  itemDecision === "revisi"
                                    ? "Wajib: Tuliskan butir revisi yang diminta Owner agar desainer dapat memperbaiki..."
                                    : itemDecision === "tolak"
                                      ? "Wajib: Tuliskan alasan penolakan desain..."
                                      : "Catatan tambahan atau persetujuan khusus dari Owner..."
                                }
                                required={itemDecision === "revisi" || itemDecision === "tolak"}
                              />
                            </FormField>

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
                              <Button
                                type="button"
                                className="button-secondary button-small"
                                onClick={() => setIsAddingItem(false)}
                              >
                                Batal
                              </Button>
                              <Button
                                type="submit"
                                className="button-primary button-small"
                                disabled={addItemMutation.isPending}
                              >
                                {addItemMutation.isPending ? "Menyimpan…" : "Simpan & Sinkronkan Tiket"}
                              </Button>
                            </div>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* DAFTAR BARIS ITEM KEPUTUSAN */}
                    {detailQuery.data.items && detailQuery.data.items.length > 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {detailQuery.data.items.map((it: any) => {
                          const isEditing = editingItemId === it.id;

                          return (
                            <div
                              key={it.id}
                              style={{
                                padding: "10px 12px",
                                borderRadius: 6,
                                background: "#ffffff",
                                border: "1px solid var(--line, #e2e8f0)",
                                display: "grid",
                                gap: 6,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    {it.ticketNo && (
                                      <Link
                                        href={`/tickets/${it.ticketId}`}
                                        style={{
                                          fontSize: 10,
                                          fontFamily: "var(--mono)",
                                          fontWeight: 700,
                                          color: "#0f766e",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 2,
                                        }}
                                      >
                                        {it.ticketNo} <ExternalLink size={10} />
                                      </Link>
                                    )}
                                    <strong style={{ fontSize: 11 }}>{it.title}</strong>
                                    {it.fileVersion && (
                                      <span
                                        style={{
                                          fontSize: 9,
                                          padding: "1px 6px",
                                          borderRadius: 4,
                                          background: "#f1f5f9",
                                          color: "#475569",
                                          fontFamily: "var(--mono)",
                                        }}
                                      >
                                        Berkas {it.fileVersion}
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                                    <span style={{ fontSize: 9, color: "#64748b" }}>Status Tiket:</span>
                                    {it.processStatus && <StatusPill status={it.processStatus} />}
                                  </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: "3px 8px",
                                      borderRadius: 4,
                                      background:
                                        it.decision === "acc"
                                          ? "#16a34a"
                                          : it.decision === "acc_catatan"
                                            ? "#ca8a04"
                                            : it.decision === "revisi"
                                              ? "#ea580c"
                                              : it.decision === "tolak"
                                                ? "#dc2626"
                                                : "#64748b",
                                      color: "#ffffff",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {ACC_DECISION_LABELS[it.decision as AccDecisionType] || it.decision}
                                  </span>

                                  {!isEditing && (
                                    <>
                                      <button
                                        type="button"
                                        className="button-quiet button-small"
                                        style={{ padding: 4 }}
                                        onClick={() => handleStartEditItem(it)}
                                        title="Ubah Keputusan"
                                      >
                                        <Edit2 size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        className="button-quiet button-small"
                                        style={{ padding: 4, color: "#dc2626" }}
                                        onClick={() => {
                                          if (window.confirm(`Hapus baris ${it.title} dari sesi ini?`)) {
                                            removeItemMutation.mutate({ itemId: it.id });
                                          }
                                        }}
                                        title="Hapus dari Sesi"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Catatan item jika tidak dalam mode edit */}
                              {!isEditing && it.notes && (
                                <div style={{ fontSize: 11, color: "#334155", background: "#f8fafc", padding: "6px 8px", borderRadius: 4 }}>
                                  <strong>Arahan Owner:</strong> {it.notes}
                                </div>
                              )}

                              {/* Form Edit Keputusan In-Place */}
                              {isEditing && (
                                <div
                                  style={{
                                    marginTop: 6,
                                    padding: 8,
                                    background: "#f8fafc",
                                    borderRadius: 6,
                                    border: "1px solid #cbd5e1",
                                    display: "grid",
                                    gap: 6,
                                  }}
                                >
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <div style={{ flex: 1 }}>
                                      <label style={{ fontSize: 9, font: "var(--mono)", color: "#64748b", display: "block" }}>
                                        Ubah Keputusan:
                                      </label>
                                      <select
                                        className="text-input"
                                        value={editDecision}
                                        onChange={(e) => setEditDecision(e.target.value as AccDecisionType)}
                                        style={{ fontSize: 11, padding: "4px 8px" }}
                                      >
                                        <option value="acc">ACC (Lanjut Menunggu JOS-D)</option>
                                        <option value="acc_catatan">ACC + Catatan (Lanjut Menunggu JOS-D)</option>
                                        <option value="revisi">Revisi (Kembali ke Desainer)</option>
                                        <option value="tolak">Tolak (Dibatalkan)</option>
                                      </select>
                                    </div>
                                    <div style={{ width: 120 }}>
                                      <label style={{ fontSize: 9, font: "var(--mono)", color: "#64748b", display: "block" }}>
                                        Versi Berkas:
                                      </label>
                                      <input
                                        className="text-input"
                                        value={editFileVersion}
                                        onChange={(e) => setEditFileVersion(e.target.value)}
                                        style={{ fontSize: 11, padding: "4px 8px" }}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label style={{ fontSize: 9, font: "var(--mono)", color: "#64748b", display: "block" }}>
                                      Catatan / Arahan (Wajib jika Revisi / Tolak):
                                    </label>
                                    <input
                                      className="text-input"
                                      value={editNotes}
                                      onChange={(e) => setEditNotes(e.target.value)}
                                      placeholder="Tuliskan catatan arahan owner..."
                                      style={{ fontSize: 11, padding: "4px 8px" }}
                                    />
                                  </div>

                                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                                    <Button
                                      type="button"
                                      className="button-secondary button-small"
                                      onClick={() => setEditingItemId(null)}
                                    >
                                      Batal
                                    </Button>
                                    <Button
                                      type="button"
                                      className="button-primary button-small"
                                      onClick={() => handleSaveEditItem(it.id)}
                                      disabled={updateItemMutation.isPending}
                                    >
                                      Simpan Perubahan
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "16px",
                          textAlign: "center",
                          background: "#f8fafc",
                          borderRadius: 6,
                          border: "1px dashed #cbd5e1",
                          color: "#64748b",
                          fontSize: 11,
                        }}
                      >
                        Belum ada tiket desain yang dimasukkan ke sesi ini. Klik tombol <strong>"+ Tambah Tiket ke Sesi"</strong> di atas untuk mencatat keputusan presentasi.
                      </div>
                    )}
                  </div>

                  <div className="modal-actions" style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
                    <div>
                      {detailQuery.data.status === "scheduled" && (
                        <Button
                          className="button-secondary button-small"
                          onClick={() => {
                            if (window.confirm("Tandai sesi ini sebagai Selesai dilaksanakan?")) {
                              updateSessionMutation.mutate({
                                id: detailQuery.data.id,
                                status: "completed",
                              });
                            }
                          }}
                        >
                          <CheckCircle2 size={12} /> Tandai Sesi Selesai Dilaksanakan
                        </Button>
                      )}
                    </div>
                    <Button
                      className="button-primary"
                      onClick={() => {
                        setSelectedSessionId(null);
                        setIsAddingItem(false);
                        setEditingItemId(null);
                      }}
                    >
                      Selesai & Tutup
                    </Button>
                  </div>
                </div>
                </div>
              </div>
            ) : (
              <div className="form-error">Sesi tidak ditemukan.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default AccSessionsPage;
