import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowUpRight, Clock3, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { EmptyState, MetricCard, PageTitle, PriorityTag, StatusPill, formatDate } from "@/components/WorkflowUI";

export default function DesignerPage() {
  const { user } = useAuth();
  const query = trpc.workflow.tickets.mine.useQuery(undefined, { enabled: user?.appRole === "designer" });
  const rows = (query.data || []).filter(ticket => ticket.processStatus !== "closed" && ticket.processStatus !== "ditolak_owner");
  const active = rows.filter(ticket => ticket.jobStatus === "Sedang dikerjakan" || ticket.jobStatus === "Revisi dikerjakan").length;
  const queued = rows.filter(ticket => ticket.jobStatus === "Belum mulai").length;
  const blocked = rows.filter(ticket => ticket.jobStatus === "Terhambat").length;
  return <>
    <PageTitle kicker="DESIGNER WORKSPACE" title="Meja kerja saya" subtitle="Perbarui Job Status agar SPV dapat melihat progres dan hambatan secara akurat." />
    <section className="stats-row" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", maxWidth: 660 }}><MetricCard label="Dalam pengerjaan" value={active} detail="Sedang dikerjakan / revisi" tone="teal" icon={<Sparkles size={15} />} /><MetricCard label="Belum mulai" value={queued} detail="Antrean penugasan" tone="amber" icon={<Clock3 size={15} />} /><MetricCard label="Terhambat" value={blocked} detail="Butuh tindak lanjut" tone="risk" /></section>
    <div className="section-heading"><div><h2>Penugasan aktif</h2><p>{user?.name || "Designer"} · hanya tiket yang ditugaskan</p></div></div>
    <div className="panel">{query.isLoading ? <div className="loading-block">Memuat penugasan…</div> : rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Tiket</th><th>Brief / produk</th><th>Target</th><th>Job Status</th><th>Workflow</th><th>Prioritas</th><th /></tr></thead><tbody>{rows.map(ticket => <tr key={ticket.id}><td><Link href={`/tickets/${ticket.id}`} className="ticket-link">{ticket.ticketNo}</Link><span className="cell-sub">{ticket.designerLabel}</span></td><td><span className="cell-main">{ticket.request.productType}</span><span className="cell-sub">{ticket.brief}</span></td><td>{formatDate(ticket.eta || ticket.deadline)}</td><td><span className={`status-pill ${ticket.jobStatus === "Terhambat" ? "danger" : ticket.jobStatus === "Selesai" ? "success" : "teal"}`}><i />{ticket.jobStatus}</span>{ticket.jobNote && <span className="cell-sub">{ticket.jobNote}</span>}</td><td><StatusPill status={ticket.processStatus} /></td><td><PriorityTag priority={ticket.request.finalPriority || ticket.request.requestedPriority} /></td><td><Link className="button-quiet button-small" href={`/tickets/${ticket.id}`}><ArrowUpRight size={14} /> Buka</Link></td></tr>)}</tbody></table></div> : <EmptyState title="Belum ada penugasan aktif" detail="Tiket yang ditugaskan SPV kepada slot akun Anda akan muncul di sini. Setelah mulai, perbarui Job Status pada detail tiket." icon={<Sparkles size={22} />} />}</div>
  </>;
}
