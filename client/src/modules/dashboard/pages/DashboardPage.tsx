import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ClipboardCheck,
  Clock3,
  FilePlus2,
  ShieldAlert,
  Ticket,
  Timer,
  Users2,
} from "lucide-react";
import { Link } from "wouter";
import {
  EmptyState,
  MetricCard,
  PageTitle,
  PriorityTag,
  SlaPill,
  StatusPill,
  formatAge,
  formatDate,
  nextActorLabel,
} from "@/modules/common/components/WorkflowUI";

export function DashboardPage() {
  const { user } = useAuth();
  const query = trpc.workflow.dashboard.useQuery();
  const data = query.data;

  if (query.isLoading) return <div className="loading-block">Memuat ringkasan workspace…</div>;
  if (query.error) return <div className="form-error">{query.error.message}</div>;
  if (!data) return null;

  const actionCount = data.actions.length + data.requestsToReview.length;
  const workloadMax = Math.max(4, ...data.workload.map((item) => item.total));

  return (
    <>
      <PageTitle
        kicker="DESIGN OPERATIONS / OVERVIEW"
        title="Ruang kendali desain"
        subtitle="Lihat tiket yang bergerak, beban tim, dan tindakan yang menunggu Anda."
        action={
          ["marketing", "owner", "manager", "spv"].includes(user?.appRole || "") ? (
            <Link href="/requests" className="button-primary">
              <FilePlus2 size={15} /> Buat permintaan
            </Link>
          ) : undefined
        }
      />
      <section className="stats-row" aria-label="Ringkasan proses">
        <MetricCard
          label="Tiket aktif"
          value={data.stats.open}
          detail="Belum masuk arsip"
          tone="teal"
          icon={<Ticket size={15} />}
        />
        <MetricCard
          label="Permintaan baru"
          value={data.stats.pendingReview}
          detail="Menunggu review"
          tone="amber"
          icon={<FilePlus2 size={15} />}
        />
        <MetricCard
          label="Menunggu Owner"
          value={data.stats.waitingOwner}
          detail="Butuh keputusan"
          icon={<Clock3 size={15} />}
        />
        <MetricCard
          label="Dalam QC"
          value={data.stats.quality}
          detail="SPV → QC 1 → QC 2"
          tone="teal"
          icon={<ClipboardCheck size={15} />}
        />
        <MetricCard
          label="Lewat target"
          value={data.stats.overdue}
          detail="Tenggat terlewati"
          tone="risk"
          icon={<ShieldAlert size={15} />}
        />
        <MetricCard
          label="Closed bulan ini"
          value={data.stats.closedThisMonth}
          detail="Selesai diarsipkan"
          tone="green"
          icon={<Timer size={15} />}
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Tiket yang bergerak</div>
              <div className="panel-subtitle">Status terkini dari jalur produksi desain</div>
            </div>
            <Link className="button-quiet button-small" href="/tickets">
              Semua tiket →
            </Link>
          </div>
          {data.tickets.length ? (
            <>
              {/* Tampilan Desktop Table dengan Horizontal Scroll */}
              <div className="table-wrap desktop-table-only">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tiket / produk</th>
                      <th>Designer</th>
                      <th>Job status</th>
                      <th>Proses / PIC berikutnya</th>
                      <th>SLA / target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>
                          <Link className="ticket-link" href={`/tickets/${ticket.id}`}>
                            {ticket.ticketNo}
                          </Link>
                          <span className="cell-sub">
                            {ticket.productType} · <PriorityTag priority={ticket.priority} />
                          </span>
                          <span className="cell-sub">Umur {formatAge(ticket.createdAt)}</span>
                        </td>
                        <td>{ticket.designerLabel}</td>
                        <td>
                          <span className="cell-main">{ticket.jobStatus}</span>
                        </td>
                        <td>
                          <StatusPill status={ticket.processStatus} />
                          <span className="cell-sub">
                            Berikutnya: {nextActorLabel(ticket.processStatus)}
                          </span>
                        </td>
                        <td>
                          <SlaPill
                            status={ticket.processStatus}
                            processUpdatedAt={ticket.processUpdatedAt}
                            deadline={ticket.deadline}
                            maxHours={ticket.slaHours}
                          />
                          <span className="cell-sub">{formatDate(ticket.deadline)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tampilan Kartu Khusus Mobile / Layar Kecil */}
              <div className="mobile-card-list mobile-cards-only">
                {data.tickets.map((ticket) => (
                  <div key={ticket.id} className="mobile-data-card">
                    <div className="mobile-card-header">
                      <Link className="ticket-link font-bold" href={`/tickets/${ticket.id}`} style={{ fontSize: 13, fontWeight: 700 }}>
                        {ticket.ticketNo}
                      </Link>
                      <PriorityTag priority={ticket.priority} />
                    </div>
                    <div className="mobile-card-title">{ticket.productType}</div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Designer:</span>
                      <span className="mobile-card-val">{ticket.designerLabel}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Job Status:</span>
                      <span className="mobile-card-val" style={{ fontWeight: 600 }}>{ticket.jobStatus}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Proses:</span>
                      <StatusPill status={ticket.processStatus} />
                    </div>
                    <div className="mobile-card-footer">
                      <span style={{ fontSize: 10, color: "#64748b" }}>
                        Umur {formatAge(ticket.createdAt)}
                      </span>
                      <Link className="button-secondary button-small" href={`/tickets/${ticket.id}`}>
                        Lihat Tiket →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="Belum ada tiket aktif"
              detail="Permintaan yang diterima SPV akan muncul di sini setelah dibuat menjadi tiket dan ditugaskan kepada Designer."
              icon={<Ticket size={21} />}
            />
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Tindakan saya</div>
              <div className="panel-subtitle">Langkah yang perlu ditindaklanjuti</div>
            </div>
            <span className="section-kicker">{String(actionCount).padStart(2, "0")}</span>
          </div>
          <div className="panel-body">
            {actionCount ? (
              <div className="action-list">
                {data.requestsToReview.map((request, index) => (
                  <Link
                    className="action-row"
                    href="/requests"
                    key={`request-${request.id}`}
                  >
                    <span className="action-index">{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>
                        {request.requestNo} · {request.productType}
                      </strong>
                      <small>{request.requesterName} / permintaan menunggu review</small>
                    </span>
                    <StatusPill status={request.status} />
                  </Link>
                ))}
                {data.actions.map((ticket, index) => (
                  <Link
                    className="action-row"
                    href={`/tickets/${ticket.id}`}
                    key={ticket.id}
                  >
                    <span className="action-index">
                      {String(index + data.requestsToReview.length + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>
                        {ticket.ticketNo} · {ticket.productType}
                      </strong>
                      <small>
                        {ticket.designerLabel} / {ticket.jobStatus}
                      </small>
                    </span>
                    <StatusPill status={ticket.processStatus} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Tidak ada antrean"
                detail="Tindakan sesuai role Anda akan muncul di panel ini."
                icon={<ClipboardCheck size={20} />}
              />
            )}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 15 }}>
        <div className="panel-head">
          <div>
            <div className="panel-title">Beban kerja Designer</div>
            <div className="panel-subtitle">
              Jumlah tiket aktif per slot · indikator antrean, bukan estimasi jam kerja
            </div>
          </div>
          <span className="section-kicker">DESIGNER 01—08</span>
        </div>
        <div className="panel-body">
          <div className="workload-list">
            {data.workload.length ? (
              data.workload.map((slot) => {
                const load = Math.round((slot.total / workloadMax) * 100);
                const workWidth = slot.total
                  ? Math.round(((slot.working + slot.notStarted) / slot.total) * 100)
                  : 0;
                const waitWidth = slot.total
                  ? Math.round((slot.waiting / slot.total) * 100)
                  : 0;
                const riskWidth = Math.max(0, 100 - workWidth - waitWidth);
                const base = `/tickets?designer=${slot.slotNumber}`;
                return (
                  <div className="workload-row" key={slot.id}>
                    <Link className="designer-name" href={base}>
                      <span className="designer-initial">
                        {String(slot.slotNumber).padStart(2, "0")}
                      </span>
                      <span>{slot.displayName || slot.label}</span>
                    </Link>
                    <Link
                      className="workload-track"
                      href={base}
                      aria-label={`Semua tiket ${slot.displayName || slot.label}`}
                      style={{ background: "#e8e8df" }}
                    >
                      <span
                        className="work"
                        style={{
                          width: `${Math.min(100, load)}%`,
                          opacity: 0.45 + workWidth / 200,
                        }}
                      />
                      <span
                        className="wait"
                        style={{ width: `${Math.min(100 - load, waitWidth)}%` }}
                      />
                      <span
                        className="risk"
                        style={{
                          width: `${Math.min(100 - load - waitWidth, slot.overdue ? riskWidth : 0)}%`,
                        }}
                      />
                    </Link>
                    <Link className="workload-count" href={base}>
                      {slot.total}
                    </Link>
                    <span className="workload-caption">
                      <Link href={`${base}&jobStatus=Belum%20mulai`}>
                        {slot.notStarted} antrean
                      </Link>{" "}
                      ·{" "}
                      <Link href={`${base}&jobStatus=Sedang%20dikerjakan`}>
                        {slot.working} dikerjakan
                      </Link>{" "}
                      ·{" "}
                      <Link href={`${base}&jobStatus=Revisi%20dikerjakan`}>
                        {slot.revision} revisi
                      </Link>{" "}
                      ·{" "}
                      <Link href={`${base}&jobStatus=Menunggu%20feedback%2Fkeputusan`}>
                        {slot.waiting} menunggu
                      </Link>{" "}
                      ·{" "}
                      <Link href={`${base}&jobStatus=Terhambat`}>
                        {slot.blocked} terhambat
                      </Link>{" "}
                      · <Link href={`${base}&sla=overdue`}>{slot.overdue} overdue</Link>
                    </span>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="Workload Designer belum tersedia"
                detail="Panel beban kerja muncul untuk SPV, Manager, Owner, dan Admin operasional."
                icon={<Users2 size={20} />}
              />
            )}
          </div>
        </div>
      </section>

      <section className="dashboard-grid" style={{ marginTop: 15 }}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Permintaan terbaru</div>
              <div className="panel-subtitle">Intake yang tercatat di sistem</div>
            </div>
            <Link href="/requests" className="button-quiet button-small">
              Buka permintaan →
            </Link>
          </div>
          {data.requests.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nomor / peminta</th>
                    <th>Produk</th>
                    <th>Sumber</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.requests.slice(0, 6).map((request) => (
                    <tr key={request.id}>
                      <td>
                        <Link href="/requests" className="ticket-link">
                          {request.requestNo}
                        </Link>
                        <span className="cell-sub">{request.requesterName}</span>
                      </td>
                      <td>{request.productType}</td>
                      <td>{request.source}</td>
                      <td>
                        <span className="status-pill">
                          <i />
                          {request.status.replaceAll("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Intake masih kosong"
              detail="Catat permintaan Marketing atau Owner untuk memulai alur desain."
              icon={<FilePlus2 size={20} />}
            />
          )}
        </div>
        <div
          className="detail-card"
          style={{ background: "#e8eee7", borderColor: "#d7e2d8" }}
        >
          <p className="eyebrow">CONTROL NOTE / 01</p>
          <h2 style={{ fontSize: 16, lineHeight: 1.3, marginBottom: 9 }}>
            Tiket dibuat sebelum Designer mulai.
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Setiap tiket harus memiliki satu Designer penanggung jawab dari slot aktif 1–8.
            Job Status diisi Designer; status workflow tetap mengikuti gerbang review dan
            QC.
          </p>
          <div style={{ display: "flex", gap: 6, marginTop: 17, flexWrap: "wrap" }}>
            <span className="status-pill teal">
              <i />
              BRIEF
            </span>
            <span className="status-pill amber">
              <i />
              OWNER
            </span>
            <span className="status-pill success">
              <i />
              QC2
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

export default DashboardPage;
