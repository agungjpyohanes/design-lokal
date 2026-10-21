import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Search, Ticket as TicketIcon, Plus, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { EmptyState, FormField, Modal, PageTitle, PriorityTag, SlaPill, StatusPill, formatAge, formatDate, nextActorLabel } from "@/components/WorkflowUI";
import { JOB_STATUSES } from "@shared/workflow";

export default function TicketsPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [slotFilter, setSlotFilter] = useState(searchParams.get("designer") || "all");
  const [jobFilter, setJobFilter] = useState(searchParams.get("jobStatus") || "all");
  const [productFilter, setProductFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [requesterFilter, setRequesterFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [slaFilter, setSlaFilter] = useState(searchParams.get("sla") || "all");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const ticketsQuery = trpc.workflow.tickets.list.useQuery();
  const requestsQuery = trpc.workflow.requests.list.useQuery(undefined, { enabled: user?.appRole === "spv" });
  const slotsQuery = trpc.workflow.settings.designerSlots.useQuery(undefined, { enabled: ["superadmin", "admin", "spv", "manager", "owner"].includes(user?.appRole || "") });
  const create = trpc.workflow.tickets.createFromRequest.useMutation({ onSuccess: async data => { toast.success(`${data.ticketNo} diterbitkan dan ditugaskan.`); setOpen(false); await utils.workflow.tickets.list.invalidate(); await utils.workflow.dashboard.invalidate(); await utils.workflow.requests.list.invalidate(); } });
  const canCreate = user?.appRole === "spv";
  const accepted = (requestsQuery.data || []).filter(item => item.status === "diterima" && !(ticketsQuery.data || []).some(ticket => ticket.requestId === item.id));
  const productOptions = [...new Set((ticketsQuery.data || []).map(item => item.request.productType))].sort();
  const requesterOptions = [...new Set((ticketsQuery.data || []).map(item => item.request.requesterName))].sort();
  const overdue = (item: NonNullable<typeof ticketsQuery.data>[number]) => {
    const now = Date.now();
    const stageDue = item.slaHours && item.processUpdatedAt ? new Date(item.processUpdatedAt).getTime() + item.slaHours * 60 * 60 * 1000 : null;
    const deadlineDue = item.deadline ? new Date(item.deadline).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    const due = stageDue && deadlineDue ? Math.min(stageDue, deadlineDue) : stageDue ?? deadlineDue;
    return due !== null && due < now;
  };
  const rows = useMemo(() => (ticketsQuery.data || []).filter(item => {
    const queryText = `${item.ticketNo} ${item.request.productType} ${item.request.requesterName} ${item.designerLabel} ${item.jobStatus}`.toLowerCase();
    const created = new Date(item.createdAt).getTime();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return queryText.includes(search.toLowerCase())
      && (statusFilter === "all" || item.processStatus === statusFilter)
      && (slotFilter === "all" || item.designerSlot.slotNumber === Number(slotFilter))
      && (jobFilter === "all" || item.jobStatus === jobFilter)
      && (productFilter === "all" || item.request.productType === productFilter)
      && (priorityFilter === "all" || (item.request.finalPriority || item.request.requestedPriority) === priorityFilter)
      && (requesterFilter === "all" || item.request.requesterName === requesterFilter)
      && (from === null || created >= from) && (to === null || created <= to)
      && (slaFilter === "all" || (slaFilter === "overdue" ? overdue(item) : !overdue(item)));
  }), [ticketsQuery.data, search, statusFilter, slotFilter, jobFilter, productFilter, priorityFilter, requesterFilter, dateFrom, dateTo, slaFilter]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); const data = new FormData(event.currentTarget);
    try { await create.mutateAsync({ requestId: Number(data.get("requestId")), designerSlotId: Number(data.get("designerSlotId")), brief: String(data.get("brief") || ""), deadline: String(data.get("deadline") || "") || undefined }); }
    catch (e) { setError(e instanceof Error ? e.message : "Tiket gagal dibuat."); }
  };

  return <>
    <PageTitle kicker="TICKET REGISTER / DES-" title="Tiket desain" subtitle="Setiap tiket memiliki satu Designer penanggung jawab dan identitas kerja yang dapat ditelusuri." action={canCreate ? <Button className="button-primary" onClick={() => { setOpen(true); setError(""); }}><Plus size={15} /> Terbitkan tiket</Button> : undefined} />
    <div className="panel"><div className="filter-bar" style={{ flexWrap: "wrap" }}><div className="search-input" style={{ display: "flex", alignItems: "center", gap: 8 }}><Search size={14} color="#8c948b" /><input className="text-input" style={{ border: 0, minHeight: 25, padding: 0, background: "transparent" }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor, produk, peminta…" /></div><select aria-label="Filter status proses" className="select-input" style={{ width: 175 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">Semua status proses</option>{Object.entries({draft:"Draft",review_spv:"Review SPV",revisi:"Revisi desain",revisi_owner:"Revisi Owner",menunggu_acc_owner:"Menunggu ACC Owner",acc_owner:"ACC Owner",ditolak_owner:"Ditolak Owner",menunggu_josd:"Menunggu JOS-D",menunggu_jod:"Menunggu JOD",finalisasi:"Finalisasi",qc_spv:"QC SPV",qc1:"QC 1",qc2:"QC 2",revisi_qc:"Revisi QC",siap_upload:"Siap upload",uploaded:"Uploaded",menunggu_close:"Menunggu close",closed:"Closed"}).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filter Job Status" className="select-input" style={{ width: 150 }} value={jobFilter} onChange={e => setJobFilter(e.target.value)}><option value="all">Semua Job Status</option>{JOB_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select><select aria-label="Filter Designer" className="select-input" style={{ width: 145 }} value={slotFilter} onChange={e => setSlotFilter(e.target.value)}><option value="all">Semua Designer</option>{(slotsQuery.data || []).map(slot => <option key={slot.id} value={String(slot.slotNumber)}>{slot.displayName || slot.label}</option>)}</select><select aria-label="Filter produk" className="select-input" style={{ width: 135 }} value={productFilter} onChange={e => setProductFilter(e.target.value)}><option value="all">Semua produk</option>{productOptions.map(product => <option key={product} value={product}>{product}</option>)}</select><select aria-label="Filter prioritas" className="select-input" style={{ width: 120 }} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}><option value="all">Semua prioritas</option><option value="normal">Normal</option><option value="urgent">Urgent</option></select><select aria-label="Filter peminta" className="select-input" style={{ width: 140 }} value={requesterFilter} onChange={e => setRequesterFilter(e.target.value)}><option value="all">Semua peminta</option>{requesterOptions.map(name => <option key={name} value={name}>{name}</option>)}</select><input aria-label="Tiket dibuat sejak" title="Dibuat sejak" type="date" className="text-input" style={{ width: 145 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /><input aria-label="Tiket dibuat sampai" title="Dibuat sampai" type="date" className="text-input" style={{ width: 145 }} value={dateTo} onChange={e => setDateTo(e.target.value)} /><select aria-label="Filter SLA" className="select-input" style={{ width: 130 }} value={slaFilter} onChange={e => setSlaFilter(e.target.value)}><option value="all">Semua SLA</option><option value="overdue">Lewat target</option><option value="ok">Belum lewat</option></select><button className="button-quiet button-small" onClick={() => { setStatusFilter("all"); setSlotFilter("all"); setJobFilter("all"); setProductFilter("all"); setPriorityFilter("all"); setRequesterFilter("all"); setDateFrom(""); setDateTo(""); setSlaFilter("all"); setSearch(""); }}>Reset filter</button><span className="section-kicker">{rows.length} TIKET</span></div>
      {ticketsQuery.isLoading ? <div className="loading-block">Memuat tiket…</div> : rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Nomor / produk</th><th>Peminta</th><th>Designer utama</th><th>Job status</th><th>Proses / PIC berikutnya</th><th>Prioritas</th><th>SLA / target</th><th /></tr></thead><tbody>{rows.map(ticket => <tr key={ticket.id}><td><Link href={`/tickets/${ticket.id}`} className="ticket-link">{ticket.ticketNo}</Link><span className="cell-sub">{ticket.request.productType} · {ticket.request.sizeSpec || "—"}</span><span className="cell-sub">Umur {formatAge(ticket.createdAt)}</span></td><td>{ticket.request.requesterName}</td><td><span className="cell-main">{ticket.designerLabel}</span><span className="cell-sub">{ticket.designerSlot.displayName || "Nama slot"}</span></td><td>{ticket.jobStatus}</td><td><StatusPill status={ticket.processStatus} /><span className="cell-sub">Berikutnya: {nextActorLabel(ticket.processStatus)}</span></td><td><PriorityTag priority={ticket.request.finalPriority || ticket.request.requestedPriority} /></td><td><SlaPill status={ticket.processStatus} processUpdatedAt={ticket.processUpdatedAt} deadline={ticket.deadline} maxHours={ticket.slaHours} /><span className="cell-sub">{formatDate(ticket.deadline)}</span></td><td><Link className="button-quiet button-small" href={`/tickets/${ticket.id}`} aria-label="Buka detail"><ArrowUpRight size={14} /></Link></td></tr>)}</tbody></table></div> : <EmptyState title="Belum ada tiket yang cocok" detail={canCreate ? "Terima permintaan terlebih dahulu, lalu terbitkan tiket dengan Designer penanggung jawab." : "Tiket yang dapat Anda lihat akan muncul setelah SPV menerbitkannya."} icon={<TicketIcon size={21} />} />}</div>
    {open && <Modal title="Terbitkan tiket internal" detail="Tiket dibuat oleh SPV sebelum Designer mulai bekerja. Penanggung jawab wajib dipilih." onClose={() => setOpen(false)} wide><form onSubmit={submit} className="form-grid"><div className="form-span-2"><FormField label="Permintaan yang sudah diterima *"><select className="select-input" name="requestId" required><option value="">Pilih permintaan</option>{accepted.map(item => <option value={item.id} key={item.id}>{item.requestNo} · {item.productType} · {item.requesterName}</option>)}</select>{accepted.length === 0 && <small className="form-helper">Belum ada permintaan berstatus Diterima tanpa tiket.</small>}</FormField></div><FormField label="Designer penanggung jawab *"><select className="select-input" name="designerSlotId" required><option value="">Pilih Designer 1–8</option>{(slotsQuery.data || []).filter(slot => slot.isActive).map(slot => <option key={slot.id} value={slot.id}>{slot.displayName || slot.label}</option>)}</select><small>Jika nama asli belum diisi, slot Designer 1–8 tetap dapat dipilih sesuai konfigurasi.</small></FormField><FormField label="Target draft"><input className="text-input" name="deadline" type="date" /></FormField><div className="form-span-2"><FormField label="Brief desain *"><textarea className="text-area" name="brief" required minLength={5} placeholder="Tema, warna, elemen, spesifikasi, dan arahan kerja yang diberikan SPV." /></FormField></div>{error && <div className="form-error form-span-2">{error}</div>}<div className="modal-actions form-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button className="button-primary" type="submit" disabled={create.isPending || !accepted.length}>{create.isPending ? "Menerbitkan…" : "Terbitkan & tugaskan"}</Button></div></form></Modal>}
  </>;
}
