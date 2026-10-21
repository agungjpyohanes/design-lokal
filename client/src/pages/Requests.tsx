import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { FilePlus2, Search, ClipboardList, Check, X, ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { EmptyState, FormField, Modal, PageTitle, PriorityTag, SlaPill, formatDate } from "@/components/WorkflowUI";

const labelForStatus: Record<string,string> = { baru_masuk: "Baru masuk", perlu_dilengkapi: "Perlu dilengkapi", ditunda: "Ditunda", ditolak: "Ditolak", diterima: "Diterima" };

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
    reader.readAsDataURL(file);
  });
}

export default function RequestsPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const query = trpc.workflow.requests.list.useQuery();
  const create = trpc.workflow.requests.create.useMutation({ onSuccess: async () => { toast.success("Permintaan berhasil dicatat."); setOpen(false); await utils.workflow.requests.list.invalidate(); await utils.workflow.dashboard.invalidate(); } });
  const review = trpc.workflow.requests.review.useMutation({ onSuccess: async () => { toast.success("Keputusan review tersimpan."); setReviewing(null); await utils.workflow.requests.list.invalidate(); await utils.workflow.dashboard.invalidate(); } });
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [similarDesignValue, setSimilarDesignValue] = useState("");
  const [sourceReasonValue, setSourceReasonValue] = useState("");
  const [requestedPriorityValue, setRequestedPriorityValue] = useState("normal");
  const isMarketing = user?.appRole === "marketing";
  const canReview = ["spv", "manager"].includes(user?.appRole || "");
  const canCreate = ["marketing", "owner", "manager", "spv"].includes(user?.appRole || "");
  const rows = useMemo(() => (query.data || []).filter(item => `${item.requestNo} ${item.requesterName} ${item.productType} ${item.status}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const attachment = data.get("referenceFile");
      if (attachment instanceof File && attachment.size > 8 * 1024 * 1024) throw new Error("Ukuran maksimum lampiran referensi adalah 8 MB.");
      await create.mutateAsync({
        source: isMarketing ? "marketing" : String(data.get("source") || "owner") as "marketing" | "owner" | "other",
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
        similarDesign: String(data.get("similarDesign") || "") as "ya" | "tidak" | "tidak_tahu",
        similarDesignRef: String(data.get("similarDesignRef") || "") || undefined,
        requestedPriority: String(data.get("requestedPriority") || "normal") as "normal" | "urgent",
        urgentReason: String(data.get("urgentReason") || "") || undefined,
        deadline: String(data.get("deadline") || "") || undefined,
        referenceLink: String(data.get("referenceLink") || "") || undefined,
        notes: String(data.get("notes") || "") || undefined,
        referenceFile: attachment instanceof File && attachment.size > 0 ? { fileName: attachment.name, contentType: attachment.type || "application/octet-stream", dataBase64: await fileToBase64(attachment) } : undefined,
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Permintaan gagal disimpan."); }
  };

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await review.mutateAsync({ id: reviewing.id, decision: String(data.get("decision")) as "diterima" | "perlu_dilengkapi" | "ditunda" | "ditolak", reason: String(data.get("reason") || "") || undefined, finalPriority: String(data.get("finalPriority") || "normal") as "normal" | "urgent", designReuse: String(data.get("designReuse") || "") as "reuse" | "recolor" | "new" || undefined });
    } catch (e) { setError(e instanceof Error ? e.message : "Keputusan gagal disimpan."); }
  };

  return <>
    <PageTitle kicker="INTAKE / REQUESTS" title="Permintaan desain" subtitle="Validasi kebutuhan lebih dulu. Hanya permintaan yang diterima dapat menjadi tiket internal." action={canCreate ? <Button className="button-primary" onClick={() => setOpen(true)}><FilePlus2 size={15} /> Catat permintaan</Button> : undefined} />
    <div className="panel"><div className="filter-bar"><div className="search-input" style={{ display: "flex", alignItems: "center", gap: 8 }}><Search size={14} color="#8c948b" /><input className="text-input" style={{ border: 0, minHeight: 25, padding: 0, background: "transparent" }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor, peminta, produk…" /></div><span className="section-kicker">{rows.length} PERMINTAAN</span></div>
      {query.isLoading ? <div className="loading-block">Memuat permintaan…</div> : rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Permintaan</th><th>Produk & kebutuhan</th><th>Sumber / alasan</th><th>Referensi</th><th>Prioritas</th><th>Status</th><th>SLA / deadline</th><th>Aksi</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td><span className="ticket-link">{item.requestNo}</span><span className="cell-sub">{item.requesterName}</span></td><td><span className="cell-main">{item.productType}</span><span className="cell-sub">{item.sizeSpec || "Ukuran belum ditentukan"} · {item.seriesCount} series</span></td><td><span className="cell-main">{item.source}</span><span className="cell-sub">{item.sourceReason || item.businessJustification || "—"}</span></td><td>{item.referenceFiles?.map(file => <a key={file.id} className="button-quiet button-small" href={file.downloadUrl} target="_blank" rel="noreferrer">{file.fileName}</a>)}{item.referenceLink && (item.referenceLink.startsWith("http://") || item.referenceLink.startsWith("https://") ? <a className="button-quiet button-small" href={item.referenceLink} target="_blank" rel="noreferrer">Link</a> : <span className="cell-sub">Path jaringan tersimpan</span>)}{!item.referenceFiles?.length && !item.referenceLink && "—"}</td><td><PriorityTag priority={item.finalPriority || item.requestedPriority} /></td><td><span className={`status-pill ${item.status === "diterima" ? "success" : item.status === "ditolak" ? "danger" : item.status === "baru_masuk" ? "amber" : ""}`}><i />{labelForStatus[item.status] || item.status}</span><span className="cell-sub">{item.reviewerName ? `oleh ${item.reviewerName}` : item.reviewReason || ""}</span></td><td>{["baru_masuk", "perlu_dilengkapi"].includes(item.status) && <SlaPill status="review_spv" processUpdatedAt={item.createdAt} maxHours={item.slaHours} />}<span className="cell-sub">{formatDate(item.deadline)}</span></td><td>{canReview && ["baru_masuk", "perlu_dilengkapi"].includes(item.status) ? <button className="button-secondary button-small" onClick={() => { setReviewing(item); setError(""); }}>Review</button> : item.status === "diterima" && user?.appRole === "spv" ? <Link className="button-quiet button-small" href="/tickets">Buat tiket <ArrowRight size={12} /></Link> : <span className="cell-sub">{item.reviewReason || "—"}</span>}</td></tr>)}</tbody></table></div> : <EmptyState title="Belum ada permintaan" detail="Buat permintaan baru. Marketing wajib menyertakan justifikasi bisnis, sumber, dan estimasi produksi." icon={<ClipboardList size={22} />} />}</div>

    {open && <Modal title="Form permintaan desain" detail={isMarketing ? "Lengkapi seluruh field wajib sebelum permintaan dikirim." : "Catat detail kebutuhan; request Marketing wajib memiliki data bisnis lengkap."} onClose={() => { setOpen(false); setError(""); }} wide><form onSubmit={submitRequest} className="form-grid">
      {!isMarketing && <FormField label="Sumber permintaan"><select name="source" className="select-input"><option value="owner">Owner</option><option value="marketing">Marketing</option><option value="other">Lainnya</option></select></FormField>}
      <FormField label="Nama peminta"><input name="requesterName" className="text-input" placeholder={user?.name || "Nama peminta"} /></FormField>
      <FormField label="Kontak"><input name="contact" className="text-input" placeholder="No. WA / kontak" /></FormField>
      <FormField label="Jenis produk *"><select name="productType" className="select-input" required><option value="">Pilih produk</option>{["Buku Tulis","Boxy","Sketchbook","Binder","Kwitansi","Amplop","Paperbag","Kertas Kado","Box Hampers","Packaging","Lainnya"].map(x => <option key={x}>{x}</option>)}</select></FormField>
      <FormField label={`Ukuran / spesifikasi${isMarketing ? " *" : ""}`}><input name="sizeSpec" className="text-input" placeholder="Contoh: A5, 20×20 cm" required={isMarketing} /></FormField>
      <FormField label="Jumlah varian / series"><input name="seriesCount" type="number" min="1" defaultValue="1" className="text-input" /></FormField>
      <FormField label="Deadline yang diharapkan"><input name="deadline" type="date" className="text-input" /></FormField>
      <FormField label="Sumber permintaan *"><select name="sourceReason" className="select-input" required={isMarketing} value={sourceReasonValue} onChange={event => setSourceReasonValue(event.target.value)}><option value="">Pilih sumber</option>{["Riset pasar","Request cabang","Kompetitor","Ide internal","Seasonal","Lainnya"].map(x => <option key={x}>{x}</option>)}</select></FormField>
      <FormField label="Prioritas usulan"><select name="requestedPriority" className="select-input" value={requestedPriorityValue} onChange={event => setRequestedPriorityValue(event.target.value)}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></FormField>
      <FormField label="Estimasi kebutuhan produksi *"><input name="productionEstimate" className="text-input" placeholder="Contoh: 5.000 pcs / 3 bulan" required={isMarketing} /></FormField>
      <FormField label={`Cabang / area target${isMarketing ? " *" : ""}`}><input name="targetArea" className="text-input" placeholder="Nasional / area" required={isMarketing} /></FormField>
      <FormField label="Sudah ada desain serupa?"><select name="similarDesign" className="select-input" required={isMarketing} value={similarDesignValue} onChange={event => setSimilarDesignValue(event.target.value)}><option value="">Pilih</option><option value="tidak_tahu">Tidak tahu</option><option value="ya">Ya</option><option value="tidak">Tidak</option></select></FormField>
      <FormField label="Nomor DG / nama desain serupa"><input name="similarDesignRef" className="text-input" placeholder="Wajib bila memilih Ya" required={isMarketing && similarDesignValue === "ya"} /></FormField>
      <FormField label="Alasan urgent" hint="Wajib bila prioritas Urgent."><input name="urgentReason" className="text-input" placeholder="Order menunggu, seasonal H-30, dll." required={isMarketing && requestedPriorityValue === "urgent"} /></FormField>
      <FormField label="Link / path referensi desain"><input name="referenceLink" type="text" className="text-input" placeholder="https:// atau path file" /></FormField>
      <FormField label="Lampiran referensi (PNG/JPG/PDF, maks. 8 MB)"><input name="referenceFile" type="file" className="text-input" accept=".png,.jpg,.jpeg,.pdf" /></FormField>
      <FormField label={`Tema / konsep desain${isMarketing ? " *" : ""}`} hint="Jelaskan tema, warna, dan elemen yang diminta."><textarea name="theme" className="text-area" required={isMarketing} /></FormField>
      <FormField label="Justifikasi bisnis *" hint="Kenapa desain dibutuhkan sekarang?" ><textarea name="businessJustification" className="text-area" required={isMarketing} /></FormField>
      <FormField label="Referensi kompetitor/pasar"><textarea name="competitorReference" className="text-area" placeholder="Sebutkan merek/produk acuan atau konteks request cabang." required={isMarketing && sourceReasonValue === "Kompetitor"} /></FormField>
      <FormField label="Catatan tambahan"><textarea name="notes" className="text-area" /></FormField>
      {error && <div className="form-error form-span-2">{error}</div>}
      <div className="modal-actions form-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" className="button-primary" disabled={create.isPending}>{create.isPending ? "Menyimpan…" : "Kirim permintaan"}</Button></div>
    </form></Modal>}

    {reviewing && <Modal title={`Review ${reviewing.requestNo}`} detail={`${reviewing.productType} · dari ${reviewing.requesterName}`} onClose={() => setReviewing(null)}><form onSubmit={submitReview} className="form-grid"><FormField label="Keputusan"><select name="decision" className="select-input"><option value="diterima">Diterima</option><option value="perlu_dilengkapi">Perlu dilengkapi</option><option value="ditunda">Ditunda</option><option value="ditolak">Ditolak</option></select></FormField><FormField label="Prioritas final"><select name="finalPriority" className="select-input"><option value="normal">Normal</option><option value="urgent">Urgent</option></select></FormField>{reviewing.similarDesign === "ya" && <FormField label="Penanganan desain serupa *"><select name="designReuse" className="select-input" defaultValue={reviewing.designReuse || ""}><option value="">Pilih opsi</option><option value="reuse">Gunakan desain yang ada</option><option value="recolor">Recolor desain yang ada</option><option value="new">Buat desain baru</option></select></FormField>}<div className="form-span-2"><FormField label="Alasan / catatan keputusan"><textarea name="reason" className="text-area" placeholder="Wajib jika perlu dilengkapi, ditunda, atau ditolak." /></FormField></div>{error && <div className="form-error form-span-2">{error}</div>}<div className="modal-actions form-span-2"><Button type="button" variant="outline" onClick={() => setReviewing(null)}>Batal</Button><Button type="submit" className="button-primary" disabled={review.isPending}>{review.isPending ? "Menyimpan…" : "Simpan review"}</Button></div></form></Modal>}
  </>;
}
