import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ClipboardCheck } from "lucide-react";
import { Link } from "wouter";
import { EmptyState, PageTitle, PriorityTag, StatusPill, formatDate } from "@/components/WorkflowUI";

const qcStates = ["qc_spv", "qc1", "qc2", "revisi_qc"];

export default function QCPage() {
  const { user } = useAuth();
  const query = trpc.workflow.tickets.list.useQuery();
  const all = query.data || [];
  const role = user?.appRole || "";
  const rows = all.filter(ticket => {
    if (!qcStates.includes(ticket.processStatus)) return false;
    if (role === "qc1") return ticket.processStatus === "qc1";
    if (role === "qc2") return ticket.processStatus === "qc2";
    return role === "spv" && ["qc_spv", "revisi_qc"].includes(ticket.processStatus);
  });
  const stage = user?.appRole === "qc1" ? "QC Checker 1" : user?.appRole === "qc2" ? "QC Checker 2" : "SPV / Pemeriksa";
  return <>
    <PageTitle kicker="QUALITY CONTROL / GATE" title="Quality control" subtitle="Pemeriksaan berurutan. Tahap berikutnya dan upload tetap terkunci sampai tahap sebelumnya lolos." />
    <div className="progress-steps" style={{ margin: "-5px 0 21px" }}><div className="progress-step done"><span>1</span>SPV</div><i className="progress-connector" /><div className="progress-step"><span>2</span>QC CHECKER 1</div><i className="progress-connector" /><div className="progress-step"><span>3</span>QC CHECKER 2</div><i className="progress-connector" /><div className="progress-step"><span>4</span>SIAP UPLOAD</div></div>
    <div className="section-heading"><div><h2>Antrian pemeriksaan</h2><p>Role saat ini: {stage}</p></div><span className="section-kicker">{rows.length} TIKET</span></div>
    <div className="panel">{query.isLoading ? <div className="loading-block">Memuat antrian QC…</div> : rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Tiket</th><th>Produk / Designer</th><th>Tahap</th><th>Target</th><th>Prioritas</th><th>Aksi</th></tr></thead><tbody>{rows.map(ticket => <tr key={ticket.id}><td><Link className="ticket-link" href={`/tickets/${ticket.id}`}>{ticket.ticketNo}</Link></td><td><span className="cell-main">{ticket.request.productType}</span><span className="cell-sub">{ticket.designerLabel}</span></td><td><StatusPill status={ticket.processStatus} /></td><td>{formatDate(ticket.deadline)}</td><td><PriorityTag priority={ticket.request.finalPriority || ticket.request.requestedPriority} /></td><td><Link className="button-primary button-small" href={`/tickets/${ticket.id}`}><ClipboardCheck size={13} /> Periksa</Link></td></tr>)}</tbody></table></div> : <EmptyState title="Antrian QC kosong" detail="Tiket masuk ke antrian setelah Designer mengirim file final dengan nomor JOD dan DG lengkap." icon={<ClipboardCheck size={22} />} />}</div>
  </>;
}
