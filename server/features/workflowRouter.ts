import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { appRoles, activityEvents, approvals, designerSlots, jobUpdates, operationalIds, qcReviews, requestFiles, requests, ticketFiles, tickets, users, workflowSlaRules } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storageGetSignedUrl, storagePut } from "../storage";
import { APP_ROLE_LABELS, JOB_STATUSES, PROCESS_LABELS, PROCESS_SLA_HOURS, PROCESS_SLA_STATUSES, QC_ITEMS, QC_STAGES, SLA_DEFAULT_HOURS, SLA_RULE_KEYS, SLA_RULE_LABELS } from "../../shared/workflow";

const emptyToNull = (value?: string | null) => value?.trim() ? value.trim() : null;
const roles = (...allowed: string[]) => (role: string) => {
  if (!allowed.includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Role Anda tidak memiliki akses untuk tindakan ini." });
};
const ensureAdmin = (role: string) => roles("superadmin")(role);

async function readSlaHours(db: Awaited<ReturnType<typeof database>>) {
  const overrides = await db.select().from(workflowSlaRules);
  return { ...SLA_DEFAULT_HOURS, ...Object.fromEntries(overrides.map(rule => [rule.processStatus, rule.maxHours])) } as Record<string, number>;
}

function ticketIsOverdue(ticket: { processStatus: string; processUpdatedAt: Date; deadline: Date | null }, now = new Date(), slaHours: Record<string, number> = PROCESS_SLA_HOURS) {
  const stageHours = slaHours[ticket.processStatus];
  const stageDue = stageHours ? new Date(ticket.processUpdatedAt).getTime() + stageHours * 60 * 60 * 1000 : null;
  let deadlineDue: number | null = null;
  if (ticket.deadline) {
    const deadline = new Date(ticket.deadline);
    deadline.setHours(23, 59, 59, 999);
    deadlineDue = deadline.getTime();
  }
  const due = stageDue && deadlineDue ? Math.min(stageDue, deadlineDue) : stageDue ?? deadlineDue;
  return due !== null && due < now.getTime();
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database belum tersedia." });
  return db;
}

async function event(input: { ticketId?: number | null; requestId?: number | null; actorUserId: number; eventType: string; detail?: string }, executor?: any) {
  const db = executor ?? await database();
  await db.insert(activityEvents).values({
    ticketId: input.ticketId ?? null,
    requestId: input.requestId ?? null,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    detail: input.detail ?? null,
  });
}

async function ensureDesignerSlots() {
  const db = await database();
  const existing = await db.select().from(designerSlots);
  const found = new Set(existing.map(slot => slot.slotNumber));
  for (let n = 1; n <= 8; n++) {
    if (!found.has(n)) {
      await db.insert(designerSlots).values({ slotNumber: n, label: `Designer ${n}`, isActive: true }).onDuplicateKeyUpdate({ set: { label: `Designer ${n}` } });
    }
  }
  return db.select().from(designerSlots).orderBy(designerSlots.slotNumber);
}

async function ticketRows() {
  const db = await database();
  return db.select({ ticket: tickets, request: requests, slot: designerSlots })
    .from(tickets)
    .innerJoin(requests, eq(tickets.requestId, requests.id))
    .innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id))
    .orderBy(desc(tickets.updatedAt))
    .limit(250);
}

function visibleRows<T extends { request: { requesterUserId: number | null }; slot: { userId: number | null } }>(rows: T[], user: { id: number; appRole: string }) {
  if (user.appRole === "designer") return rows.filter(row => row.slot.userId === user.id);
  if (user.appRole === "marketing") return rows.filter(row => row.request.requesterUserId === user.id);
  return rows;
}

function canReadTicket(role: string) {
  roles("admin", "superadmin", "owner", "manager", "spv", "designer", "mpp", "qc1", "qc2", "marketing")(role);
}

export const workflowRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    const role = ctx.user.appRole;
    if (role === "unassigned") return { role, requests: [], requestsToReview: [], tickets: [], workload: [], stats: { open: 0, pendingReview: 0, waitingOwner: 0, quality: 0, overdue: 0, closedThisMonth: 0 }, actions: [] };
    const allRequests = await db.select().from(requests).orderBy(desc(requests.createdAt)).limit(120);
    const requestVisibleRoles = ["marketing", "owner", "manager", "spv", "superadmin"];
    const visibleRequests = !requestVisibleRoles.includes(role) ? [] : role === "marketing" ? allRequests.filter(r => r.requesterUserId === ctx.user.id) : allRequests;
    let rows = visibleRows(await ticketRows(), ctx.user);
    if (role === "qc1") rows = rows.filter(({ ticket }) => ticket.processStatus === "qc1");
    if (role === "qc2") rows = rows.filter(({ ticket }) => ticket.processStatus === "qc2");
    const now = new Date();
    const slaHours = await readSlaHours(db);
    const activeRows = rows.filter(({ ticket }) => ticket.processStatus !== "closed" && ticket.processStatus !== "ditolak_owner");
    const overdueRequests = visibleRequests.filter(request => ["baru_masuk", "perlu_dilengkapi"].includes(request.status) && new Date(request.createdAt).getTime() + slaHours.request_review * 60 * 60 * 1000 < now.getTime()).length;
    const overdue = activeRows.filter(({ ticket }) => ticketIsOverdue(ticket, now, slaHours)).length + overdueRequests;
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const closedThisMonth = rows.filter(({ ticket }) => ticket.processStatus === "closed" && ticket.closedAt && new Date(ticket.closedAt).getMonth() === currentMonth && new Date(ticket.closedAt).getFullYear() === currentYear).length;
    const workloadVisible = ["superadmin", "admin", "spv", "manager", "owner"].includes(role);
    const slots = workloadVisible || role === "designer" ? await ensureDesignerSlots() : [];
    const workload = slots.map(slot => {
      const assigned = activeRows.filter(row => row.slot.id === slot.id);
      return {
        ...slot,
        total: assigned.length,
        notStarted: assigned.filter(row => row.ticket.jobStatus === "Belum mulai").length,
        working: assigned.filter(row => row.ticket.jobStatus === "Sedang dikerjakan" || row.ticket.jobStatus === "Revisi dikerjakan").length,
        revision: assigned.filter(row => row.ticket.jobStatus === "Revisi dikerjakan" || ["revisi", "revisi_owner", "revisi_qc"].includes(row.ticket.processStatus)).length,
        waiting: assigned.filter(row => row.ticket.jobStatus === "Menunggu feedback/keputusan").length,
        blocked: assigned.filter(row => row.ticket.jobStatus === "Terhambat").length,
        overdue: assigned.filter(row => ticketIsOverdue(row.ticket, now, slaHours)).length,
      };
    }).filter(slot => workloadVisible || slot.userId === ctx.user.id);
    const openRequests = visibleRequests.filter(r => ["baru_masuk", "perlu_dilengkapi"].includes(r.status)).length;
    const requestsToReview = ["manager", "spv"].includes(role) ? visibleRequests.filter(request => ["baru_masuk", "perlu_dilengkapi"].includes(request.status)).slice(0, 6) : [];
    const actions = activeRows.filter(({ ticket }) => {
      if (role === "spv") return ["draft", "review_spv", "revisi", "qc_spv", "siap_upload", "uploaded"].includes(ticket.processStatus);
      if (role === "admin") return ticket.processStatus === "uploaded";
      if (role === "owner") return ticket.processStatus === "menunggu_acc_owner";
      if (role === "designer") return ["draft", "revisi", "revisi_owner", "finalisasi", "revisi_qc"].includes(ticket.processStatus);
      if (role === "qc1") return ticket.processStatus === "qc1";
      if (role === "qc2") return ticket.processStatus === "qc2";
      if (role === "mpp") return ticket.processStatus === "menunggu_josd";
      return false;
    }).slice(0, 8);
    return {
      role,
      requests: visibleRequests.slice(0, 8),
      requestsToReview,
      tickets: rows.slice(0, 10).map(row => ({ ...row.ticket, productType: row.request.productType, priority: row.request.finalPriority ?? row.request.requestedPriority, designerLabel: row.slot.displayName || row.slot.label, requesterName: row.request.requesterName, slaHours: slaHours[row.ticket.processStatus] })),
      workload,
      stats: {
        open: activeRows.length,
        pendingReview: openRequests,
        waitingOwner: activeRows.filter(({ ticket }) => ticket.processStatus === "menunggu_acc_owner").length,
        quality: activeRows.filter(({ ticket }) => ["qc_spv", "qc1", "qc2", "revisi_qc"].includes(ticket.processStatus)).length,
        overdue,
        closedThisMonth,
      },
      actions: actions.map(({ ticket, request, slot }) => ({ ...ticket, productType: request.productType, designerLabel: slot.displayName || slot.label })),
    };
  }),

  requests: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      roles("superadmin", "marketing", "owner", "manager", "spv")(ctx.user.appRole);
      const db = await database();
      const slaHours = await readSlaHours(db);
      const rows = await db.select({ request: requests, reviewerName: users.name }).from(requests).leftJoin(users, eq(requests.reviewedBy, users.id)).orderBy(desc(requests.createdAt)).limit(200);
      const visible = ctx.user.appRole === "marketing" ? rows.filter(({ request }) => request.requesterUserId === ctx.user.id) : rows;
      if (!visible.length) return [];
      const files = await db.select().from(requestFiles).where(inArray(requestFiles.requestId, visible.map(({ request }) => request.id)));
      return Promise.all(visible.map(async ({ request, reviewerName }) => ({
        ...request,
        reviewerName,
        slaHours: slaHours.request_review,
        referenceFiles: await Promise.all(files.filter(file => file.requestId === request.id).map(async file => {
          try { return { ...file, downloadUrl: await storageGetSignedUrl(file.storageKey) }; }
          catch { return { ...file, downloadUrl: `/manus-storage/${file.storageKey}` }; }
        })),
      })));
    }),
    create: protectedProcedure.input(z.object({
      source: z.enum(["marketing", "owner", "other"]),
      requesterName: z.string().trim().min(2).max(160).optional(),
      contact: z.string().max(120).optional(),
      productType: z.string().trim().min(2).max(100),
      sizeSpec: z.string().max(120).optional(),
      seriesCount: z.number().int().min(1).max(100).default(1),
      theme: z.string().max(4000).optional(),
      sourceReason: z.string().max(120).optional(),
      competitorReference: z.string().max(2000).optional(),
      productionEstimate: z.string().max(160).optional(),
      targetArea: z.string().max(160).optional(),
      businessJustification: z.string().max(3000).optional(),
      similarDesign: z.enum(["ya", "tidak", "tidak_tahu"]).optional(),
      similarDesignRef: z.string().max(160).optional(),
      requestedPriority: z.enum(["normal", "urgent"]).default("normal"),
      urgentReason: z.string().max(2000).optional(),
      deadline: z.string().date().optional(),
      referenceLink: z.string().max(2000).optional(),
      notes: z.string().max(2000).optional(),
      referenceFile: z.object({ fileName: z.string().min(1).max(255), contentType: z.string().max(120), dataBase64: z.string().min(1).max(12_000_000) }).optional(),
    }).superRefine((data, ctx) => {
      if (data.source === "marketing") {
        if (!data.productionEstimate?.trim()) ctx.addIssue({ code: "custom", path: ["productionEstimate"], message: "Estimasi produksi wajib diisi." });
        if (!data.businessJustification?.trim()) ctx.addIssue({ code: "custom", path: ["businessJustification"], message: "Justifikasi bisnis wajib diisi." });
        if (!data.sourceReason?.trim()) ctx.addIssue({ code: "custom", path: ["sourceReason"], message: "Sumber permintaan wajib dipilih." });
        if (!data.targetArea?.trim()) ctx.addIssue({ code: "custom", path: ["targetArea"], message: "Cabang/area target wajib diisi." });
        if (!data.sizeSpec?.trim()) ctx.addIssue({ code: "custom", path: ["sizeSpec"], message: "Ukuran/spesifikasi wajib diisi." });
        if (!data.theme?.trim()) ctx.addIssue({ code: "custom", path: ["theme"], message: "Tema/konsep desain wajib diisi." });
        if (!data.similarDesign) ctx.addIssue({ code: "custom", path: ["similarDesign"], message: "Pilih apakah desain serupa sudah ada." });
        if (data.similarDesign === "ya" && !data.similarDesignRef?.trim()) ctx.addIssue({ code: "custom", path: ["similarDesignRef"], message: "Sebutkan nomor DG atau nama desain serupa." });
        if (data.sourceReason === "Kompetitor" && !data.competitorReference?.trim()) ctx.addIssue({ code: "custom", path: ["competitorReference"], message: "Cantumkan merek/produk acuan kompetitor." });
      }
      if (data.referenceLink?.trim() && !(/^https?:\/\//i.test(data.referenceLink.trim()) || /^\\\\192\.168\.0\.24[\\/]/i.test(data.referenceLink.trim()) || /^192\.168\.0\.24[\\/]/i.test(data.referenceLink.trim()))) ctx.addIssue({ code: "custom", path: ["referenceLink"], message: "Referensi harus berupa URL HTTP(S) atau path pada server 192.168.0.24." });
      if (data.requestedPriority === "urgent" && !data.urgentReason?.trim()) ctx.addIssue({ code: "custom", path: ["urgentReason"], message: "Alasan urgent wajib diisi." });
    })).mutation(async ({ ctx, input }) => {
      roles("marketing", "owner", "manager", "spv")(ctx.user.appRole);
      if (ctx.user.appRole === "marketing" && input.source !== "marketing") throw new TRPCError({ code: "FORBIDDEN", message: "Marketing hanya dapat membuat permintaan Marketing." });
      const db = await database();
      const existing = await db.select({ id: requests.id }).from(requests);
      const requestNo = `REQ-${new Date().getFullYear()}-${String(existing.length + 1).padStart(3, "0")}`;
      let storedReference: { key: string; bytes: Buffer; contentType: string } | null = null;
      if (input.referenceFile) {
        const ext = input.referenceFile.fileName.split(".").pop()?.toLowerCase() ?? "";
        if (!["png", "jpg", "jpeg", "pdf"].includes(ext)) throw new TRPCError({ code: "BAD_REQUEST", message: "Lampiran referensi harus berupa PNG, JPG, atau PDF." });
        const bytes = Buffer.from(input.referenceFile.dataBase64, "base64");
        if (bytes.length > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Ukuran maksimum lampiran adalah 8 MB." });
        const safeName = input.referenceFile.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const contentType = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
        const upload = await storagePut(`design-local/requests/${requestNo}/${Date.now()}_${safeName}`, bytes, contentType);
        storedReference = { key: upload.key, bytes, contentType };
      }
      let created: typeof requests.$inferSelect | undefined;
      await db.transaction(async tx => {
        await tx.insert(requests).values({
          requestNo,
          source: input.source,
          requesterName: input.requesterName?.trim() || ctx.user.name || "Peminta",
          requesterUserId: ctx.user.id,
          contact: emptyToNull(input.contact),
          productType: input.productType,
          sizeSpec: emptyToNull(input.sizeSpec),
          seriesCount: input.seriesCount,
          theme: emptyToNull(input.theme),
          sourceReason: emptyToNull(input.sourceReason),
          competitorReference: emptyToNull(input.competitorReference),
          productionEstimate: emptyToNull(input.productionEstimate),
          targetArea: emptyToNull(input.targetArea),
          businessJustification: emptyToNull(input.businessJustification),
          similarDesign: emptyToNull(input.similarDesign),
          similarDesignRef: emptyToNull(input.similarDesignRef),
          requestedPriority: input.requestedPriority,
          urgentReason: emptyToNull(input.urgentReason),
          deadline: input.deadline ? new Date(`${input.deadline}T00:00:00Z`) : null,
          referenceLink: emptyToNull(input.referenceLink),
          notes: emptyToNull(input.notes),
          status: "baru_masuk",
        });
        [created] = await tx.select().from(requests).where(eq(requests.requestNo, requestNo)).limit(1);
        if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Permintaan tidak berhasil disimpan." });
        if (storedReference && input.referenceFile) {
          await tx.insert(requestFiles).values({ requestId: created.id, uploadedBy: ctx.user.id, fileName: input.referenceFile.fileName, storageKey: storedReference.key, contentType: storedReference.contentType, fileSize: storedReference.bytes.length });
        }
        await event({ requestId: created.id, actorUserId: ctx.user.id, eventType: "request_created", detail: `Permintaan ${requestNo} dibuat.` }, tx);
      });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Permintaan tidak berhasil disimpan." });
      return created;
    }),
    review: protectedProcedure.input(z.object({ id: z.number().int(), decision: z.enum(["diterima", "perlu_dilengkapi", "ditunda", "ditolak"]), reason: z.string().max(2000).optional(), finalPriority: z.enum(["normal", "urgent"]).optional(), designReuse: z.enum(["reuse", "recolor", "new"]).optional() })).mutation(async ({ ctx, input }) => {
      roles("spv", "manager")(ctx.user.appRole);
      if (input.decision !== "diterima" && !input.reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Alasan keputusan wajib dicatat." });
      const db = await database();
      const [request] = await db.select().from(requests).where(eq(requests.id, input.id)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Permintaan tidak ditemukan." });
      if (request.status === "diterima" && input.decision !== "diterima") throw new TRPCError({ code: "CONFLICT", message: "Permintaan yang telah diterima tidak dapat diubah melalui review awal." });
      if (input.decision === "diterima" && request.similarDesign === "ya" && !input.designReuse) throw new TRPCError({ code: "BAD_REQUEST", message: "Pilih apakah desain serupa digunakan, di-recolor, atau dibuat baru." });
      await db.transaction(async tx => {
        await tx.update(requests).set({ status: input.decision, reviewDecision: input.decision, reviewReason: emptyToNull(input.reason), finalPriority: input.finalPriority ?? request.requestedPriority, designReuse: input.designReuse ?? request.designReuse, reviewedBy: ctx.user.id, reviewedAt: new Date() }).where(eq(requests.id, input.id));
        await event({ requestId: input.id, actorUserId: ctx.user.id, eventType: "request_reviewed", detail: `Keputusan: ${input.decision}${input.designReuse ? ` · penanganan desain serupa: ${input.designReuse}` : ""}${input.reason ? `. ${input.reason}` : ""}` }, tx);
      });
      return { success: true };
    }),
  }),

  tickets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      canReadTicket(ctx.user.appRole);
      const db = await database();
      const slaHours = await readSlaHours(db);
      const rows = visibleRows(await ticketRows(), ctx.user).filter(({ ticket }) => ctx.user.appRole === "qc1" ? ticket.processStatus === "qc1" : ctx.user.appRole === "qc2" ? ticket.processStatus === "qc2" : true);
      return rows.map(({ ticket, request, slot }) => ({ ...ticket, request, designerSlot: slot, designerLabel: slot.displayName || slot.label, slaHours: slaHours[ticket.processStatus] }));
    }),
    mine: protectedProcedure.query(async ({ ctx }) => {
      roles("designer")(ctx.user.appRole);
      const db = await database();
      const slaHours = await readSlaHours(db);
      const rows = visibleRows(await ticketRows(), ctx.user).filter(({ ticket }) => !["closed", "ditolak_owner"].includes(ticket.processStatus));
      return rows.map(({ ticket, request, slot }) => ({ ...ticket, request, designerSlot: slot, designerLabel: slot.displayName || slot.label, slaHours: slaHours[ticket.processStatus] }));
    }),
    createFromRequest: protectedProcedure.input(z.object({ requestId: z.number().int(), designerSlotId: z.number().int(), brief: z.string().trim().min(5).max(5000), deadline: z.string().date().optional() })).mutation(async ({ ctx, input }) => {
      roles("spv")(ctx.user.appRole);
      const db = await database();
      const [request] = await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
      if (!request || request.status !== "diterima") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Hanya permintaan yang sudah Diterima dapat dibuat menjadi tiket." });
      const [slot] = await db.select().from(designerSlots).where(eq(designerSlots.id, input.designerSlotId)).limit(1);
      if (!slot || !slot.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Pilih slot Designer aktif dari Designer 1–8." });
      const [existing] = await db.select().from(tickets).where(eq(tickets.requestId, request.id)).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Tiket untuk permintaan ini sudah dibuat." });
      const count = (await db.select({ id: tickets.id }).from(tickets)).length;
      const ticketNo = `DES-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
      let created: typeof tickets.$inferSelect | undefined;
      await db.transaction(async tx => {
        await tx.insert(tickets).values({ ticketNo, requestId: request.id, spvUserId: ctx.user.id, designerSlotId: slot.id, brief: input.brief, processStatus: "draft", jobStatus: "Belum mulai", deadline: input.deadline ? new Date(`${input.deadline}T00:00:00Z`) : request.deadline });
        [created] = await tx.select().from(tickets).where(eq(tickets.ticketNo, ticketNo)).limit(1);
        if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Tiket tidak berhasil dibuat." });
        await event({ ticketId: created.id, actorUserId: ctx.user.id, eventType: "ticket_created", detail: `${ticketNo} ditugaskan ke ${slot.displayName || slot.label}.` }, tx);
      });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Tiket tidak berhasil dibuat." });
      return created;
    }),
    reassignDesigner: protectedProcedure.input(z.object({ ticketId: z.number().int(), designerSlotId: z.number().int() })).mutation(async ({ ctx, input }) => {
      roles("spv")(ctx.user.appRole);
      const db = await database();
      const [current] = await db.select({ ticket: tickets, slot: designerSlots }).from(tickets).innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id)).where(eq(tickets.id, input.ticketId)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
      if (["closed", "ditolak_owner"].includes(current.ticket.processStatus)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tiket Closed/ditolak tidak dapat dialihkan." });
      const [nextSlot] = await db.select().from(designerSlots).where(eq(designerSlots.id, input.designerSlotId)).limit(1);
      if (!nextSlot || !nextSlot.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Pilih slot Designer aktif." });
      if (nextSlot.id === current.slot.id) return { success: true, unchanged: true };
      await db.transaction(async tx => {
        await tx.update(tickets).set({ designerSlotId: nextSlot.id }).where(eq(tickets.id, input.ticketId));
        await event({ ticketId: input.ticketId, actorUserId: ctx.user.id, eventType: "designer_reassigned", detail: `Penugasan dialihkan dari ${current.slot.displayName || current.slot.label} ke ${nextSlot.displayName || nextSlot.label}.` }, tx);
      });
      return { success: true, unchanged: false };
    }),
    detail: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
      canReadTicket(ctx.user.appRole);
      const db = await database();
      const slaHours = await readSlaHours(db);
      const [row] = await db.select({ ticket: tickets, request: requests, slot: designerSlots })
        .from(tickets).innerJoin(requests, eq(tickets.requestId, requests.id)).innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id))
        .where(eq(tickets.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
      if (ctx.user.appRole === "designer" && row.slot.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Tiket ini bukan penugasan Anda." });
      if (ctx.user.appRole === "marketing" && row.request.requesterUserId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Anda tidak memiliki akses ke tiket ini." });
      if (ctx.user.appRole === "qc1" && row.ticket.processStatus !== "qc1") throw new TRPCError({ code: "FORBIDDEN", message: "QC Checker 1 hanya dapat membuka tiket yang sedang berada di tahap QC1." });
      if (ctx.user.appRole === "qc2" && row.ticket.processStatus !== "qc2") throw new TRPCError({ code: "FORBIDDEN", message: "QC Checker 2 hanya dapat membuka tiket yang sedang berada di tahap QC2." });
      const [op] = await db.select().from(operationalIds).where(eq(operationalIds.ticketId, input.id)).limit(1);
      const [fileRows, approvalRows, qcRows, eventRows, updateRows, references] = await Promise.all([
        db.select({ file: ticketFiles, uploaderName: users.name }).from(ticketFiles).leftJoin(users, eq(ticketFiles.uploadedBy, users.id)).where(eq(ticketFiles.ticketId, input.id)).orderBy(desc(ticketFiles.createdAt)),
        db.select({ approval: approvals, reviewerName: users.name }).from(approvals).leftJoin(users, eq(approvals.reviewerUserId, users.id)).where(eq(approvals.ticketId, input.id)).orderBy(desc(approvals.createdAt)),
        db.select({ review: qcReviews, checkerName: users.name }).from(qcReviews).leftJoin(users, eq(qcReviews.checkerUserId, users.id)).where(eq(qcReviews.ticketId, input.id)).orderBy(desc(qcReviews.createdAt)),
        db.select({ event: activityEvents, actorName: users.name }).from(activityEvents).leftJoin(users, eq(activityEvents.actorUserId, users.id)).where(eq(activityEvents.ticketId, input.id)).orderBy(desc(activityEvents.createdAt)),
        db.select({ update: jobUpdates, designerName: users.name }).from(jobUpdates).leftJoin(users, eq(jobUpdates.designerUserId, users.id)).where(eq(jobUpdates.ticketId, input.id)).orderBy(desc(jobUpdates.createdAt)),
        db.select().from(requestFiles).where(eq(requestFiles.requestId, row.request.id)).orderBy(desc(requestFiles.createdAt)),
      ]);
      const filesWithUrl = await Promise.all(fileRows.map(async ({ file, uploaderName }) => {
        try { return { ...file, uploaderName, downloadUrl: await storageGetSignedUrl(file.storageKey) }; }
        catch { return { ...file, uploaderName, downloadUrl: `/manus-storage/${file.storageKey}` }; }
      }));
      const referencesWithUrl = await Promise.all(references.map(async file => {
        try { return { ...file, downloadUrl: await storageGetSignedUrl(file.storageKey) }; }
        catch { return { ...file, downloadUrl: `/manus-storage/${file.storageKey}` }; }
      }));
      return { ...row.ticket, request: row.request, designerSlot: row.slot, operationalIds: op ?? null, files: filesWithUrl, requestReferenceFiles: referencesWithUrl, approvals: approvalRows.map(({ approval, reviewerName }) => ({ ...approval, reviewerName })), qcReviews: qcRows.map(({ review, checkerName }) => ({ ...review, checkerName })), events: eventRows.map(({ event: activity, actorName }) => ({ ...activity, actorName })), jobUpdates: updateRows.map(({ update, designerName }) => ({ ...update, designerName })), slaHours: slaHours[row.ticket.processStatus] };
    }),
    updateJobStatus: protectedProcedure.input(z.object({ ticketId: z.number().int(), status: z.enum(JOB_STATUSES), note: z.string().max(2000).optional(), eta: z.string().date().optional() })).mutation(async ({ ctx, input }) => {
      roles("designer")(ctx.user.appRole);
      if (input.status === "Terhambat" && !input.note?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Catatan hambatan wajib diisi." });
      const db = await database();
      const [row] = await db.select({ ticket: tickets, slot: designerSlots }).from(tickets).innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id)).where(eq(tickets.id, input.ticketId)).limit(1);
      if (!row || row.slot.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Anda hanya dapat memperbarui Job Status tiket yang ditugaskan kepada Anda." });
      if (["closed", "ditolak_owner"].includes(row.ticket.processStatus)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tiket yang ditutup/ditolak tidak menerima pembaruan Job Status." });
      if (["Draft dikirim", "Final dikirim"].includes(input.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Status kirim draft/final dicatat otomatis saat file diunggah." });
      await db.transaction(async tx => {
        await tx.update(tickets).set({ jobStatus: input.status, jobNote: emptyToNull(input.note), eta: input.eta ? new Date(`${input.eta}T00:00:00Z`) : row.ticket.eta, startedAt: ["Sedang dikerjakan", "Revisi dikerjakan"].includes(input.status) && !row.ticket.startedAt ? new Date() : row.ticket.startedAt }).where(eq(tickets.id, input.ticketId));
        await tx.insert(jobUpdates).values({ ticketId: input.ticketId, designerSlotId: row.slot.id, designerUserId: ctx.user.id, status: input.status, note: emptyToNull(input.note), eta: input.eta ? new Date(`${input.eta}T00:00:00Z`) : null });
        await event({ ticketId: input.ticketId, actorUserId: ctx.user.id, eventType: "job_status_updated", detail: `${input.status}${input.note ? ` — ${input.note}` : ""}` }, tx);
      });
      return { success: true };
    }),
    spvReview: protectedProcedure.input(z.object({ ticketId: z.number().int(), decision: z.enum(["lolos", "revisi"]), note: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      roles("spv")(ctx.user.appRole);
      if (input.decision === "revisi" && !input.note?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Catatan revisi SPV wajib diisi." });
      const db = await database();
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId)).limit(1);
      if (!ticket || !["draft", "review_spv", "revisi", "revisi_owner"].includes(ticket.processStatus)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tiket belum berada pada tahap Review SPV." });
      const [latestDraft] = await db.select().from(ticketFiles).where(and(eq(ticketFiles.ticketId, input.ticketId), eq(ticketFiles.fileType, "draft"))).orderBy(desc(ticketFiles.createdAt)).limit(1);
      if (input.decision === "lolos" && !latestDraft) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Unggah draft desain sebelum mengajukan ke Owner." });
      const next = input.decision === "lolos" ? "menunggu_acc_owner" : "revisi";
      await db.transaction(async tx => {
        await tx.update(tickets).set({ processStatus: next, processUpdatedAt: new Date() }).where(eq(tickets.id, input.ticketId));
        await tx.insert(approvals).values({ ticketId: input.ticketId, reviewerUserId: ctx.user.id, stage: "spv_review", decision: input.decision, note: emptyToNull(input.note), fileId: latestDraft?.id ?? null });
        await event({ ticketId: input.ticketId, actorUserId: ctx.user.id, eventType: "spv_review", detail: `${input.decision}${input.note ? ` — ${input.note}` : ""}` }, tx);
      });
      return { success: true, next };
    }),
    ownerDecision: protectedProcedure.input(z.object({ ticketId: z.number().int(), decision: z.enum(["acc", "acc_catatan", "revisi", "tolak"]), note: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      roles("owner")(ctx.user.appRole);
      if (["acc_catatan", "revisi", "tolak"].includes(input.decision) && !input.note?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Catatan keputusan wajib diisi." });
      const db = await database();
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId)).limit(1);
      if (!ticket || ticket.processStatus !== "menunggu_acc_owner") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tiket belum menunggu ACC Owner." });
      const [latestDraft] = await db.select().from(ticketFiles).where(and(eq(ticketFiles.ticketId, input.ticketId), eq(ticketFiles.fileType, "draft"))).orderBy(desc(ticketFiles.createdAt)).limit(1);
      if (!latestDraft) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tidak ada versi draft yang dapat ditinjau Owner." });
      const next = input.decision === "revisi" ? "revisi_owner" : input.decision === "tolak" ? "ditolak_owner" : "menunggu_josd";
      await db.transaction(async tx => {
        await tx.update(tickets).set({ processStatus: next, processUpdatedAt: new Date() }).where(eq(tickets.id, input.ticketId));
        await tx.insert(approvals).values({ ticketId: input.ticketId, reviewerUserId: ctx.user.id, stage: "owner", decision: input.decision, note: emptyToNull(input.note), fileId: latestDraft.id });
        await event({ ticketId: input.ticketId, actorUserId: ctx.user.id, eventType: "owner_decision", detail: `${input.decision}${input.note ? ` — ${input.note}` : ""}` }, tx);
      });
      return { success: true, next };
    }),
    updateOperationalIds: protectedProcedure.input(z.object({ ticketId: z.number().int(), josdNo: z.string().max(120).optional(), jodNo: z.string().max(120).optional(), jodStatus: z.enum(["open", "in_progress", "closed"]).optional(), dgNo: z.string().max(120).optional() })).mutation(async ({ ctx, input }) => {
      roles("admin", "spv", "mpp", "designer")(ctx.user.appRole);
      if (ctx.user.appRole === "mpp" && (input.jodNo !== undefined || input.jodStatus !== undefined || input.dgNo !== undefined)) throw new TRPCError({ code: "FORBIDDEN", message: "MPP hanya memperbarui nomor JOS-D." });
      if (ctx.user.appRole === "admin" && (input.josdNo !== undefined || input.dgNo !== undefined)) throw new TRPCError({ code: "FORBIDDEN", message: "Admin operasional hanya mencatat JOD/Clipper; JOS-D diisi MPP dan DG oleh Designer." });
      if (ctx.user.appRole === "designer" && (input.josdNo !== undefined || input.jodNo !== undefined || input.jodStatus !== undefined)) throw new TRPCError({ code: "FORBIDDEN", message: "Designer hanya dapat mengisi nomor DG pada tiket yang ditugaskan." });
      const db = await database();
      const [ticketRow] = await db.select({ ticket: tickets, slot: designerSlots }).from(tickets).innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id)).where(eq(tickets.id, input.ticketId)).limit(1);
      if (!ticketRow) throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
      if (ticketRow.ticket.processStatus === "closed") throw new TRPCError({ code: "CONFLICT", message: "Arsip tiket Closed bersifat final dan tidak dapat diubah." });
      if (ctx.user.appRole === "designer" && ticketRow.slot.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Anda bukan Designer yang ditugaskan pada tiket ini." });
      if (ctx.user.appRole === "designer" && ticketRow.ticket.processStatus !== "finalisasi") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "DG dapat dicatat pada tahap finalisasi setelah JOS-D dan JOD tersedia." });
      const ticket = ticketRow.ticket;
      const [current] = await db.select().from(operationalIds).where(eq(operationalIds.ticketId, input.ticketId)).limit(1);
      const josdNo = input.josdNo?.trim() || current?.josdNo || null;
      if (input.jodNo?.trim() && !josdNo) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "JOS-D harus dicatat sebelum JOD." });
      if (input.josdNo?.trim() && !["menunggu_josd", "acc_owner"].includes(ticket.processStatus)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "JOS-D hanya dapat dicatat setelah ACC Owner." });
      if (input.jodStatus && !((input.jodNo?.trim() || current?.jodNo))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nomor JOD harus dicatat sebelum status Clipper." });
      if (input.jodStatus === "closed" && ticket.processStatus !== "uploaded") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "JOD baru dapat ditutup setelah upload produksi QC2 tercatat." });
      if (input.dgNo?.trim() && (!josdNo || !(input.jodNo?.trim() || current?.jodNo))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "JOS-D dan JOD harus tersedia sebelum Designer mencatat nomor DG." });
      const values = {
        ticketId: input.ticketId,
        josdNo,
        josdAt: input.josdNo?.trim() ? new Date() : current?.josdAt ?? null,
        jodNo: input.jodNo?.trim() || current?.jodNo || null,
        jodStatus: input.jodStatus || current?.jodStatus || null,
        dgNo: input.dgNo?.trim() || current?.dgNo || null,
      };
      const next = input.jodNo?.trim() ? "finalisasi" : input.josdNo?.trim() ? "menunggu_jod" : ticket.processStatus;
      await db.transaction(async tx => {
        if (current) await tx.update(operationalIds).set(values).where(eq(operationalIds.ticketId, input.ticketId));
        else await tx.insert(operationalIds).values(values);
        if (next !== ticket.processStatus) await tx.update(tickets).set({ processStatus: next, processUpdatedAt: new Date() }).where(eq(tickets.id, input.ticketId));
        await event({ ticketId: input.ticketId, actorUserId: ctx.user.id, eventType: "operational_ids_updated", detail: `Nomor proses diperbarui${input.josdNo ? `; JOS-D ${input.josdNo}` : ""}${input.jodNo ? `; JOD ${input.jodNo}` : ""}${input.dgNo ? `; DG ${input.dgNo}` : ""}.` }, tx);
      });
      return { success: true, next };
    }),
    submitQc: protectedProcedure.input(z.object({ ticketId: z.number().int(), stage: z.enum(QC_STAGES), result: z.enum(["lolos", "revisi"]), items: z.array(z.object({ id: z.number().int().min(1).max(18), passed: z.boolean(), note: z.string().max(1000).optional() })).length(18), summary: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      roles(input.stage)(ctx.user.appRole);
      const itemIds = new Set(input.items.map(item => item.id));
      if (itemIds.size !== QC_ITEMS.length || QC_ITEMS.some((_, index) => !itemIds.has(index + 1))) throw new TRPCError({ code: "BAD_REQUEST", message: "Checklist harus berisi 18 butir berbeda bernomor 1–18." });
      const failed = input.items.filter(item => !item.passed);
      if ((input.result === "revisi" || failed.length) && failed.some(item => !item.note?.trim())) throw new TRPCError({ code: "BAD_REQUEST", message: "Tambahkan catatan untuk setiap butir QC yang gagal." });
      if (input.result === "revisi" && failed.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Pilih setidaknya satu butir gagal untuk hasil Revisi." });
      if (input.result === "lolos" && failed.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Hasil Lolos tidak dapat memiliki butir gagal." });
      const db = await database();
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId)).limit(1);
      const expectedStatus = input.stage === "spv" ? "qc_spv" : input.stage;
      if (!ticket || ticket.processStatus !== expectedStatus) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Tiket belum berada pada tahap ${input.stage.toUpperCase()}.` });
      const next = input.result === "revisi" ? "revisi_qc" : input.stage === "spv" ? "qc1" : input.stage === "qc1" ? "qc2" : "siap_upload";
      await db.transaction(async tx => {
        await tx.insert(qcReviews).values({ ticketId: input.ticketId, checkerUserId: ctx.user.id, stage: input.stage, result: input.result, items: input.items, summary: emptyToNull(input.summary) });
        await tx.update(tickets).set({ processStatus: next, processUpdatedAt: new Date() }).where(eq(tickets.id, input.ticketId));
        await event({ ticketId: input.ticketId, actorUserId: ctx.user.id, eventType: "qc_completed", detail: `${input.stage.toUpperCase()}: ${input.result}${input.summary ? ` — ${input.summary}` : ""}` }, tx);
      });
      return { success: true, next };
    }),
    uploadFile: protectedProcedure.input(z.object({ ticketId: z.number().int(), fileName: z.string().trim().min(1).max(255), contentType: z.string().max(120), fileType: z.enum(["draft", "final", "referensi"]), dataBase64: z.string().min(1).max(12_000_000) })).mutation(async ({ ctx, input }) => {
      const db = await database();
      const [row] = await db.select({ ticket: tickets, slot: designerSlots, request: requests }).from(tickets).innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id)).innerJoin(requests, eq(tickets.requestId, requests.id)).where(eq(tickets.id, input.ticketId)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
      if (row.ticket.processStatus === "closed") throw new TRPCError({ code: "CONFLICT", message: "Arsip tiket Closed bersifat final dan tidak dapat diubah." });
      const isAssignedDesigner = ctx.user.appRole === "designer" && row.slot.userId === ctx.user.id;
      const isSpv = ["spv", "admin"].includes(ctx.user.appRole);
      if (!isAssignedDesigner && !isSpv) throw new TRPCError({ code: "FORBIDDEN", message: "Hanya Designer yang ditugaskan atau SPV yang dapat mengunggah file." });
      if (input.fileType === "final" && !isAssignedDesigner) throw new TRPCError({ code: "FORBIDDEN", message: "File final harus dikirim Designer yang ditugaskan." });
      if (input.fileType === "draft" && !["draft", "review_spv", "revisi", "revisi_owner"].includes(row.ticket.processStatus)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Draft hanya dapat dikirim pada tahap desain awal atau revisi sebelum finalisasi." });
      if (input.fileType === "final") {
        if (!["finalisasi", "revisi_qc"].includes(row.ticket.processStatus)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "File final hanya dapat dikirim pada tahap finalisasi atau setelah revisi QC." });
        const [op] = await db.select().from(operationalIds).where(eq(operationalIds.ticketId, input.ticketId)).limit(1);
        if (!op?.jodNo || !op.dgNo) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nomor JOD dan DG harus lengkap sebelum file final dikirim." });
      }
      const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
      const allowed = ["pdf", "png", "jpg", "jpeg", "ai", "psd", "eps", "tif", "tiff"];
      if (!allowed.includes(ext)) throw new TRPCError({ code: "BAD_REQUEST", message: "Format file yang didukung: PDF, PNG, JPG, AI, PSD, EPS, TIF, TIFF." });
      const bytes = Buffer.from(input.dataBase64, "base64");
      if (bytes.length > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Ukuran maksimum file adalah 8 MB." });
      const priorFiles = await db.select().from(ticketFiles).where(and(eq(ticketFiles.ticketId, input.ticketId), eq(ticketFiles.fileType, input.fileType)));
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const upload = await storagePut(`design-local/${row.ticket.ticketNo}/${input.fileType}/${Date.now()}_${safeName}`, bytes, input.contentType || "application/octet-stream");
      let nextProcess = row.ticket.processStatus;
      if (input.fileType === "draft") nextProcess = "review_spv";
      if (input.fileType === "final") {
        const [op] = await db.select().from(operationalIds).where(eq(operationalIds.ticketId, input.ticketId)).limit(1);
        nextProcess = op?.jodNo && op.dgNo ? "qc_spv" : "finalisasi";
      }
      await db.transaction(async tx => {
        await tx.insert(ticketFiles).values({ ticketId: input.ticketId, uploadedBy: ctx.user.id, fileName: input.fileName, storageKey: upload.key, fileType: input.fileType, contentType: input.contentType || "application/octet-stream", fileSize: bytes.length, versionNo: priorFiles.length + 1 });
        if (nextProcess !== row.ticket.processStatus) await tx.update(tickets).set({ processStatus: nextProcess, processUpdatedAt: new Date() }).where(eq(tickets.id, input.ticketId));
        if (isAssignedDesigner) {
          const status = input.fileType === "draft" ? "Draft dikirim" : input.fileType === "final" ? "Final dikirim" : row.ticket.jobStatus;
          if (input.fileType !== "referensi") {
            await tx.update(tickets).set({ jobStatus: status }).where(eq(tickets.id, input.ticketId));
            await tx.insert(jobUpdates).values({ ticketId: input.ticketId, designerSlotId: row.slot.id, designerUserId: ctx.user.id, status, note: `File ${input.fileName} diunggah.` });
          }
        }
        await event({ ticketId: input.ticketId, actorUserId: ctx.user.id, eventType: "file_uploaded", detail: `${input.fileType}: ${input.fileName} (v${priorFiles.length + 1}).` }, tx);
      });
      return { success: true, fileName: input.fileName, versionNo: priorFiles.length + 1, nextProcess };
    }),
    registerServerUpload: protectedProcedure.input(z.object({ ticketId: z.number().int(), serverPath: z.string().trim().min(3).max(2000) })).mutation(async ({ ctx, input }) => {
      roles("admin", "spv")(ctx.user.appRole);
      if (!/^(?:\\\\192\.168\.0\.24[\\/]|\/\/192\.168\.0\.24\/|192\.168\.0\.24[\\/]|smb:\/\/192\.168\.0\.24\/)/i.test(input.serverPath.trim())) throw new TRPCError({ code: "BAD_REQUEST", message: "Path produksi harus menunjuk ke server 192.168.0.24." });
      const db = await database();
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId)).limit(1);
      if (!ticket || ticket.processStatus !== "siap_upload") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Upload hanya dapat dicatat setelah QC Checker 2 Lolos." });
      const reviews = await db.select().from(qcReviews).where(eq(qcReviews.ticketId, input.ticketId)).orderBy(desc(qcReviews.createdAt));
      const latestByStage = new Map<string, (typeof reviews)[number]>();
      for (const review of reviews) if (!latestByStage.has(review.stage)) latestByStage.set(review.stage, review);
      if (!["spv", "qc1", "qc2"].every(stage => latestByStage.get(stage)?.result === "lolos")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "QC SPV, QC Checker 1, dan QC Checker 2 harus memiliki hasil terakhir Lolos." });
      const [finalFile] = await db.select().from(ticketFiles).where(and(eq(ticketFiles.ticketId, input.ticketId), eq(ticketFiles.fileType, "final"))).orderBy(desc(ticketFiles.createdAt)).limit(1);
      if (!finalFile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Unggah file final sebelum mencatat upload produksi." });
      const [op] = await db.select().from(operationalIds).where(eq(operationalIds.ticketId, input.ticketId)).limit(1);
      await db.transaction(async tx => {
        if (op) await tx.update(operationalIds).set({ serverPath: input.serverPath, uploadedAt: new Date() }).where(eq(operationalIds.ticketId, input.ticketId));
        else await tx.insert(operationalIds).values({ ticketId: input.ticketId, serverPath: input.serverPath, uploadedAt: new Date() });
        await tx.update(tickets).set({ processStatus: "uploaded", processUpdatedAt: new Date() }).where(eq(tickets.id, input.ticketId));
        await event({ ticketId: input.ticketId, actorUserId: ctx.user.id, eventType: "server_upload_recorded", detail: `${finalFile.fileName} v${finalFile.versionNo}; path produksi: ${input.serverPath}` }, tx);
      });
      return { success: true };
    }),
    close: protectedProcedure.input(z.object({ ticketId: z.number().int(), jodClosed: z.boolean() })).mutation(async ({ ctx, input }) => {
      roles("admin")(ctx.user.appRole);
      if (!input.jodClosed) throw new TRPCError({ code: "BAD_REQUEST", message: "Konfirmasikan JOD sudah ditutup di Clipper." });
      const db = await database();
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId)).limit(1);
      const [op] = await db.select().from(operationalIds).where(eq(operationalIds.ticketId, input.ticketId)).limit(1);
      if (!ticket || ticket.processStatus !== "uploaded" || !op?.josdNo || !op.jodNo || !op.dgNo || !op.serverPath || op.jodStatus !== "closed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Lengkapi JOS-D, JOD berstatus Closed, DG, file/path produksi, dan status Uploaded sebelum penutupan." });
      const [finalFile] = await db.select().from(ticketFiles).where(and(eq(ticketFiles.ticketId, input.ticketId), eq(ticketFiles.fileType, "final"))).orderBy(desc(ticketFiles.createdAt)).limit(1);
      const [ownerApproval] = await db.select().from(approvals).where(and(eq(approvals.ticketId, input.ticketId), eq(approvals.stage, "owner"), inArray(approvals.decision, ["acc", "acc_catatan"]))).orderBy(desc(approvals.createdAt)).limit(1);
      const reviews = await db.select().from(qcReviews).where(eq(qcReviews.ticketId, input.ticketId)).orderBy(desc(qcReviews.createdAt));
      const latestByStage = new Map<string, (typeof reviews)[number]>();
      for (const review of reviews) if (!latestByStage.has(review.stage)) latestByStage.set(review.stage, review);
      if (!finalFile || !ownerApproval || !["spv", "qc1", "qc2"].every(stage => latestByStage.get(stage)?.result === "lolos")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Arsip belum lengkap: pastikan file final, ACC Owner, serta QC SPV/QC1/QC2 terakhir Lolos tersedia." });
      await db.transaction(async tx => {
        await tx.update(operationalIds).set({ jodStatus: "closed", clipperClosedAt: new Date() }).where(eq(operationalIds.ticketId, input.ticketId));
        await tx.update(tickets).set({ processStatus: "closed", processUpdatedAt: new Date(), closedAt: new Date() }).where(eq(tickets.id, input.ticketId));
        await event({ ticketId: input.ticketId, actorUserId: ctx.user.id, eventType: "ticket_closed", detail: "JOD dan tiket ditutup; arsip siap." }, tx);
      });
      return { success: true };
    }),
  }),

  settings: router({
    users: protectedProcedure.query(async ({ ctx }) => {
      ensureAdmin(ctx.user.appRole);
      const db = await database();
      return db.select({ id: users.id, name: users.name, email: users.email, appRole: users.appRole, createdAt: users.createdAt }).from(users).orderBy(users.name);
    }),
    assignRole: protectedProcedure.input(z.object({ userId: z.number().int(), appRole: z.enum(appRoles) })).mutation(async ({ ctx, input }) => {
      ensureAdmin(ctx.user.appRole);
      const db = await database();
      await db.transaction(async tx => {
        await tx.update(users).set({ appRole: input.appRole }).where(eq(users.id, input.userId));
        await event({ actorUserId: ctx.user.id, eventType: "role_assigned", detail: `Role ${APP_ROLE_LABELS[input.appRole]} diberikan kepada user #${input.userId}.` }, tx);
      });
      return { success: true };
    }),
    designerSlots: protectedProcedure.query(async ({ ctx }) => {
      roles("admin", "superadmin", "spv", "manager", "owner")(ctx.user.appRole);
      return ensureDesignerSlots();
    }),
    updateDesignerSlot: protectedProcedure.input(z.object({ slotNumber: z.number().int().min(1).max(8), displayName: z.string().max(120).optional(), userId: z.number().int().nullable().optional(), isActive: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      ensureAdmin(ctx.user.appRole);
      await ensureDesignerSlots();
      const db = await database();
      const [slot] = await db.select().from(designerSlots).where(eq(designerSlots.slotNumber, input.slotNumber)).limit(1);
      if (!slot) throw new TRPCError({ code: "NOT_FOUND", message: "Slot Designer tidak ditemukan." });
      let selectedUser: typeof users.$inferSelect | undefined;
      if (input.userId !== undefined && input.userId !== null) {
        [selectedUser] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!selectedUser) throw new TRPCError({ code: "NOT_FOUND", message: "Akun tidak ditemukan." });
        if (!["unassigned", "designer"].includes(selectedUser.appRole)) throw new TRPCError({ code: "CONFLICT", message: "Pilih akun ber-role Designer atau Belum diberi akses sebelum menghubungkannya ke slot." });
        const [assignedElsewhere] = await db.select().from(designerSlots).where(eq(designerSlots.userId, selectedUser.id)).limit(1);
        if (assignedElsewhere && assignedElsewhere.id !== slot.id) throw new TRPCError({ code: "CONFLICT", message: "Satu akun hanya dapat dipetakan ke satu slot Designer." });
      }
      await db.transaction(async tx => {
        if (selectedUser?.appRole === "unassigned") await tx.update(users).set({ appRole: "designer" }).where(eq(users.id, selectedUser.id));
        if (input.userId !== undefined && slot.userId && input.userId !== slot.userId) await tx.update(users).set({ appRole: "unassigned" }).where(and(eq(users.id, slot.userId), eq(users.appRole, "designer")));
        await tx.update(designerSlots).set({
          displayName: input.displayName !== undefined ? emptyToNull(input.displayName) : slot.displayName,
          userId: input.userId !== undefined ? input.userId : slot.userId,
          isActive: input.isActive ?? slot.isActive,
        }).where(eq(designerSlots.id, slot.id));
        await event({ actorUserId: ctx.user.id, eventType: "designer_slot_updated", detail: `Konfigurasi ${slot.label} diperbarui.` }, tx);
      });
      return { success: true };
    }),
    slaRules: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.appRole === "unassigned") throw new TRPCError({ code: "FORBIDDEN", message: "Role aplikasi belum ditetapkan." });
      const db = await database();
      const hours = await readSlaHours(db);
      return SLA_RULE_KEYS.map(processStatus => ({ processStatus, label: SLA_RULE_LABELS[processStatus], maxHours: hours[processStatus] }));
    }),
    updateSlaRules: protectedProcedure.input(z.array(z.object({ processStatus: z.enum(SLA_RULE_KEYS), maxHours: z.number().int().min(1).max(720) })).length(SLA_RULE_KEYS.length)).mutation(async ({ ctx, input }) => {
      ensureAdmin(ctx.user.appRole);
      if (new Set(input.map(rule => rule.processStatus)).size !== SLA_RULE_KEYS.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Setiap tahap SLA harus diisi tepat satu kali." });
      const db = await database();
      await db.transaction(async tx => {
        for (const rule of input) {
          const [existing] = await tx.select().from(workflowSlaRules).where(eq(workflowSlaRules.processStatus, rule.processStatus)).limit(1);
          if (existing) await tx.update(workflowSlaRules).set({ maxHours: rule.maxHours, updatedBy: ctx.user.id }).where(eq(workflowSlaRules.processStatus, rule.processStatus));
          else await tx.insert(workflowSlaRules).values({ processStatus: rule.processStatus, maxHours: rule.maxHours, updatedBy: ctx.user.id });
        }
        await event({ actorUserId: ctx.user.id, eventType: "sla_rules_updated", detail: `${input.length} target SLA diperbarui.` }, tx);
      });
      return { success: true };
    }),
    processLabels: protectedProcedure.query(() => PROCESS_LABELS),
  }),
});
