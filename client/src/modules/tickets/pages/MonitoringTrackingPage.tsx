import { useMemo, useState, useRef } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Kanban,
  Search,
  Filter,
  RefreshCw,
  ArrowRight,
  RotateCcw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Layers,
  User,
  Sparkles,
  Calendar,
  Table as TableIcon,
  ShieldCheck,
  FileCheck,
  Send,
  Eye,
  Check,
  MoreVertical,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PriorityTag, SlaPill } from "@/modules/common/components/WorkflowUI";
import { PROCESS_LABELS, type ProcessStatus } from "@shared/workflow";

// 10 Kanban Workflow Stages specified by product requirements
export type KanbanStageId =
  | "draft"
  | "review_spv"
  | "menunggu_acc_owner"
  | "revisi"
  | "qc_spv"
  | "qc1"
  | "qc2"
  | "siap_upload"
  | "uploaded"
  | "closed";

export interface KanbanColumnDef {
  id: KanbanStageId;
  title: string;
  badgeTone: string;
  colorClass: string;
  borderClass: string;
  headerBgClass: string;
  description: string;
  icon: typeof Clock;
  nextStage?: ProcessStatus;
  canRevise?: boolean;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    id: "draft",
    title: "Draft Desain",
    badgeTone: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    colorClass: "border-slate-300 dark:border-slate-700",
    borderClass: "border-t-slate-500",
    headerBgClass: "bg-slate-50 dark:bg-slate-900/60",
    description: "Pengerjaan visual awal oleh desainer",
    icon: Sparkles,
    nextStage: "review_spv",
  },
  {
    id: "review_spv",
    title: "Review SPV",
    badgeTone: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
    colorClass: "border-amber-300 dark:border-amber-700",
    borderClass: "border-t-amber-500",
    headerBgClass: "bg-amber-50/50 dark:bg-amber-950/30",
    description: "Evaluasi kualitas awal oleh Supervisor",
    icon: Eye,
    nextStage: "menunggu_acc_owner",
    canRevise: true,
  },
  {
    id: "menunggu_acc_owner",
    title: "Menunggu ACC Owner",
    badgeTone: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
    colorClass: "border-purple-300 dark:border-purple-700",
    borderClass: "border-t-purple-500",
    headerBgClass: "bg-purple-50/50 dark:bg-purple-950/30",
    description: "Persetujuan desain oleh Owner / Manajemen",
    icon: ShieldCheck,
    nextStage: "qc_spv",
    canRevise: true,
  },
  {
    id: "revisi",
    title: "Revisi Desain",
    badgeTone: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
    colorClass: "border-rose-300 dark:border-rose-700",
    borderClass: "border-t-rose-500",
    headerBgClass: "bg-rose-50/50 dark:bg-rose-950/30",
    description: "Perbaikan berdasarkan catatan evaluasi",
    icon: RotateCcw,
    nextStage: "review_spv",
  },
  {
    id: "qc_spv",
    title: "QC SPV Prepress",
    badgeTone: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
    colorClass: "border-blue-300 dark:border-blue-700",
    borderClass: "border-t-blue-500",
    headerBgClass: "bg-blue-50/50 dark:bg-blue-950/30",
    description: "Validasi kesiapan cetak & prepress oleh SPV",
    icon: FileCheck,
    nextStage: "qc1",
    canRevise: true,
  },
  {
    id: "qc1",
    title: "QC Checker 1",
    badgeTone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200",
    colorClass: "border-cyan-300 dark:border-cyan-700",
    borderClass: "border-t-cyan-500",
    headerBgClass: "bg-cyan-50/50 dark:bg-cyan-950/30",
    description: "Cek teks, bleed, dimensi & layout",
    icon: CheckCircle2,
    nextStage: "qc2",
    canRevise: true,
  },
  {
    id: "qc2",
    title: "QC Checker 2",
    badgeTone: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
    colorClass: "border-teal-300 dark:border-teal-700",
    borderClass: "border-t-teal-500",
    headerBgClass: "bg-teal-50/50 dark:bg-teal-950/30",
    description: "Cek separasi warna, resolusi & finishing",
    icon: CheckCircle2,
    nextStage: "siap_upload",
    canRevise: true,
  },
  {
    id: "siap_upload",
    title: "Siap Upload",
    badgeTone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
    colorClass: "border-indigo-300 dark:border-indigo-700",
    borderClass: "border-t-indigo-500",
    headerBgClass: "bg-indigo-50/50 dark:bg-indigo-950/30",
    description: "Semua QC lolos, siap kirim ke server produksi",
    icon: Send,
    nextStage: "uploaded",
  },
  {
    id: "uploaded",
    title: "Uploaded ke Server",
    badgeTone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
    colorClass: "border-emerald-300 dark:border-emerald-700",
    borderClass: "border-t-emerald-500",
    headerBgClass: "bg-emerald-50/50 dark:bg-emerald-950/30",
    description: "Berkas produksi tersimpan di server jaringan",
    icon: CheckCircle2,
    nextStage: "closed",
  },
  {
    id: "closed",
    title: "Closed / Selesai",
    badgeTone: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    colorClass: "border-gray-300 dark:border-gray-700",
    borderClass: "border-t-gray-500",
    headerBgClass: "bg-gray-50 dark:bg-gray-900/40",
    description: "Alur JOD dan tiket resmi ditutup",
    icon: Check,
  },
];

// Helper to map legacy/intermediate process statuses to one of the 10 Kanban columns
function mapToKanbanColumn(status: string): KanbanStageId {
  if (status === "revisi_owner" || status === "revisi_qc") return "revisi";
  if (status === "acc_owner" || status === "menunggu_josd" || status === "menunggu_jod" || status === "finalisasi") {
    return "menunggu_acc_owner";
  }
  if (status === "menunggu_close") return "uploaded";
  if (KANBAN_COLUMNS.some((col) => col.id === status)) {
    return status as KanbanStageId;
  }
  return "draft";
}

export function MonitoringTrackingPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // State Filters
  const [search, setSearch] = useState("");
  const [slotFilter, setSlotFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");

  // Drag and drop state
  const [draggedTicketId, setDraggedTicketId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<KanbanStageId | null>(null);

  // Queries
  const ticketsQuery = trpc.workflow.tickets.list.useQuery();
  const slotsQuery = trpc.workflow.settings.designerSlots.useQuery(undefined, {
    enabled: ["superadmin", "admin", "spv", "manager", "owner", "designer"].includes(user?.appRole || ""),
  });

  // Mutations
  const updateProcessMutation = trpc.workflow.tickets.updateProcessStatus.useMutation({
    onMutate: async ({ ticketId, processStatus }) => {
      // Optimistic update
      await utils.workflow.tickets.list.cancel();
      const previousTickets = utils.workflow.tickets.list.getData();
      if (previousTickets) {
        utils.workflow.tickets.list.setData(
          undefined,
          previousTickets.map((t) =>
            t.id === ticketId
              ? { ...t, processStatus, processUpdatedAt: new Date().toISOString() }
              : t
          )
        );
      }
      return { previousTickets };
    },
    onError: (err, _variables, context) => {
      if (context?.previousTickets) {
        utils.workflow.tickets.list.setData(undefined, context.previousTickets);
      }
      toast.error(err.message || "Gagal memperbarui status proses tiket.");
    },
    onSuccess: (data) => {
      const stageLabel = PROCESS_LABELS[data.processStatus as ProcessStatus] || data.processStatus;
      toast.success(`Tiket berhasil dipindahkan ke tahap ${stageLabel}.`);
    },
    onSettled: async () => {
      await utils.workflow.tickets.list.invalidate();
      await utils.workflow.dashboard.invalidate();
    },
  });

  // Overdue SLA calculation
  const isOverdue = (ticket: any) => {
    const now = Date.now();
    const stageDue =
      ticket.slaHours && ticket.processUpdatedAt
        ? new Date(ticket.processUpdatedAt).getTime() + ticket.slaHours * 60 * 60 * 1000
        : null;
    const deadlineDue = ticket.deadline
      ? new Date(ticket.deadline).getTime() + 24 * 60 * 60 * 1000 - 1
      : null;
    const due = stageDue && deadlineDue ? Math.min(stageDue, deadlineDue) : stageDue ?? deadlineDue;
    return due !== null && due < now;
  };

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return (ticketsQuery.data || []).filter((ticket) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        ticket.ticketNo.toLowerCase().includes(q) ||
        (ticket.request?.productType || "").toLowerCase().includes(q) ||
        (ticket.request?.requesterName || "").toLowerCase().includes(q) ||
        (ticket.brief || "").toLowerCase().includes(q) ||
        (ticket.designerLabel || "").toLowerCase().includes(q);

      const matchSlot =
        slotFilter === "all" || String(ticket.designerSlot?.slotNumber) === slotFilter;

      const priority = ticket.request?.finalPriority || ticket.request?.requestedPriority;
      const matchPriority = priorityFilter === "all" || priority === priorityFilter;

      const overdueStatus = isOverdue(ticket);
      const matchSla =
        slaFilter === "all" ||
        (slaFilter === "overdue" && overdueStatus) ||
        (slaFilter === "ontime" && !overdueStatus);

      return matchSearch && matchSlot && matchPriority && matchSla;
    });
  }, [ticketsQuery.data, search, slotFilter, priorityFilter, slaFilter]);

  // Group tickets into columns
  const columnData = useMemo(() => {
    const map: Record<KanbanStageId, any[]> = {
      draft: [],
      review_spv: [],
      menunggu_acc_owner: [],
      revisi: [],
      qc_spv: [],
      qc1: [],
      qc2: [],
      siap_upload: [],
      uploaded: [],
      closed: [],
    };

    for (const ticket of filteredTickets) {
      const colId = mapToKanbanColumn(ticket.processStatus);
      if (map[colId]) {
        map[colId].push(ticket);
      } else {
        map.draft.push(ticket);
      }
    }

    return map;
  }, [filteredTickets]);

  // Summary Metrics
  const stats = useMemo(() => {
    const all = ticketsQuery.data || [];
    const urgentCount = all.filter(
      (t) => (t.request?.finalPriority || t.request?.requestedPriority) === "urgent"
    ).length;
    const overdueCount = all.filter((t) => isOverdue(t) && t.processStatus !== "closed").length;
    const closedCount = all.filter((t) => t.processStatus === "closed").length;
    const activeCount = all.length - closedCount;

    return { total: all.length, active: activeCount, urgent: urgentCount, overdue: overdueCount, closed: closedCount };
  }, [ticketsQuery.data]);

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, ticketId: number) => {
    setDraggedTicketId(ticketId);
    e.dataTransfer.setData("text/plain", String(ticketId));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, columnId: KanbanStageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, columnId: KanbanStageId) => {
    if (dragOverColumn === columnId) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetColumnId: KanbanStageId) => {
    e.preventDefault();
    setDragOverColumn(null);
    const rawId = e.dataTransfer.getData("text/plain") || String(draggedTicketId);
    const ticketId = Number(rawId);
    setDraggedTicketId(null);

    if (!ticketId || isNaN(ticketId)) return;

    const currentTicket = (ticketsQuery.data || []).find((t) => t.id === ticketId);
    if (!currentTicket) return;

    if (mapToKanbanColumn(currentTicket.processStatus) === targetColumnId) {
      return; // Same column, no mutation needed
    }

    await updateProcessMutation.mutateAsync({
      ticketId,
      processStatus: targetColumnId,
    });
  };

  // Quick Action Advance
  const handleAdvanceStage = async (ticket: any, nextStage: ProcessStatus) => {
    await updateProcessMutation.mutateAsync({
      ticketId: ticket.id,
      processStatus: nextStage,
      note: `Maju ke tahap ${PROCESS_LABELS[nextStage] || nextStage}`,
    });
  };

  // Quick Action Revise
  const handleRequestRevision = async (ticket: any) => {
    await updateProcessMutation.mutateAsync({
      ticketId: ticket.id,
      processStatus: "revisi",
      note: "Dikembalikan untuk revisi desain",
    });
  };

  const clearFilters = () => {
    setSearch("");
    setSlotFilter("all");
    setPriorityFilter("all");
    setSlaFilter("all");
  };

  const hasActiveFilters = search || slotFilter !== "all" || priorityFilter !== "all" || slaFilter !== "all";

  return (
    <div className="space-y-6">
      {/* Top Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            <Kanban className="size-4 text-primary" />
            <span>Workflow Prepress & Desain Lokal</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Monitoring & Tracking Kanban
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Lacak pergerakan tiket antar 10 tahap produksi secara visual, cepat, dan terorganisir.
          </p>
        </div>

        {/* View Switcher & Refresh */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Link href="/tickets">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <TableIcon className="size-3.5" />
              <span>Tampilan Tabel</span>
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => utils.workflow.tickets.list.invalidate()}
            disabled={ticketsQuery.isFetching}
            className="gap-1.5 text-xs"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`size-3.5 ${ticketsQuery.isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-card border rounded-lg p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Total Tiket</span>
            <Layers className="size-3.5" />
          </div>
          <div className="text-2xl font-bold mt-1 text-foreground">{stats.total}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{stats.active} sedang berjalan</div>
        </div>

        <div className="bg-card border rounded-lg p-3 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 text-xs font-medium">
            <span>Aktif Berjalan</span>
            <Clock className="size-3.5" />
          </div>
          <div className="text-2xl font-bold mt-1 text-foreground">{stats.active}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Dalam antrean proses</div>
        </div>

        <div className="bg-card border rounded-lg p-3 shadow-xs border-amber-200 dark:border-amber-900/40">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-medium">
            <span>Prioritas Urgent</span>
            <AlertTriangle className="size-3.5" />
          </div>
          <div className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{stats.urgent}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Perlu perhatian ekstra</div>
        </div>

        <div className="bg-card border rounded-lg p-3 shadow-xs border-rose-200 dark:border-rose-900/40">
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs font-medium">
            <span>Overdue SLA</span>
            <Clock className="size-3.5" />
          </div>
          <div className="text-2xl font-bold mt-1 text-rose-600 dark:text-rose-400">{stats.overdue}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Melebihi tenggat waktu</div>
        </div>

        <div className="bg-card border rounded-lg p-3 shadow-xs border-emerald-200 dark:border-emerald-900/40 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-medium">
            <span>Closed / Selesai</span>
            <CheckCircle2 className="size-3.5" />
          </div>
          <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{stats.closed}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Arsip tuntas</div>
        </div>
      </div>

      {/* Top Filter Bar */}
      <div className="bg-card border rounded-lg p-3 shadow-xs flex flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            className="w-full bg-background border rounded-md pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Cari tiket, produk, desainer, atau nama peminta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Designer Slot Filter */}
        <div className="w-full sm:w-auto">
          <select
            className="w-full sm:w-48 bg-background border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            value={slotFilter}
            onChange={(e) => setSlotFilter(e.target.value)}
            aria-label="Filter Designer Slot"
          >
            <option value="all">Semua Designer Slot</option>
            {(slotsQuery.data || []).map((slot: any) => (
              <option key={slot.id} value={String(slot.slotNumber)}>
                Slot {slot.slotNumber}: {slot.displayName || slot.label}
              </option>
            ))}
          </select>
        </div>

        {/* Priority Filter */}
        <div className="w-full sm:w-auto">
          <select
            className="w-full sm:w-36 bg-background border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter Prioritas"
          >
            <option value="all">Semua Prioritas</option>
            <option value="urgent">Hanya Urgent</option>
            <option value="normal">Normal</option>
          </select>
        </div>

        {/* SLA Status Filter */}
        <div className="w-full sm:w-auto">
          <select
            className="w-full sm:w-36 bg-background border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            value={slaFilter}
            onChange={(e) => setSlaFilter(e.target.value)}
            aria-label="Filter SLA"
          >
            <option value="all">Semua Status SLA</option>
            <option value="overdue">🚨 Overdue SLA</option>
            <option value="ontime">✓ Sesuai SLA</option>
          </select>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground px-2 h-8"
          >
            <X className="size-3 mr-1" />
            Reset Filter
          </Button>
        )}

        <div className="ml-auto text-xs text-muted-foreground font-medium">
          Menampilkan <span className="text-foreground font-semibold">{filteredTickets.length}</span> tiket
        </div>
      </div>

      {/* Kanban Board Multi-Column Horizontal Scroll Area */}
      <div className="overflow-x-auto pb-6 pt-1">
        <div className="flex items-start gap-3.5 min-w-[3200px]">
          {KANBAN_COLUMNS.map((column, colIdx) => {
            const cards = columnData[column.id] || [];
            const isDropTarget = dragOverColumn === column.id;
            const Icon = column.icon;

            return (
              <div
                key={column.id}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={(e) => handleDragLeave(e, column.id)}
                onDrop={(e) => handleDrop(e, column.id)}
                className={`w-[310px] shrink-0 flex flex-col rounded-xl border bg-muted/30 transition-all duration-150 ${
                  column.borderClass
                } border-t-4 ${
                  isDropTarget
                    ? "ring-2 ring-primary ring-offset-2 bg-primary/5 border-primary/50 shadow-md"
                    : "shadow-2xs"
                }`}
              >
                {/* Column Header */}
                <div className={`p-3 border-b rounded-t-lg ${column.headerBgClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-6 rounded-md bg-background border flex items-center justify-center shrink-0 shadow-2xs">
                        <Icon className="size-3.5 text-foreground" />
                      </div>
                      <h2 className="font-semibold text-xs text-foreground truncate">
                        {column.title}
                      </h2>
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${column.badgeTone}`}
                    >
                      {cards.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                    {column.description}
                  </p>
                </div>

                {/* Cards Container */}
                <div className="p-2.5 space-y-2.5 min-h-[500px] max-h-[calc(100vh-280px)] overflow-y-auto">
                  {cards.length === 0 ? (
                    <div className="h-32 border border-dashed rounded-lg flex flex-col items-center justify-center text-center p-3 text-muted-foreground/60">
                      <Icon className="size-5 mb-1.5 opacity-40" />
                      <span className="text-xs">Tidak ada tiket</span>
                      <span className="text-[10px] opacity-75">Tarik & lepas tiket ke sini</span>
                    </div>
                  ) : (
                    cards.map((ticket) => {
                      const overdue = isOverdue(ticket);
                      const isDragging = draggedTicketId === ticket.id;
                      const priority =
                        ticket.request?.finalPriority || ticket.request?.requestedPriority;

                      return (
                        <div
                          key={ticket.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, ticket.id)}
                          className={`group bg-card rounded-lg border p-3 shadow-xs hover:shadow-md transition-all duration-150 cursor-grab active:cursor-grabbing ${
                            isDragging
                              ? "opacity-40 scale-95 border-primary ring-1 ring-primary"
                              : "hover:border-foreground/30"
                          } ${overdue && ticket.processStatus !== "closed" ? "border-l-4 border-l-rose-500" : ""}`}
                        >
                          {/* Card Header: Ticket No, Priority, External Link */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <Link href={`/tickets/${ticket.id}`}>
                              <span className="font-mono font-bold text-xs text-primary hover:underline flex items-center gap-1">
                                {ticket.ticketNo}
                                <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </span>
                            </Link>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <PriorityTag priority={priority} />
                            </div>
                          </div>

                          {/* Product Type & Theme */}
                          <div className="mb-2">
                            <h3 className="font-semibold text-xs text-foreground line-clamp-1">
                              {ticket.request?.productType || "Desain Produk"}
                            </h3>
                            {ticket.request?.theme && (
                              <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                Tema: {ticket.request.theme}
                              </p>
                            )}
                          </div>

                          {/* Brief snippet */}
                          {ticket.brief && (
                            <p className="text-[11px] text-muted-foreground/90 line-clamp-2 bg-muted/40 rounded p-1.5 mb-2.5 font-normal italic border border-border/40">
                              "{ticket.brief}"
                            </p>
                          )}

                          {/* Ticket Meta (Designer & Requester) */}
                          <div className="space-y-1 text-[11px] text-muted-foreground border-t pt-2 mb-2.5">
                            <div className="flex items-center justify-between gap-1">
                              <span className="flex items-center gap-1 truncate text-foreground font-medium">
                                <Sparkles className="size-3 text-primary shrink-0" />
                                <span className="truncate">
                                  {ticket.designerSlot?.label || "Slot"}: {ticket.designerLabel}
                                </span>
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-1">
                              <span className="flex items-center gap-1 truncate">
                                <User className="size-3 shrink-0" />
                                <span className="truncate">
                                  {ticket.request?.requesterName || "Marketing"}
                                </span>
                              </span>
                              {ticket.jobStatus && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted font-medium text-foreground shrink-0">
                                  {ticket.jobStatus}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* SLA / Deadline Status Indicator */}
                          <div className="flex items-center justify-between gap-1.5 pt-1 border-t text-[11px]">
                            <SlaPill
                              status={ticket.processStatus}
                              processUpdatedAt={ticket.processUpdatedAt}
                              deadline={ticket.deadline}
                              maxHours={ticket.slaHours}
                            />

                            {ticket.deadline && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto">
                                <Calendar className="size-3" />
                                {new Date(ticket.deadline).toLocaleDateString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                            )}
                          </div>

                          {/* Quick Action Buttons */}
                          <div className="mt-3 pt-2 border-t flex items-center justify-between gap-1.5">
                            {/* Move to next stage button */}
                            {column.nextStage ? (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAdvanceStage(ticket, column.nextStage!);
                                }}
                                disabled={updateProcessMutation.isPending}
                                className="h-6 text-[10px] px-2 gap-1 flex-1 font-medium"
                              >
                                <span>Lanjut: {PROCESS_LABELS[column.nextStage]}</span>
                                <ArrowRight className="size-2.5" />
                              </Button>
                            ) : (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="size-3" />
                                Tuntas
                              </span>
                            )}

                            {/* Revision button if applicable */}
                            {column.canRevise && column.id !== "revisi" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRequestRevision(ticket);
                                }}
                                disabled={updateProcessMutation.isPending}
                                className="h-6 text-[10px] px-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-800"
                                title="Kirim catatan revisi"
                              >
                                <RotateCcw className="size-2.5 mr-0.5" />
                                <span>Revisi</span>
                              </Button>
                            )}

                            {/* Dropdown Menu for Direct Move */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
                                  title="Pindah ke tahap lain"
                                >
                                  <MoreVertical className="size-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 text-xs">
                                <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                                  Pindahkan Tahap
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {KANBAN_COLUMNS.map((targetCol) => {
                                  if (targetCol.id === column.id) return null;
                                  return (
                                    <DropdownMenuItem
                                      key={targetCol.id}
                                      onClick={() =>
                                        updateProcessMutation.mutate({
                                          ticketId: ticket.id,
                                          processStatus: targetCol.id,
                                        })
                                      }
                                      className="text-xs cursor-pointer"
                                    >
                                      <span>{targetCol.title}</span>
                                    </DropdownMenuItem>
                                  );
                                })}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/tickets/${ticket.id}`} className="text-xs flex items-center gap-1.5 cursor-pointer">
                                    <ExternalLink className="size-3" />
                                    <span>Buka Detail Tiket</span>
                                  </Link>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
