import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Lock,
  Server,
  Unlock,
} from "lucide-react";
import { Link } from "wouter";
import {
  EmptyState,
  PageTitle,
  PriorityTag,
  StatusPill,
  formatDate,
} from "@/modules/common/components/WorkflowUI";

const qcRelevantStates = ["qc_spv", "qc1", "qc2", "siap_upload", "revisi_qc"];

export function QCPage() {
  const { user } = useAuth();
  const query = trpc.workflow.tickets.list.useQuery();
  const all = query.data || [];
  const [activeTab, setActiveTab] = useState<string>("all");

  const qcTickets = all.filter((ticket) => qcRelevantStates.includes(ticket.processStatus));

  const filteredRows = qcTickets.filter((ticket) => {
    if (activeTab === "all") return true;
    if (activeTab === "spv") return ticket.processStatus === "qc_spv";
    if (activeTab === "qc1") return ticket.processStatus === "qc1";
    if (activeTab === "qc2") return ticket.processStatus === "qc2";
    if (activeTab === "siap_upload") return ticket.processStatus === "siap_upload";
    if (activeTab === "revisi") return ticket.processStatus === "revisi_qc";
    return true;
  });

  const countByStage = {
    all: qcTickets.length,
    spv: qcTickets.filter((t) => t.processStatus === "qc_spv").length,
    qc1: qcTickets.filter((t) => t.processStatus === "qc1").length,
    qc2: qcTickets.filter((t) => t.processStatus === "qc2").length,
    siap_upload: qcTickets.filter((t) => t.processStatus === "siap_upload").length,
    revisi: qcTickets.filter((t) => t.processStatus === "revisi_qc").length,
  };

  return (
    <>
      <PageTitle
        kicker="QUALITY CONTROL / STRICT GATE"
        title="Quality Control Berurutan"
        subtitle="Pemeriksaan berurutan: QC SPV → QC Checker 1 → QC Checker 2. Gerbang server produksi (192.168.0.24) terkunci total sampai seluruh tahap lolos."
      />

      {/* 4-Step Pipeline Header */}
      <div className="progress-steps" style={{ margin: "-5px 0 21px" }}>
        <div className={`progress-step ${countByStage.spv > 0 ? "done" : ""}`}>
          <span>1</span>QC SPV
        </div>
        <i className="progress-connector" />
        <div className={`progress-step ${countByStage.qc1 > 0 ? "done" : ""}`}>
          <span>2</span>QC CHECKER 1
        </div>
        <i className="progress-connector" />
        <div className={`progress-step ${countByStage.qc2 > 0 ? "done" : ""}`}>
          <span>3</span>QC CHECKER 2
        </div>
        <i className="progress-connector" />
        <div className={`progress-step ${countByStage.siap_upload > 0 ? "done" : ""}`}>
          <span>4</span>SERVER PRODUKSI
        </div>
      </div>

      {/* Tabs Filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          className={`button-small ${activeTab === "all" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("all")}
        >
          Semua Antrean ({countByStage.all})
        </button>
        <button
          className={`button-small ${activeTab === "spv" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("spv")}
        >
          1. QC SPV ({countByStage.spv})
        </button>
        <button
          className={`button-small ${activeTab === "qc1" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("qc1")}
        >
          2. QC Checker 1 ({countByStage.qc1})
        </button>
        <button
          className={`button-small ${activeTab === "qc2" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("qc2")}
        >
          3. QC Checker 2 ({countByStage.qc2})
        </button>
        <button
          className={`button-small ${activeTab === "siap_upload" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("siap_upload")}
        >
          <Unlock size={12} /> Siap Upload 192.168.0.24 ({countByStage.siap_upload})
        </button>
        <button
          className={`button-small ${activeTab === "revisi" ? "button-danger" : "button-secondary"}`}
          onClick={() => setActiveTab("revisi")}
        >
          <AlertTriangle size={12} /> Perlu Revisi Designer ({countByStage.revisi})
        </button>
      </div>

      <div className="section-heading">
        <div>
          <h2>Daftar Pemeriksaan Kualitas</h2>
          <p>
            Mode Bypass Aktif ({user?.appRole || "Superadmin"}) · Memiliki wewenang peninjauan di seluruh gerbang QC.
          </p>
        </div>
        <span className="section-kicker">{filteredRows.length} TIKET DITAMPILKAN</span>
      </div>

      <div className="panel">
        {query.isLoading ? (
          <div className="loading-block">Memuat antrean Quality Control…</div>
        ) : filteredRows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tiket</th>
                  <th>Produk / Designer</th>
                  <th>Tahap QC / Status</th>
                  <th>Status Gerbang Server (192.168.0.24)</th>
                  <th>Target Selesai</th>
                  <th>Prioritas</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((ticket) => {
                  const isQcLolos = ticket.processStatus === "siap_upload";
                  const isQcRevisi = ticket.processStatus === "revisi_qc";

                  return (
                    <tr key={ticket.id}>
                      <td>
                        <Link className="ticket-link" href={`/tickets/${ticket.id}`}>
                          {ticket.ticketNo}
                        </Link>
                      </td>
                      <td>
                        <span className="cell-main">{ticket.request.productType}</span>
                        <span className="cell-sub">{ticket.designerLabel}</span>
                      </td>
                      <td>
                        <StatusPill status={ticket.processStatus} />
                      </td>
                      <td>
                        {isQcLolos ? (
                          <span style={{ color: "#16a34a", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                            <Unlock size={13} /> TERBUKA (Siap Catat Path)
                          </span>
                        ) : isQcRevisi ? (
                          <span style={{ color: "#dc2626", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                            <AlertTriangle size={13} /> TERKUNCI (Revisi Designer)
                          </span>
                        ) : (
                          <span style={{ color: "#64748b", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                            <Lock size={13} /> TERKUNCI (Menunggu QC Selesai)
                          </span>
                        )}
                      </td>
                      <td>{formatDate(ticket.deadline)}</td>
                      <td>
                        <PriorityTag
                          priority={ticket.request.finalPriority || ticket.request.requestedPriority}
                        />
                      </td>
                      <td>
                        <Link
                          className="button-primary button-small"
                          href={`/tickets/${ticket.id}`}
                        >
                          <ClipboardCheck size={13} /> Buka Detail & QC
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Antrean QC pada tab ini kosong"
            detail="Pilih tab tahapan lain atau kirim berkas final untuk memulai siklus pemeriksaan QC."
            icon={<ClipboardCheck size={22} />}
          />
        )}
      </div>
    </>
  );
}

export default QCPage;
