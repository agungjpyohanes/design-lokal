import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, Download, FilePlus2, RefreshCw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { JOB_STATUSES, QC_ITEMS, type QCStage } from "@shared/workflow";
import { EmptyState, FormField, PageTitle, PriorityTag, SlaPill, StatusPill, formatDate, formatDateTime } from "@/components/WorkflowUI";
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

export default function TicketDetailPage() {
  const [, params] = useRoute("/tickets/:id");
  const ticketId = Number(params?.id);
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const query = trpc.workflow.tickets.detail.useQuery({ id: ticketId }, { enabled: Number.isInteger(ticketId) && ticketId > 0 });
  const designerSlotsQuery = trpc.workflow.settings.designerSlots.useQuery(undefined, { enabled: user?.appRole === "spv" });
  const [jobStatus, setJobStatus] = useState("");
  const [jobNote, setJobNote] = useState("");
  const [eta, setEta] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [qcAnswers, setQcAnswers] = useState<Record<number,{passed:boolean;note:string}>>({});
  const [qcSummary, setQcSummary] = useState("");
  const [ids, setIds] = useState({ josdNo: "", jodNo: "", jodStatus: "", dgNo: "" });
  const [serverPath, setServerPath] = useState("");
  const [busy, setBusy] = useState(false);
  const ticket = query.data;
  const role = user?.appRole || "";
  const invalidate = async () => { await Promise.all([utils.workflow.tickets.detail.invalidate({ id: ticketId }), utils.workflow.tickets.list.invalidate(), utils.workflow.dashboard.invalidate()]); };
  const reassignDesigner = trpc.workflow.tickets.reassignDesigner.useMutation({ onSuccess: async result => { toast.success(result.unchanged ? "Designer tersebut sudah menjadi penanggung jawab." : "Penugasan Designer diperbarui."); await invalidate(); }, onError: error => toast.error(error.message) });
  const updateJob = trpc.workflow.tickets.updateJobStatus.useMutation({ onSuccess: async () => { toast.success("Job Status diperbarui."); setJobNote(""); await invalidate(); } });
  const reviewSpv = trpc.workflow.tickets.spvReview.useMutation({ onSuccess: async result => { toast.success(result.next === "menunggu_acc_owner" ? "Review SPV lolos; tiket diajukan ke Owner." : "Revisi SPV dikirim ke Designer."); setReviewNote(""); await invalidate(); } });
  const ownerDecision = trpc.workflow.tickets.ownerDecision.useMutation({ onSuccess: async result => { toast.success(result.next === "menunggu_josd" ? "ACC Owner dicatat; JOS-D dapat diproses." : "Keputusan Owner dicatat."); setReviewNote(""); await invalidate(); } });
  const updateIds = trpc.workflow.tickets.updateOperationalIds.useMutation({ onSuccess: async () => { toast.success("Nomor proses diperbarui."); await invalidate(); } });
  const submitQc = trpc.workflow.tickets.submitQc.useMutation({ onSuccess: async result => { toast.success(`Hasil QC tersimpan. Tahap berikutnya: ${result.next.replaceAll("_", " ")}.`); setQcAnswers({}); setQcSummary(""); await invalidate(); } });
  const upload = trpc.workflow.tickets.uploadFile.useMutation({ onSuccess: async result => { toast.success(`${result.fileName} berhasil diunggah sebagai v${result.versionNo}.`); await invalidate(); } });
  const uploadPath = trpc.workflow.tickets.registerServerUpload.useMutation({ onSuccess: async () => { toast.success("Path upload produksi dicatat."); await invalidate(); } });
  const close = trpc.workflow.tickets.close.useMutation({ onSuccess: async () => { toast.success("JOD dan tiket ditutup."); await invalidate(); } });

  const qcStage = ticket?.processStatus === "qc_spv" ? "spv" : ticket?.processStatus === "qc1" ? "qc1" : ticket?.processStatus === "qc2" ? "qc2" : null;
  const canRunQc = qcStage && (qcStage === "spv" ? role === "spv" : role === qcStage);
  const allowedReviewer = role === "spv";
  const canJob = role === "designer" && ticket?.designerSlot.userId === user?.id;
  const currentIds = ticket?.operationalIds;
  const isPending = query.isLoading;

  if (!Number.isInteger(ticketId) || ticketId <= 0) return <div className="form-error">Nomor tiket tidak valid.</div>;
  if (isPending) return <div className="loading-block">Memuat detail tiket…</div>;
  if (query.error || !ticket) return <><Link href="/tickets" className="button-quiet"><ArrowLeft size={14} /> Kembali ke tiket</Link><div className="form-error" style={{ marginTop: 15 }}>{query.error?.message || "Tiket tidak ditemukan."}</div></>;

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, fileType: "draft" | "final" | "referensi") => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Ukuran maksimum file adalah 8 MB."); event.target.value = ""; return; }
    setBusy(true);
    try { await upload.mutateAsync({ ticketId, fileName: file.name, contentType: file.type || "application/octet-stream", fileType, dataBase64: await fileToBase64(file) }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Upload gagal."); }
    finally { setBusy(false); event.target.value = ""; }
  };

  const submitQC = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const items = QC_ITEMS.map((_, index) => ({ id: index + 1, passed: qcAnswers[index + 1]?.passed ?? false, note: qcAnswers[index + 1]?.note || undefined }));
    const failed = items.filter(item => !item.passed);
    if (failed.length && failed.some(item => !item.note?.trim())) { toast.error("Tambahkan catatan pada setiap butir yang tidak lolos."); return; }
    submitQc.mutate({ ticketId, stage: qcStage as QCStage, result: failed.length ? "revisi" : "lolos", items, summary: qcSummary || undefined });
  };

  const submitIds = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const status = String(data.get("jodStatus") || "");
    updateIds.mutate({ ticketId, josdNo: String(data.get("josdNo") || "") || undefined, jodNo: String(data.get("jodNo") || "") || undefined, jodStatus: status ? status as "open" | "in_progress" | "closed" : undefined, dgNo: String(data.get("dgNo") || "") || undefined });
  };

  const pushJobStatus = () => {
    if (!jobStatus) return toast.error("Pilih Job Status terlebih dahulu.");
    updateJob.mutate({ ticketId, status: jobStatus as typeof JOB_STATUSES[number], note: jobNote || undefined, eta: eta || undefined });
  };

  const openQcHistory = [...ticket.qcReviews].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const canEnterIds = ["admin", "spv", "mpp"].includes(role);
  const canRecordUpload = ["admin", "spv"].includes(role);
  const canClose = role === "admin";
  const isEarlyReview = ["draft", "review_spv", "revisi", "revisi_owner"].includes(ticket.processStatus);

  return <>
    <PageTitle kicker={`TICKET / ${ticket.ticketNo}`} title={ticket.request.productType} subtitle={`${ticket.request.requesterName} · ${ticket.request.sizeSpec || "Spesifikasi belum ditentukan"} · ${ticket.request.seriesCount} series`} action={<Link href="/tickets" className="button-secondary"><ArrowLeft size={14} /> Semua tiket</Link>} />
    <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", margin: "-12px 0 17px" }}><StatusPill status={ticket.processStatus} /><span className="status-pill teal"><i />JOB · {ticket.jobStatus}</span><SlaPill status={ticket.processStatus} processUpdatedAt={ticket.processUpdatedAt} deadline={ticket.deadline} maxHours={ticket.slaHours} /><PriorityTag priority={ticket.request.finalPriority || ticket.request.requestedPriority} /><span className="section-kicker">DESIGNER: {ticket.designerSlot.displayName || ticket.designerSlot.label}</span></div>
    <div className="progress-steps" style={{ margin: "0 0 20px" }}><div className={`progress-step ${["acc_owner","menunggu_josd","menunggu_jod","finalisasi","qc_spv","qc1","qc2","siap_upload","uploaded","closed"].includes(ticket.processStatus) ? "done" : ""}`}><span>1</span>BRIEF</div><i className="progress-connector"/><div className={`progress-step ${["menunggu_josd","menunggu_jod","finalisasi","qc_spv","qc1","qc2","siap_upload","uploaded","closed"].includes(ticket.processStatus) ? "done" : ""}`}><span>2</span>OWNER</div><i className="progress-connector"/><div className={`progress-step ${["qc_spv","qc1","qc2","siap_upload","uploaded","closed"].includes(ticket.processStatus) ? "done" : ""}`}><span>3</span>FINAL/QC</div><i className="progress-connector"/><div className={`progress-step ${["siap_upload","uploaded","closed"].includes(ticket.processStatus) ? "done" : ""}`}><span>4</span>PRODUKSI</div></div>
    <div className="ticket-detail-grid">
      <div className="detail-stack">
        <section className="detail-card"><div className="section-heading" style={{ margin: "0 0 13px" }}><h2>Brief & permintaan</h2><span className="section-kicker">{ticket.ticketNo}</span></div><p>{ticket.brief}</p><div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} /><div className="detail-meta"><div><span>Jenis produk</span><strong>{ticket.request.productType}</strong></div><div><span>Ukuran / template</span><strong>{ticket.request.sizeSpec || "—"}</strong></div><div><span>Jumlah series</span><strong>{ticket.request.seriesCount}</strong></div><div><span>Peminta</span><strong>{ticket.request.requesterName}</strong></div><div><span>Estimasi produksi</span><strong>{ticket.request.productionEstimate || "—"}</strong></div><div><span>Deadline</span><strong>{formatDate(ticket.deadline)}</strong></div><div><span>Justifikasi</span><strong>{ticket.request.businessJustification || "—"}</strong></div><div><span>Desain serupa</span><strong>{ticket.request.designReuse === "reuse" ? "Gunakan existing" : ticket.request.designReuse === "recolor" ? "Recolor" : ticket.request.designReuse === "new" ? "Desain baru" : ticket.request.similarDesignRef || "—"}</strong></div></div></section>
        {canJob && <section className="detail-card"><h2>Update Job Status</h2><div className="form-grid"><FormField label="Status pekerjaan"><select className="select-input" value={jobStatus || ticket.jobStatus} onChange={event => setJobStatus(event.target.value)}>{JOB_STATUSES.filter(status => !["Draft dikirim", "Final dikirim"].includes(status)).map(status => <option key={status}>{status}</option>)}</select></FormField><FormField label="Estimasi selesai terbaru"><input type="date" className="text-input" value={eta || (ticket.eta ? new Date(ticket.eta).toISOString().slice(0, 10) : "")} onChange={event => setEta(event.target.value)} /></FormField><div className="form-span-2"><FormField label={jobStatus === "Terhambat" ? "Alasan hambatan (wajib)" : "Catatan progres"}><textarea className="text-area" value={jobNote} onChange={event => setJobNote(event.target.value)} placeholder="Apa yang sedang dikerjakan / masukan apa yang ditunggu?" /></FormField></div><div className="modal-actions form-span-2" style={{ paddingTop: 0 }}><Button className="button-primary" onClick={pushJobStatus} disabled={updateJob.isPending}>{updateJob.isPending ? "Menyimpan…" : "Simpan Job Status"}</Button></div></div><p className="form-helper" style={{ marginTop: 9 }}>Job Status adalah progres yang Anda isi. Status proses tiket tetap dikendalikan tahap review dan QC; status kirim draft/final akan tercatat otomatis saat file diunggah.</p></section>}

        {canJob && <section className="detail-card"><h2>Kirim file desain</h2><p className="form-helper">Versi desain internal disimpan untuk review/QC. Ini bukan upload ke server produksi; pencatatan ke 192.168.0.24 baru tersedia setelah QC2 lolos.</p><p className="form-helper">PDF, PNG, JPG, AI, PSD, EPS atau TIFF · maksimum 8 MB per file.</p><div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 12 }}><label className="button-secondary button-small"><FilePlus2 size={13} /> Unggah draft<input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.ai,.psd,.eps,.tif,.tiff" onChange={event => handleUpload(event,"draft")} /></label><label className="button-primary button-small"><FilePlus2 size={13} /> Unggah kandidat final<input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.ai,.psd,.eps,.tif,.tiff" onChange={event => handleUpload(event,"final")} /></label>{busy && <span className="form-helper">Mengunggah file…</span>}</div></section>}

        {allowedReviewer && isEarlyReview && <section className="detail-card"><h2>Review SPV</h2><FormField label="Catatan review / revisi"><textarea className="text-area" value={reviewNote} onChange={event => setReviewNote(event.target.value)} placeholder="Catatan diteruskan ke Designer bila ada revisi." /></FormField><div style={{ display: "flex", gap: 8, marginTop: 12 }}><Button className="button-primary" onClick={() => reviewSpv.mutate({ ticketId, decision: "lolos", note: reviewNote || undefined })} disabled={reviewSpv.isPending}>Layak diajukan ke Owner</Button><Button className="button-danger" onClick={() => reviewSpv.mutate({ ticketId, decision: "revisi", note: reviewNote })} disabled={reviewSpv.isPending}>Kirim revisi</Button></div></section>}

        {role === "owner" && ticket.processStatus === "menunggu_acc_owner" && <section className="detail-card"><h2>Keputusan Owner</h2><FormField label="Catatan Owner"><textarea className="text-area" value={reviewNote} onChange={event => setReviewNote(event.target.value)} placeholder="Wajib untuk ACC dengan catatan, revisi, atau tolak." /></FormField><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}><Button className="button-primary" onClick={() => ownerDecision.mutate({ ticketId, decision: "acc" })}>ACC desain</Button><Button className="button-secondary" onClick={() => ownerDecision.mutate({ ticketId, decision: "acc_catatan", note: reviewNote })}>ACC dengan catatan</Button><Button className="button-secondary" onClick={() => ownerDecision.mutate({ ticketId, decision: "revisi", note: reviewNote })}>Minta revisi</Button><Button className="button-danger" onClick={() => ownerDecision.mutate({ ticketId, decision: "tolak", note: reviewNote })}>Tolak</Button></div></section>}

        {canEnterIds && <section className="detail-card"><h2>Nomor operasional</h2><p className="form-helper">MPP mencatat JOS-D setelah ACC Owner; Admin operasional mencatat JOD/Clipper; Designer mencatat DG pada finalisasi.</p><form className="form-grid" onSubmit={submitIds} style={{ marginTop: 13 }}><FormField label="Nomor JOS-D"><input className="text-input" name="josdNo" defaultValue={currentIds?.josdNo || ""} placeholder="Isi setelah ACC Owner" disabled={role === "admin" || role === "designer"} /></FormField><FormField label="Nomor JOD (Clipper)"><input className="text-input" name="jodNo" defaultValue={currentIds?.jodNo || ""} disabled={role === "mpp" || role === "designer"} /></FormField><FormField label="Status JOD"><select className="select-input" name="jodStatus" defaultValue={currentIds?.jodStatus || "open"} disabled={role === "mpp" || role === "designer"}><option value="open">Open</option><option value="in_progress">In progress</option><option value="closed">Closed</option></select></FormField><FormField label="Nomor DG"><input className="text-input" name="dgNo" defaultValue={currentIds?.dgNo || ""} disabled={role === "admin" || role === "mpp"} /></FormField><div className="modal-actions form-span-2" style={{ paddingTop: 0 }}><Button type="submit" className="button-primary" disabled={updateIds.isPending}>{updateIds.isPending ? "Menyimpan…" : "Simpan nomor"}</Button></div></form><div className="detail-meta" style={{ marginTop: 13 }}><div><span>JOS-D</span><strong>{currentIds?.josdNo || "Belum dicatat"}</strong></div><div><span>JOD / Clipper</span><strong>{currentIds?.jodNo || "Belum dicatat"} · {currentIds?.jodStatus || "—"}</strong></div><div><span>DG</span><strong>{currentIds?.dgNo || "Belum dicatat"}</strong></div></div></section>}

        {canRunQc && <section className="detail-card"><h2>Checklist QC · {qcStage === "spv" ? "SPV Lokal" : qcStage === "qc1" ? "QC Checker 1" : "QC Checker 2"}</h2><p className="form-helper" style={{ marginBottom: 9 }}>Centang butir yang lolos. Untuk butir gagal, catatan revisi wajib diisi.</p><form onSubmit={submitQC}>{QC_ITEMS.map((item,index) => <div className="qc-item" key={item}><span className="qc-num">{String(index+1).padStart(2,"0")}</span><span>{item}</span><label><input type="checkbox" checked={qcAnswers[index+1]?.passed || false} onChange={event => setQcAnswers(prev => ({ ...prev, [index+1]: { passed: event.target.checked, note: prev[index+1]?.note || "" } }))} /> Lolos</label>{qcAnswers[index+1]?.passed === false && <textarea className="text-area" placeholder="Catatan revisi untuk butir ini…" value={qcAnswers[index+1]?.note || ""} onChange={event => setQcAnswers(prev => ({ ...prev, [index+1]: { passed: false, note: event.target.value } }))} />}</div>)}<div style={{ marginTop: 12 }}><FormField label="Ringkasan QC"><textarea className="text-area" value={qcSummary} onChange={event => setQcSummary(event.target.value)} placeholder="Catatan umum (opsional)." /></FormField></div><div className="modal-actions"><Button type="submit" className="button-primary" disabled={submitQc.isPending}>{submitQc.isPending ? "Menyimpan…" : "Simpan hasil QC"}</Button></div></form></section>}

        {canRecordUpload && ticket.processStatus === "siap_upload" && <section className="detail-card"><h2>Upload ke server produksi</h2><p className="form-helper">QC Checker 2 telah lolos. Catat path final di `192.168.0.24` setelah file benar-benar tersedia.</p><div style={{ display: "flex", gap: 8, marginTop: 11 }}><input className="text-input" value={serverPath} onChange={event => setServerPath(event.target.value)} placeholder="192.168.0.24 / path folder final" /><Button className="button-primary" onClick={() => uploadPath.mutate({ ticketId, serverPath })} disabled={!serverPath.trim() || uploadPath.isPending}>Catat upload</Button></div></section>}

        {canClose && ticket.processStatus === "uploaded" && <section className="detail-card"><h2>Penutupan tiket</h2><p className="form-helper">Pastikan JOD berstatus Closed di Clipper dan arsip final sudah lengkap. Status saat ini: {currentIds?.jodStatus || "belum dicatat"}.</p><Button className="button-primary" style={{ marginTop: 11 }} onClick={() => { if (window.confirm("Konfirmasi JOD sudah ditutup di Clipper dan arsip lengkap?")) close.mutate({ ticketId, jodClosed: true }); }} disabled={close.isPending || currentIds?.jodStatus !== "closed"}>Konfirmasi close JOD & tiket</Button></section>}

        <section className="detail-card"><h2>Referensi permintaan</h2>{ticket.requestReferenceFiles.length ? ticket.requestReferenceFiles.map(file => <div className="file-row" key={file.id}><span><strong>{file.fileName}</strong><small>Referensi · {formatDateTime(file.createdAt)}</small></span><a className="button-secondary button-small" href={file.downloadUrl} target="_blank" rel="noreferrer"><Download size={12} /> Buka</a></div>) : <p className="form-helper">Tidak ada lampiran referensi.</p>}{ticket.request.referenceLink && (ticket.request.referenceLink.startsWith("http://") || ticket.request.referenceLink.startsWith("https://") ? <a className="button-quiet button-small" href={ticket.request.referenceLink} target="_blank" rel="noreferrer">Buka tautan</a> : <p className="form-helper">Path jaringan: {ticket.request.referenceLink}</p>)}</section>
        <section className="detail-card"><h2>File & versi</h2>{ticket.files.length ? ticket.files.map(file => <div className="file-row" key={file.id}><span><strong>{file.fileName}</strong><small>{file.fileType.toUpperCase()} · v{file.versionNo} · {(file.fileSize / 1024 / 1024).toFixed(1)} MB · {file.uploaderName || "Akun"} · {formatDateTime(file.createdAt)}</small></span><a className="button-secondary button-small" href={file.downloadUrl} target="_blank" rel="noreferrer"><Download size={12} /> Buka</a></div>) : <EmptyState title="Belum ada file" detail="Draft dan final yang diunggah akan tersimpan sebagai versi tiket." icon={<FilePlus2 size={18} />} />}</section>
      </div>

      <aside className="detail-stack">
        <section className="detail-card"><h2>Status & pemilik</h2><div className="detail-meta"><div><span>Status proses</span><strong><StatusPill status={ticket.processStatus} /></strong></div><div><span>Job Status</span><strong>{ticket.jobStatus}</strong></div><div><span>Designer penanggung jawab</span><strong>{ticket.designerSlot.displayName || ticket.designerSlot.label}</strong></div><div><span>Prioritas</span><strong><PriorityTag priority={ticket.request.finalPriority || ticket.request.requestedPriority} /></strong></div><div><span>Target selesai</span><strong>{formatDate(ticket.eta || ticket.deadline)}</strong></div><div><span>Nomor JOD</span><strong>{currentIds?.jodNo || "—"}</strong></div></div></section>
        {role === "spv" && !["closed", "ditolak_owner"].includes(ticket.processStatus) && <section className="detail-card"><h2>Penugasan Designer</h2><p className="form-helper">SPV dapat memindahkan tiket ke slot aktif lain untuk menyeimbangkan workload; perubahan dicatat di riwayat.</p><form className="form-grid" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); reassignDesigner.mutate({ ticketId, designerSlotId: Number(form.get("designerSlotId")) }); }}><div className="form-span-2"><FormField label="Designer penanggung jawab"><select className="select-input" name="designerSlotId" defaultValue={String(ticket.designerSlotId)} required>{(designerSlotsQuery.data || []).filter(slot => slot.isActive || slot.id === ticket.designerSlot.id).map(slot => <option key={slot.id} value={slot.id}>{slot.displayName || slot.label}{slot.isActive ? "" : " · nonaktif (penugasan lama)"}</option>)}</select></FormField></div><div className="modal-actions form-span-2" style={{ paddingTop: 0 }}><Button type="submit" className="button-primary" disabled={reassignDesigner.isPending || designerSlotsQuery.isLoading}>{reassignDesigner.isPending ? "Menyimpan…" : "Simpan penugasan"}</Button></div></form></section>}
        <section className="detail-card"><h2>Riwayat aktivitas</h2>{ticket.events.length ? ticket.events.map(item => <div className="activity-item" key={item.id}><span className="activity-dot" /><span><strong>{item.eventType.replaceAll("_", " ")}</strong><small>{item.detail || "Perubahan tiket"}<br />{item.actorName || `Akun #${item.actorUserId ?? "—"}`} · {formatDateTime(item.createdAt)}</small></span></div>) : <p className="form-helper">Aktivitas akan dicatat seiring tiket bergerak.</p>}</section>
        <section className="detail-card"><h2>Riwayat Job Status</h2>{ticket.jobUpdates.length ? ticket.jobUpdates.map(item => <div className="activity-item" key={item.id}><span className="activity-dot" /><span><strong>{item.status}</strong><small>{item.note || "Pembaruan status"}<br />{item.designerName || "Designer"} · {formatDateTime(item.createdAt)}</small></span></div>) : <p className="form-helper">Belum ada pembaruan oleh Designer.</p>}</section>
        <section className="detail-card"><h2>Keputusan Owner / review</h2>{ticket.approvals.length ? ticket.approvals.map(item => <div className="activity-item" key={item.id}><span className="activity-dot" /><span><strong>{item.stage.replaceAll("_", " ")} · {item.decision}</strong><small>{item.note || "Tanpa catatan"}<br />{item.reviewerName || "Reviewer"} · {formatDateTime(item.createdAt)}</small></span></div>) : <p className="form-helper">Belum ada keputusan yang dicatat.</p>}</section>
        <section className="detail-card"><h2>Riwayat QC</h2>{openQcHistory.length ? openQcHistory.map(item => <div className="activity-item" key={item.id}><span className="activity-dot" /><span><strong>{item.stage.toUpperCase()} · {item.result.toUpperCase()}</strong><small>{item.summary || `${item.items.filter(answer => answer.passed).length}/${item.items.length} butir lolos`}<br />{item.checkerName || "Checker"} · {formatDateTime(item.createdAt)}</small></span></div>) : <p className="form-helper">QC dimulai setelah finalisasi JOD/DG dan file final tersedia.</p>}</section>
      </aside>
    </div>
  </>;
}
