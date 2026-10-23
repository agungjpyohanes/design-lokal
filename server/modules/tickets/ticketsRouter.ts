import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  accSessions,
  accSessionItems,
  activityEvents,
  approvals,
  designerSlots,
  jobUpdates,
  operationalIds,
  qcReviews,
  requestFiles,
  requests,
  ticketFiles,
  tickets,
  users,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { demoStore } from "../../demoStore";
import { storageGetSignedUrl, storagePut } from "../../storage";
import { protectedProcedure, router } from "../../_core/trpc";
import { JOB_STATUSES, QC_ITEMS, QC_STAGES } from "@shared/workflow";
import {
  canReadTicket,
  emptyToNull,
  event,
  readSlaHours,
  roles,
} from "../common/helpers";
import {
  assertCanAccessTicket,
  assertCanRegisterServerUpload,
  assertCanUpdateJobStatus,
  assertCanUploadTicketFile,
  detectAndValidateFile,
  ticketRows,
  validateBase64Payload,
  visibleRows,
} from "./helpers";

export const ticketsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    canReadTicket(ctx.user.appRole);
    const db = await getDb();
    const slaHours = await readSlaHours(db);
    const rows = visibleRows(await ticketRows(), ctx.user).filter(({ ticket }) =>
      ctx.user.appRole === "qc1"
        ? ticket.processStatus === "qc1"
        : ctx.user.appRole === "qc2"
          ? ticket.processStatus === "qc2"
          : true
    );
    return rows.map(({ ticket, request, slot }) => ({
      ...ticket,
      request,
      designerSlot: slot,
      designerLabel: slot.displayName || slot.label,
      slaHours: slaHours[ticket.processStatus] || 12,
    }));
  }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    roles("designer", "spv", "manager", "admin", "superadmin")(ctx.user.appRole);
    const db = await getDb();
    const slaHours = await readSlaHours(db);
    const rows = visibleRows(await ticketRows(), ctx.user).filter(
      ({ ticket }) => !["closed", "ditolak_owner"].includes(ticket.processStatus)
    );

    let allTicketFiles: any[] = [];
    if (db) {
      try {
        allTicketFiles = await db
          .select({
            id: ticketFiles.id,
            ticketId: ticketFiles.ticketId,
            fileName: ticketFiles.fileName,
            fileType: ticketFiles.fileType,
            fileSize: ticketFiles.fileSize,
            versionNo: ticketFiles.versionNo,
            note: ticketFiles.note,
            createdAt: ticketFiles.createdAt,
            storageKey: ticketFiles.storageKey,
          })
          .from(ticketFiles)
          .orderBy(desc(ticketFiles.versionNo));
      } catch (e) {
        console.warn("[mine.files] DB failed, fallback to demoStore:", e);
      }
    }
    if (!allTicketFiles || allTicketFiles.length === 0) {
      allTicketFiles = demoStore.ticketFiles;
    }

    return rows.map(({ ticket, request, slot }) => {
      const ticketFileList = allTicketFiles
        .filter((f) => f.ticketId === ticket.id)
        .map((f) => ({
          ...f,
          downloadUrl: f.storageKey ? `/manus-storage/${f.storageKey}` : "#",
        }));

      return {
        ...ticket,
        request,
        designerSlot: slot,
        designerLabel: slot.displayName || slot.label,
        slaHours: slaHours[ticket.processStatus] || 12,
        files: ticketFileList,
      };
    });
  }),

  createFromRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.number().int(),
        designerSlotId: z.number().int(),
        brief: z.string().trim().min(5, "Brief resmi dari SPV wajib diisi minimal 5 karakter").max(5000),
        deadline: z.string().date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("spv", "manager", "admin", "superadmin")(ctx.user.appRole);
      const db = await getDb();
      if (db) {
        try {
          const [request] = await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
          if (!request) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Permintaan tidak ditemukan." });
          }

          // Tiket hanya dapat diterbitkan jika status Lanjut (atau diterima)
          const isLanjut =
            request.status === "lanjut" ||
            request.status === "diterima" ||
            request.gateDecision === "lanjut" ||
            request.reviewDecision === "lanjut" ||
            request.reviewDecision === "diterima";

          if (!isLanjut) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Tiket internal hanya dapat diterbitkan jika status Gerbang Keputusan adalah Lanjut.",
            });
          }

          const [slot] = await db.select().from(designerSlots).where(eq(designerSlots.id, input.designerSlotId)).limit(1);
          if (!slot || slot.slotNumber < 1 || slot.slotNumber > 8) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Penanggung Jawab Designer wajib dipilih dari Slot 1 sampai Slot 8.",
            });
          }

          const count = (await db.select({ id: tickets.id }).from(tickets)).length;
          const ticketNo = `DES-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

          let created: typeof tickets.$inferSelect | undefined;
          await db.transaction(async (tx) => {
            await tx.insert(tickets).values({
              ticketNo,
              requestId: request.id,
              spvUserId: ctx.user.id,
              designerSlotId: slot.id,
              brief: input.brief,
              processStatus: "draft",
              jobStatus: "Belum mulai",
              deadline: input.deadline ? new Date(`${input.deadline}T00:00:00Z`) : request.deadline,
            });

            // Tandai request telah diterbitkan tiket
            await tx.update(requests).set({ status: "tiket_terbit" }).where(eq(requests.id, request.id));

            [created] = await tx.select().from(tickets).where(eq(tickets.ticketNo, ticketNo)).limit(1);
            if (created) {
              await event(
                {
                  ticketId: created.id,
                  actorUserId: ctx.user.id,
                  eventType: "ticket_created",
                  detail: `${ticketNo} diterbitkan dari permintaan ${request.requestNo} dan ditugaskan ke ${slot.displayName || slot.label}.`,
                },
                tx
              );
            }
          });
          if (created) return created;
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          console.warn("[createFromRequest] DB failed, fallback to demoStore:", e);
        }
      }

      // Demo store creation
      const demoReq = demoStore.requests.find((r) => r.id === input.requestId);
      if (!demoReq) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Permintaan tidak ditemukan." });
      }

      const isDemoLanjut =
        demoReq.status === "lanjut" ||
        demoReq.status === "diterima" ||
        demoReq.gateDecision === "lanjut" ||
        demoReq.reviewDecision === "lanjut" ||
        demoReq.reviewDecision === "diterima";

      if (!isDemoLanjut) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tiket internal hanya dapat diterbitkan jika status Gerbang Keputusan adalah Lanjut.",
        });
      }

      const demoSlot = demoStore.designerSlots.find((s) => s.id === input.designerSlotId);
      if (!demoSlot || demoSlot.slotNumber < 1 || demoSlot.slotNumber > 8) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Penanggung Jawab Designer wajib dipilih dari Slot 1 sampai Slot 8.",
        });
      }

      const ticketNo = `DES-${new Date().getFullYear()}-${String(demoStore.tickets.length + 1).padStart(3, "0")}`;
      const newTicket = {
        id: demoStore.tickets.length + 1,
        ticketNo,
        requestId: input.requestId,
        spvUserId: ctx.user.id,
        designerSlotId: input.designerSlotId,
        brief: input.brief,
        processStatus: "draft",
        processUpdatedAt: new Date(),
        jobStatus: "Belum mulai",
        jobNote: null,
        eta: null,
        deadline: input.deadline ? new Date(`${input.deadline}T00:00:00Z`) : null,
        startedAt: null,
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      demoStore.tickets.unshift(newTicket);
      demoReq.status = "tiket_terbit";

      await event({
        ticketId: newTicket.id,
        actorUserId: ctx.user.id,
        eventType: "ticket_created",
        detail: `${ticketNo} diterbitkan dan ditugaskan ke ${demoSlot.displayName || demoSlot.label}.`,
      });
      return newTicket;
    }),

  reassignDesigner: protectedProcedure
    .input(z.object({ ticketId: z.number().int(), designerSlotId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      roles("spv", "superadmin")(ctx.user.appRole);
      const db = await getDb();
      if (db) {
        try {
          const [current] = await db
            .select({ ticket: tickets, slot: designerSlots })
            .from(tickets)
            .innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id))
            .where(eq(tickets.id, input.ticketId))
            .limit(1);
          const [nextSlot] = await db.select().from(designerSlots).where(eq(designerSlots.id, input.designerSlotId)).limit(1);
          if (current && nextSlot) {
            await db.transaction(async (tx) => {
              await tx.update(tickets).set({ designerSlotId: nextSlot.id }).where(eq(tickets.id, input.ticketId));
              await event(
                {
                  ticketId: input.ticketId,
                  actorUserId: ctx.user.id,
                  eventType: "designer_reassigned",
                  detail: `Penugasan dialihkan dari ${current.slot.displayName || current.slot.label} ke ${nextSlot.displayName || nextSlot.label}.`,
                },
                tx
              );
            });
            return { success: true, unchanged: false };
          }
        } catch (e) {
          console.warn("[reassignDesigner] DB failed, fallback to demoStore:", e);
        }
      }

      const t = demoStore.tickets.find((item) => item.id === input.ticketId);
      if (t) t.designerSlotId = input.designerSlotId;
      return { success: true, unchanged: false };
    }),

  detail: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      canReadTicket(ctx.user.appRole);
      const db = await getDb();
      const slaHours = await readSlaHours(db);

      if (db) {
        try {
          const [row] = await db
            .select({ ticket: tickets, request: requests, slot: designerSlots })
            .from(tickets)
            .innerJoin(requests, eq(tickets.requestId, requests.id))
            .innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id))
            .where(eq(tickets.id, input.id))
            .limit(1);

          if (row) {
            assertCanAccessTicket(ctx.user, { request: row.request, slot: row.slot });
            const [op] = await db.select().from(operationalIds).where(eq(operationalIds.ticketId, input.id)).limit(1);
            const [fileRows, approvalRows, qcRows, eventRows, updateRows, references, accSessionRows] = await Promise.all([
              db
                .select({ file: ticketFiles, uploaderName: users.name })
                .from(ticketFiles)
                .leftJoin(users, eq(ticketFiles.uploadedBy, users.id))
                .where(eq(ticketFiles.ticketId, input.id))
                .orderBy(desc(ticketFiles.createdAt)),
              db
                .select({ approval: approvals, reviewerName: users.name })
                .from(approvals)
                .leftJoin(users, eq(approvals.reviewerUserId, users.id))
                .where(eq(approvals.ticketId, input.id))
                .orderBy(desc(approvals.createdAt)),
              db
                .select({ review: qcReviews, checkerName: users.name })
                .from(qcReviews)
                .leftJoin(users, eq(qcReviews.checkerUserId, users.id))
                .where(eq(qcReviews.ticketId, input.id))
                .orderBy(desc(qcReviews.createdAt)),
              db
                .select({ event: activityEvents, actorName: users.name })
                .from(activityEvents)
                .leftJoin(users, eq(activityEvents.actorUserId, users.id))
                .where(eq(activityEvents.ticketId, input.id))
                .orderBy(desc(activityEvents.createdAt)),
              db
                .select({ update: jobUpdates, designerName: users.name })
                .from(jobUpdates)
                .leftJoin(users, eq(jobUpdates.designerUserId, users.id))
                .where(eq(jobUpdates.ticketId, input.id))
                .orderBy(desc(jobUpdates.createdAt)),
              db
                .select()
                .from(requestFiles)
                .where(eq(requestFiles.requestId, row.request.id))
                .orderBy(desc(requestFiles.createdAt)),
              db
                .select({
                  item: accSessionItems,
                  session: accSessions,
                })
                .from(accSessionItems)
                .innerJoin(accSessions, eq(accSessionItems.sessionId, accSessions.id))
                .where(eq(accSessionItems.ticketId, input.id))
                .orderBy(desc(accSessions.presentationDate))
                .limit(1),
            ]);

            const accSessionApproval = accSessionRows[0]
              ? {
                  sessionId: accSessionRows[0].session.id,
                  sessionNo: accSessionRows[0].session.sessionNo,
                  presentationDate: accSessionRows[0].session.presentationDate,
                  decision: accSessionRows[0].item.decision,
                  notes: accSessionRows[0].item.notes,
                  fileVersion: accSessionRows[0].item.fileVersion,
                }
              : null;

            const filesWithUrl = await Promise.all(
              fileRows.map(async ({ file, uploaderName }) => {
                try {
                  return {
                    ...file,
                    uploaderName,
                    downloadUrl: await storageGetSignedUrl(file.storageKey),
                  };
                } catch {
                  return {
                    ...file,
                    uploaderName,
                    downloadUrl: `/manus-storage/${file.storageKey}`,
                  };
                }
              })
            );

            const referencesWithUrl = await Promise.all(
              references.map(async (file) => {
                try {
                  return { ...file, downloadUrl: await storageGetSignedUrl(file.storageKey) };
                } catch {
                  return { ...file, downloadUrl: `/manus-storage/${file.storageKey}` };
                }
              })
            );

            return {
              ...row.ticket,
              request: row.request,
              designerSlot: row.slot,
              operationalIds: op ?? null,
              files: filesWithUrl,
              requestReferenceFiles: referencesWithUrl,
              approvals: approvalRows.map(({ approval, reviewerName }) => ({
                ...approval,
                reviewerName,
              })),
              qcReviews: qcRows.map(({ review, checkerName }) => ({ ...review, checkerName })),
              events: eventRows.map(({ event: activity, actorName }) => ({ ...activity, actorName })),
              jobUpdates: updateRows.map(({ update, designerName }) => ({ ...update, designerName })),
              slaHours: slaHours[row.ticket.processStatus] || 12,
              accSessionApproval,
            };
          }
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          console.warn("[tickets.detail] DB query failed, using demoStore fallback:", e);
        }
      }

      // Demo store fallback detail
      const demoDetail = demoStore.getTicketDetail(input.id);
      if (demoDetail) {
        assertCanAccessTicket(ctx.user, { request: demoDetail.request, slot: demoDetail.designerSlot });
        return {
          ...demoDetail,
          slaHours: slaHours[demoDetail.processStatus] || 12,
        };
      }

      throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
    }),

  updateJobStatus: protectedProcedure
    .input(
      z.object({
        ticketId: z.number().int(),
        status: z.enum(JOB_STATUSES),
        note: z.string().max(2000).optional(),
        eta: z.string().date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("designer", "spv", "admin", "superadmin")(ctx.user.appRole);
      const db = await getDb();
      if (db) {
        try {
          const [row] = await db
            .select({ ticket: tickets, slot: designerSlots })
            .from(tickets)
            .innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id))
            .where(eq(tickets.id, input.ticketId))
            .limit(1);

          if (row) {
            assertCanUpdateJobStatus(ctx.user, row.slot);
            await db.transaction(async (tx) => {
              await tx
                .update(tickets)
                .set({
                  jobStatus: input.status,
                  jobNote: emptyToNull(input.note),
                  eta: input.eta ? new Date(`${input.eta}T00:00:00Z`) : row.ticket.eta,
                })
                .where(eq(tickets.id, input.ticketId));

              await tx.insert(jobUpdates).values({
                ticketId: input.ticketId,
                designerSlotId: row.slot.id,
                designerUserId: ctx.user.id,
                status: input.status,
                note: emptyToNull(input.note),
                eta: input.eta ? new Date(`${input.eta}T00:00:00Z`) : null,
              });

              await event(
                {
                  ticketId: input.ticketId,
                  actorUserId: ctx.user.id,
                  eventType: "job_status_updated",
                  detail: `${input.status}${input.note ? ` — ${input.note}` : ""}`,
                },
                tx
              );
            });
            return { success: true };
          }
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          console.warn("[updateJobStatus] DB failed, fallback to demoStore:", e);
        }
      }

      // Demo store update
      const t = demoStore.tickets.find((item) => item.id === input.ticketId);
      if (t) {
        const slot = demoStore.designerSlots.find((s) => s.id === t.designerSlotId);
        assertCanUpdateJobStatus(ctx.user, slot);
        t.jobStatus = input.status;
        t.jobNote = input.note || null;
        if (input.eta) t.eta = new Date(`${input.eta}T00:00:00Z`);
        demoStore.jobUpdates.unshift({
          id: demoStore.jobUpdates.length + 1,
          ticketId: input.ticketId,
          designerSlotId: t.designerSlotId,
          designerUserId: ctx.user.id,
          status: input.status,
          note: input.note || null,
          eta: input.eta ? new Date(`${input.eta}T00:00:00Z`) : null,
          createdAt: new Date(),
        });
        return { success: true };
      }
      throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
    }),

  spvReview: protectedProcedure
    .input(
      z.object({
        ticketId: z.number().int(),
        decision: z.enum(["lolos", "revisi"]),
        note: z.string().max(2000).optional(),
        checklist: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("spv", "manager", "admin", "superadmin")(ctx.user.appRole);

      if (input.decision === "revisi" && !input.note?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Catatan instruksi revisi wajib diisi untuk desainer.",
        });
      }

      const next = input.decision === "lolos" ? "menunggu_acc_owner" : "revisi";
      const nextJob = input.decision === "lolos" ? "Menunggu feedback/keputusan" : "Revisi dikerjakan";
      const checklistSummary = input.checklist?.length
        ? ` (Checklist: ${input.checklist.join(", ")})`
        : "";
      const noteWithChecklist = `${input.note || ""}${checklistSummary}`.trim();

      const db = await getDb();
      if (db) {
        try {
          await db.transaction(async (tx) => {
            await tx
              .update(tickets)
              .set({
                processStatus: next,
                jobStatus: nextJob,
                jobNote: emptyToNull(input.note),
                processUpdatedAt: new Date(),
              })
              .where(eq(tickets.id, input.ticketId));

            await tx.insert(approvals).values({
              ticketId: input.ticketId,
              reviewerUserId: ctx.user.id,
              stage: "spv_review",
              decision: input.decision,
              note: emptyToNull(noteWithChecklist),
              fileId: null,
            });

            await event(
              {
                ticketId: input.ticketId,
                actorUserId: ctx.user.id,
                eventType: "spv_review",
                detail: `SPV Review: ${input.decision === "lolos" ? "Lolos Diajukan ke Owner" : "Minta Revisi Designer"}${input.note ? ` — ${input.note}` : ""}`,
              },
              tx
            );
          });
          return { success: true, next };
        } catch (e) {
          console.warn("[spvReview] DB failed, fallback to demoStore:", e);
        }
      }

      // Demo store update
      const t = demoStore.tickets.find((item) => item.id === input.ticketId);
      if (t) {
        t.processStatus = next;
        t.jobStatus = nextJob;
        t.jobNote = input.note || null;
        t.processUpdatedAt = new Date();
      }

      demoStore.approvals.unshift({
        id: demoStore.approvals.length + 1,
        ticketId: input.ticketId,
        reviewerUserId: ctx.user.id,
        stage: "spv_review",
        decision: input.decision,
        note: noteWithChecklist || null,
        fileId: null,
        createdAt: new Date(),
      });

      await event({
        ticketId: input.ticketId,
        actorUserId: ctx.user.id,
        eventType: "spv_review",
        detail: `SPV Review: ${input.decision === "lolos" ? "Lolos Diajukan ke Owner" : "Minta Revisi Designer"}${input.note ? ` — ${input.note}` : ""}`,
      });

      return { success: true, next };
    }),

  ownerDecision: protectedProcedure
    .input(
      z.object({
        ticketId: z.number().int(),
        decision: z.enum(["acc", "acc_catatan", "revisi", "tolak"]),
        note: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Izinkan Owner, SPV, Admin, Manager, Superadmin merekam keputusan (Bypass mode simulator)
      roles("owner", "spv", "admin", "manager", "superadmin")(ctx.user.appRole);

      if ((input.decision === "revisi" || input.decision === "tolak") && !input.note?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Wajib mengisi catatan alasan jika keputusan Owner adalah Minta Revisi atau Tolak.",
        });
      }

      const next =
        input.decision === "revisi"
          ? "revisi_owner"
          : input.decision === "tolak"
            ? "ditolak_owner"
            : "menunggu_josd";

      const nextJob =
        input.decision === "revisi"
          ? "Revisi dikerjakan"
          : input.decision === "tolak"
            ? "Selesai"
            : "Menunggu feedback/keputusan";

      const db = await getDb();
      if (db) {
        try {
          await db.transaction(async (tx) => {
            await tx
              .update(tickets)
              .set({
                processStatus: next,
                jobStatus: nextJob,
                jobNote: emptyToNull(input.note),
                processUpdatedAt: new Date(),
              })
              .where(eq(tickets.id, input.ticketId));

            await tx.insert(approvals).values({
              ticketId: input.ticketId,
              reviewerUserId: ctx.user.id,
              stage: "owner",
              decision: input.decision,
              note: emptyToNull(input.note),
              fileId: null,
            });

            await event(
              {
                ticketId: input.ticketId,
                actorUserId: ctx.user.id,
                eventType: "owner_decision",
                detail: `Keputusan Owner: ${input.decision.toUpperCase()}${input.note ? ` — ${input.note}` : ""}`,
              },
              tx
            );
          });
          return { success: true, next };
        } catch (e) {
          console.warn("[ownerDecision] DB failed, fallback to demoStore:", e);
        }
      }

      // Demo store update
      const t = demoStore.tickets.find((item) => item.id === input.ticketId);
      if (t) {
        t.processStatus = next;
        t.jobStatus = nextJob;
        t.jobNote = input.note || null;
        t.processUpdatedAt = new Date();
      }

      demoStore.approvals.unshift({
        id: demoStore.approvals.length + 1,
        ticketId: input.ticketId,
        reviewerUserId: ctx.user.id,
        stage: "owner",
        decision: input.decision,
        note: input.note || null,
        fileId: null,
        createdAt: new Date(),
      });

      await event({
        ticketId: input.ticketId,
        actorUserId: ctx.user.id,
        eventType: "owner_decision",
        detail: `Keputusan Owner: ${input.decision.toUpperCase()}${input.note ? ` — ${input.note}` : ""}`,
      });

      return { success: true, next };
    }),

  requestJosd: protectedProcedure
    .input(
      z.object({
        ticketId: z.number().int(),
        isEmergencyOutOfSession: z.boolean().optional(),
        emergencyReason: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("admin", "spv", "mpp", "manager", "superadmin")(ctx.user.appRole);
      const db = await getDb();
      const currentYear = new Date().getFullYear();

      // Validasi Gerbang JOS-D Berbasis Sesi ACC
      let accItem: any = null;
      let sessionRow: any = null;

      if (db) {
        try {
          const [it] = await db
            .select()
            .from(accSessionItems)
            .where(
              and(
                eq(accSessionItems.ticketId, input.ticketId),
                inArray(accSessionItems.decision, ["acc", "acc_catatan"])
              )
            )
            .limit(1);
          if (it) {
            accItem = it;
            const [s] = await db.select().from(accSessions).where(eq(accSessions.id, it.sessionId)).limit(1);
            sessionRow = s || null;
          }
        } catch (e) {
          console.warn("[requestJosd] DB check accItem error:", e);
        }
      }

      if (!accItem) {
        accItem = demoStore.accSessionItems.find(
          (it) => it.ticketId === input.ticketId && ["acc", "acc_catatan"].includes(it.decision)
        );
        if (accItem) {
          sessionRow = demoStore.accSessions.find((s) => s.id === accItem.sessionId);
        }
      }

      const isAccApprovedInSession = Boolean(accItem);

      if (!isAccApprovedInSession) {
        if (!input.isEmergencyOutOfSession || !input.emergencyReason?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Gerbang JOS-D TERKUNCI: Tiket ini belum disahkan dalam Sesi ACC Bulanan (ACC / ACC Catatan). Untuk situasi mendesak, aktifkan mode 'ACC di Luar Sesi' dan cantumkan alasan darurat wajib.",
          });
        }
      }

      let count = 1;
      if (db) {
        try {
          const rows = await db.select({ id: operationalIds.id }).from(operationalIds);
          count = rows.length + 1;
        } catch {
          count = demoStore.operationalIds.length + 1;
        }
      } else {
        count = demoStore.operationalIds.length + 1;
      }
      const generatedJosd = `JOSD-${currentYear}-${String(count).padStart(3, "0")}`;

      const eventDetail = isAccApprovedInSession
        ? `Permohonan nomor JOS-D disetujui berdasarkan Sesi ACC (${sessionRow?.sessionNo || "Bulanan"}): ${generatedJosd}. Menunggu nomor JOD Clipper.`
        : `Pengecualian Darurat (ACC di Luar Sesi): Nomor ${generatedJosd} diterbitkan. Alasan: ${input.emergencyReason}`;

      if (db) {
        try {
          const [current] = await db
            .select()
            .from(operationalIds)
            .where(eq(operationalIds.ticketId, input.ticketId))
            .limit(1);

          await db.transaction(async (tx) => {
            if (current) {
              await tx
                .update(operationalIds)
                .set({ josdNo: generatedJosd, josdAt: new Date() })
                .where(eq(operationalIds.ticketId, input.ticketId));
            } else {
              await tx.insert(operationalIds).values({
                ticketId: input.ticketId,
                josdNo: generatedJosd,
                josdAt: new Date(),
                jodNo: null,
                jodStatus: "open",
                dgNo: null,
              });
            }

            await tx
              .update(tickets)
              .set({ processStatus: "menunggu_jod", processUpdatedAt: new Date() })
              .where(eq(tickets.id, input.ticketId));

            if (!isAccApprovedInSession && input.emergencyReason) {
              await tx.insert(approvals).values({
                ticketId: input.ticketId,
                reviewerUserId: ctx.user.id,
                stage: "owner",
                decision: "acc_darurat",
                note: `ACC Darurat di Luar Sesi: ${input.emergencyReason}`,
              });
            }

            await event(
              {
                ticketId: input.ticketId,
                actorUserId: ctx.user.id,
                eventType: isAccApprovedInSession ? "josd_generated" : "emergency_acc_josd",
                detail: eventDetail,
              },
              tx
            );
          });
          return { success: true, josdNo: generatedJosd, next: "menunggu_jod" };
        } catch (e) {
          console.warn("[requestJosd] DB failed, fallback to demoStore:", e);
        }
      }

      // Demo store update
      let op = demoStore.operationalIds.find((o) => o.ticketId === input.ticketId);
      if (!op) {
        op = {
          id: demoStore.operationalIds.length + 1,
          ticketId: input.ticketId,
          josdNo: generatedJosd,
          josdAt: new Date(),
          jodNo: null,
          jodStatus: "open",
          dgNo: null,
          serverPath: null,
          uploadedAt: null,
          clipperClosedAt: null,
        };
        demoStore.operationalIds.push(op);
      } else {
        op.josdNo = generatedJosd;
        op.josdAt = new Date();
      }

      const t = demoStore.tickets.find((item) => item.id === input.ticketId);
      if (t) {
        t.processStatus = "menunggu_jod";
        t.processUpdatedAt = new Date();
      }

      if (!isAccApprovedInSession && input.emergencyReason) {
        demoStore.approvals.unshift({
          id: demoStore.approvals.length + 1,
          ticketId: input.ticketId,
          reviewerUserId: ctx.user.id,
          stage: "owner",
          decision: "acc_darurat",
          note: `ACC Darurat di Luar Sesi: ${input.emergencyReason}`,
          fileId: null,
          createdAt: new Date(),
        });
      }

      await event({
        ticketId: input.ticketId,
        actorUserId: ctx.user.id,
        eventType: isAccApprovedInSession ? "josd_generated" : "emergency_acc_josd",
        detail: eventDetail,
      });

      return { success: true, josdNo: generatedJosd, next: "menunggu_jod" };
    }),

  updateOperationalIds: protectedProcedure
    .input(
      z.object({
        ticketId: z.number().int(),
        josdNo: z.string().max(120).optional(),
        jodNo: z.string().max(120).optional(),
        jodStatus: z.enum(["open", "in_progress", "closed"]).optional(),
        dgNo: z.string().max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("admin", "spv", "mpp", "manager", "designer", "superadmin")(ctx.user.appRole);
      const db = await getDb();
      const next = input.jodNo?.trim()
        ? "finalisasi"
        : input.josdNo?.trim()
          ? "menunggu_jod"
          : undefined;

      if (db) {
        try {
          const [current] = await db
            .select()
            .from(operationalIds)
            .where(eq(operationalIds.ticketId, input.ticketId))
            .limit(1);

          const values = {
            ticketId: input.ticketId,
            josdNo: input.josdNo?.trim() || current?.josdNo || null,
            josdAt: input.josdNo?.trim() ? (current?.josdAt || new Date()) : current?.josdAt ?? null,
            jodNo: input.jodNo?.trim() || current?.jodNo || null,
            jodStatus: input.jodStatus || current?.jodStatus || null,
            dgNo: input.dgNo?.trim() || current?.dgNo || null,
          };

          await db.transaction(async (tx) => {
            if (current) {
              await tx.update(operationalIds).set(values).where(eq(operationalIds.ticketId, input.ticketId));
            } else {
              await tx.insert(operationalIds).values(values);
            }
            if (next) {
              await tx
                .update(tickets)
                .set({ processStatus: next, processUpdatedAt: new Date() })
                .where(eq(tickets.id, input.ticketId));
            }

            await event(
              {
                ticketId: input.ticketId,
                actorUserId: ctx.user.id,
                eventType: "operational_ids_updated",
                detail: `Pembaruan identitas proses: JOS-D: ${values.josdNo || "—"} · JOD: ${values.jodNo || "—"} (${values.jodStatus || "—"}) · DG: ${values.dgNo || "—"}`,
              },
              tx
            );
          });
          return { success: true, next };
        } catch (e) {
          console.warn("[updateOperationalIds] DB failed, fallback to demoStore:", e);
        }
      }

      let op = demoStore.operationalIds.find((o) => o.ticketId === input.ticketId);
      if (!op) {
        op = {
          id: demoStore.operationalIds.length + 1,
          ticketId: input.ticketId,
          josdNo: input.josdNo || null,
          josdAt: input.josdNo ? new Date() : null,
          jodNo: input.jodNo || null,
          jodStatus: input.jodStatus || null,
          dgNo: input.dgNo || null,
          serverPath: null,
          uploadedAt: null,
          clipperClosedAt: null,
        };
        demoStore.operationalIds.push(op);
      } else {
        if (input.josdNo !== undefined) {
          op.josdNo = input.josdNo;
          if (!op.josdAt) op.josdAt = new Date();
        }
        if (input.jodNo !== undefined) op.jodNo = input.jodNo;
        if (input.jodStatus !== undefined) op.jodStatus = input.jodStatus;
        if (input.dgNo !== undefined) op.dgNo = input.dgNo;
      }

      const t = demoStore.tickets.find((item) => item.id === input.ticketId);
      if (t && next) {
        t.processStatus = next;
        t.processUpdatedAt = new Date();
      }

      await event({
        ticketId: input.ticketId,
        actorUserId: ctx.user.id,
        eventType: "operational_ids_updated",
        detail: `Pembaruan identitas proses: JOS-D: ${op.josdNo || "—"} · JOD: ${op.jodNo || "—"} · DG: ${op.dgNo || "—"}`,
      });

      return { success: true, next };
    }),

  submitQc: protectedProcedure
    .input(
      z.object({
        ticketId: z.number().int(),
        stage: z.enum(QC_STAGES),
        result: z.enum(["lolos", "revisi"]),
        items: z
          .array(
            z.object({
              id: z.number().int().min(1).max(18),
              passed: z.boolean(),
              note: z.string().max(1000).optional(),
            })
          )
          .length(18),
        summary: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles(input.stage, "spv", "qc1", "qc2", "admin", "superadmin")(ctx.user.appRole);

      // Cek status tiket saat ini untuk memvalidasi urutan gerbang ketat
      const db = await getDb();
      let currentStatus: string | null = null;
      if (db) {
        try {
          const [t] = await db
            .select({ processStatus: tickets.processStatus })
            .from(tickets)
            .where(eq(tickets.id, input.ticketId))
            .limit(1);
          currentStatus = t?.processStatus || null;
        } catch (e) {
          console.warn("[submitQc] DB fetch error:", e);
        }
      }
      if (!currentStatus) {
        const t = demoStore.tickets.find((item) => item.id === input.ticketId);
        currentStatus = t?.processStatus || null;
      }

      // Validasi Gerbang Berurutan
      if (input.stage === "spv" && currentStatus !== "qc_spv") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Tahap QC SPV tidak dapat diproses. Status tiket saat ini: '${currentStatus}'. Tiket harus berstatus 'qc_spv'.`,
        });
      }
      if (input.stage === "qc1" && currentStatus !== "qc1") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Tahap QC Checker 1 TERKUNCI. Status tiket saat ini: '${currentStatus}'. Tiket harus lolos QC SPV terlebih dahulu.`,
        });
      }
      if (input.stage === "qc2" && currentStatus !== "qc2") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Tahap QC Checker 2 TERKUNCI. Status tiket saat ini: '${currentStatus}'. Tiket harus lolos QC Checker 1 terlebih dahulu.`,
        });
      }

      // Validasi Catatan Kegagalan saat Revisi
      if (input.result === "revisi") {
        const hasFailedNote = input.items.some((it) => !it.passed && (it.note || "").trim().length > 0);
        const hasSummary = (input.summary || "").trim().length > 0;
        if (!hasFailedNote && !hasSummary) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Wajib mengisi catatan kegagalan pada butir checklist yang tidak lolos atau kolom ringkasan revisi.",
          });
        }
      }

      const next =
        input.result === "revisi"
          ? "revisi_qc"
          : input.stage === "spv"
            ? "qc1"
            : input.stage === "qc1"
              ? "qc2"
              : "siap_upload";

      const nextJobStatus = input.result === "revisi" ? "Revisi dikerjakan" : undefined;

      if (db) {
        try {
          await db.transaction(async (tx) => {
            await tx.insert(qcReviews).values({
              ticketId: input.ticketId,
              checkerUserId: ctx.user.id,
              stage: input.stage,
              result: input.result,
              items: input.items,
              summary: emptyToNull(input.summary),
            });
            await tx
              .update(tickets)
              .set({
                processStatus: next,
                processUpdatedAt: new Date(),
                ...(nextJobStatus ? { jobStatus: nextJobStatus } : {}),
              })
              .where(eq(tickets.id, input.ticketId));
            await event(
              {
                ticketId: input.ticketId,
                actorUserId: ctx.user.id,
                eventType: "qc_completed",
                detail: `${input.stage.toUpperCase()}: ${input.result.toUpperCase()}${input.summary ? ` — ${input.summary}` : ""}`,
              },
              tx
            );
          });
          return { success: true, next };
        } catch (e) {
          console.warn("[submitQc] DB failed, fallback to demoStore:", e);
        }
      }

      const t = demoStore.tickets.find((item) => item.id === input.ticketId);
      if (t) {
        t.processStatus = next;
        t.processUpdatedAt = new Date();
        if (nextJobStatus) {
          t.jobStatus = nextJobStatus;
        }
      }
      demoStore.qcReviews.unshift({
        id: demoStore.qcReviews.length + 1,
        ticketId: input.ticketId,
        checkerUserId: ctx.user.id,
        stage: input.stage,
        result: input.result,
        items: input.items,
        summary: input.summary || null,
        createdAt: new Date(),
      });
      demoStore.activityEvents.unshift({
        id: demoStore.activityEvents.length + 1,
        ticketId: input.ticketId,
        actorUserId: ctx.user.id,
        eventType: "qc_completed",
        detail: `${input.stage.toUpperCase()}: ${input.result.toUpperCase()}${input.summary ? ` — ${input.summary}` : ""}`,
        createdAt: new Date(),
      });
      return { success: true, next };
    }),

  uploadFile: protectedProcedure
    .input(
      z.object({
        ticketId: z.number().int(),
        fileName: z.string().trim().min(1).max(255),
        contentType: z.string().max(120).optional(),
        fileType: z.enum(["draft", "final", "referensi"]),
        note: z.string().max(2000).optional(),
        dataBase64: z.string().min(1).max(16_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch ticket, slot, and request
      const db = await getDb();
      let ticketRow: { ticket: any; slot: any; request: any } | null = null;
      if (db) {
        try {
          const [row] = await db
            .select({ ticket: tickets, slot: designerSlots, request: requests })
            .from(tickets)
            .innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id))
            .innerJoin(requests, eq(tickets.requestId, requests.id))
            .where(eq(tickets.id, input.ticketId))
            .limit(1);
          if (row) ticketRow = row;
        } catch (e) {
          console.warn("[uploadFile] DB ticket fetch error:", e);
        }
      }

      if (!ticketRow) {
        const t = demoStore.tickets.find((item) => item.id === input.ticketId);
        if (t) {
          const slot = demoStore.designerSlots.find((s) => s.id === t.designerSlotId);
          const request = demoStore.requests.find((r) => r.id === t.requestId);
          ticketRow = { ticket: t, slot, request };
        }
      }

      if (!ticketRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
      }

      // 2. Authorization check before decode or storage/db side-effects
      assertCanUploadTicketFile(ctx.user, ticketRow, input.fileType);

      // 3. Base64 payload validation & size check (max 8 MB)
      const bytes = validateBase64Payload(input.dataBase64);

      // 4. File extension and magic bytes validation (server-verified canonical content type)
      const { canonicalContentType } = detectAndValidateFile(input.fileName, bytes);

      const nextProcess =
        input.fileType === "draft"
          ? "review_spv"
          : input.fileType === "final"
            ? "qc_spv"
            : undefined;

      const nextJobStatus =
        input.fileType === "draft"
          ? "Draft dikirim"
          : input.fileType === "final"
            ? "Final dikirim"
            : undefined;

      if (db) {
        try {
          const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const upload = await storagePut(
            `design-local/${ticketRow.ticket.ticketNo}/${input.fileType}/${Date.now()}_${safeName}`,
            bytes,
            canonicalContentType
          );

          // Hitung riwayat versi file sebelumnya untuk tiket dan tipe file ini
          const existingSameTypeFiles = await db
            .select({ id: ticketFiles.id })
            .from(ticketFiles)
            .where(and(eq(ticketFiles.ticketId, input.ticketId), eq(ticketFiles.fileType, input.fileType)));
          const calculatedVersion = existingSameTypeFiles.length + 1;

          await db.transaction(async (tx) => {
            await tx.insert(ticketFiles).values({
              ticketId: input.ticketId,
              uploadedBy: ctx.user.id,
              fileName: input.fileName,
              storageKey: upload.key,
              fileType: input.fileType,
              contentType: canonicalContentType,
              fileSize: bytes.length,
              versionNo: calculatedVersion,
              note: emptyToNull(input.note),
            });

            const ticketUpdates: Record<string, any> = { processUpdatedAt: new Date() };
            if (nextProcess) ticketUpdates.processStatus = nextProcess;
            if (nextJobStatus) {
              ticketUpdates.jobStatus = nextJobStatus;
              ticketUpdates.jobNote = emptyToNull(input.note);
            }

            await tx.update(tickets).set(ticketUpdates).where(eq(tickets.id, input.ticketId));

            if (nextJobStatus) {
              await tx.insert(jobUpdates).values({
                ticketId: input.ticketId,
                designerSlotId: ticketRow.slot.id,
                designerUserId: ctx.user.id,
                status: nextJobStatus,
                note: emptyToNull(input.note) || `Unggah berkas ${input.fileType} v${calculatedVersion}`,
                eta: null,
              });
            }

            await event(
              {
                ticketId: input.ticketId,
                actorUserId: ctx.user.id,
                eventType: "file_uploaded",
                detail: `${input.fileName} (v${calculatedVersion}) diunggah sebagai ${input.fileType.toUpperCase()}${input.note ? ` — Catatan: ${input.note}` : ""}`,
              },
              tx
            );
          });

          return {
            success: true,
            fileName: input.fileName,
            versionNo: calculatedVersion,
            note: input.note || null,
            nextProcess: nextProcess || ticketRow.ticket.processStatus,
          };
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          console.warn("[uploadFile] DB write failed, fallback to demoStore:", e instanceof Error ? e.message : "unknown");
        }
      }

      // Demo store file insertion
      const t = ticketRow.ticket;
      const demoSameTypeFiles = demoStore.ticketFiles.filter(
        (f) => f.ticketId === input.ticketId && f.fileType === input.fileType
      );
      const calculatedVersion = demoSameTypeFiles.length + 1;

      if (t) {
        if (nextProcess) {
          t.processStatus = nextProcess;
          t.processUpdatedAt = new Date();
        }
        if (nextJobStatus) {
          t.jobStatus = nextJobStatus;
          t.jobNote = input.note || null;
        }
      }

      demoStore.ticketFiles.unshift({
        id: demoStore.ticketFiles.length + 1,
        ticketId: input.ticketId,
        uploadedBy: ctx.user.id,
        fileName: input.fileName,
        storageKey: `demo/${input.fileName}`,
        fileType: input.fileType,
        contentType: canonicalContentType,
        fileSize: bytes.length,
        versionNo: calculatedVersion,
        note: input.note || null,
        createdAt: new Date(),
      });

      if (t && nextJobStatus) {
        demoStore.jobUpdates.unshift({
          id: demoStore.jobUpdates.length + 1,
          ticketId: input.ticketId,
          designerSlotId: t.designerSlotId,
          designerUserId: ctx.user.id,
          status: nextJobStatus,
          note: input.note || `Unggah berkas ${input.fileType} v${calculatedVersion}`,
          eta: null,
          createdAt: new Date(),
        });
      }

      await event({
        ticketId: input.ticketId,
        actorUserId: ctx.user.id,
        eventType: "file_uploaded",
        detail: `${input.fileName} (v${calculatedVersion}) diunggah sebagai ${input.fileType.toUpperCase()}${input.note ? ` — Catatan: ${input.note}` : ""}`,
      });

      return {
        success: true,
        fileName: input.fileName,
        versionNo: calculatedVersion,
        note: input.note || null,
        nextProcess: nextProcess || (t ? t.processStatus : "draft"),
      };
    }),

  registerServerUpload: protectedProcedure
    .input(
      z.object({
        ticketId: z.number().int(),
        serverPath: z.string().trim().min(3).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Role gate
      roles("admin", "spv", "superadmin", "designer", "qc1", "qc2")(ctx.user.appRole);

      // 2. Fetch ticket (and slot)
      const db = await getDb();
      let ticketRow: { ticket: any; slot: any } | null = null;
      if (db) {
        try {
          const [row] = await db
            .select({ ticket: tickets, slot: designerSlots })
            .from(tickets)
            .innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id))
            .where(eq(tickets.id, input.ticketId))
            .limit(1);
          if (row) ticketRow = row;
        } catch (e) {
          console.warn("[registerServerUpload] DB fetch error:", e);
        }
      }

      if (!ticketRow) {
        const t = demoStore.tickets.find((item) => item.id === input.ticketId);
        if (t) {
          const slot = demoStore.designerSlots.find((s) => s.id === t.designerSlotId);
          ticketRow = { ticket: t, slot };
        }
      }

      if (!ticketRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
      }

      // 3. Resource assignment check for designer
      assertCanRegisterServerUpload(ctx.user, ticketRow);

      // 4. Verifikasi Gerbang: Tiket harus sudah lolos QC Checker 2 (status: siap_upload, uploaded, menunggu_close, closed)
      const currentStatus = ticketRow.ticket.processStatus;
      const allowedStatuses = ["siap_upload", "uploaded", "menunggu_close", "closed"];
      if (!currentStatus || !allowedStatuses.includes(currentStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Gerbang Upload Server Produksi (192.168.0.24) TERKUNCI. Seluruh tahap QC (SPV, QC1, QC2) wajib Lolos terlebih dahulu. Status tiket saat ini: '${currentStatus}'.`,
        });
      }

      if (db) {
        try {
          const [op] = await db
            .select()
            .from(operationalIds)
            .where(eq(operationalIds.ticketId, input.ticketId))
            .limit(1);

          await db.transaction(async (tx) => {
            if (op) {
              await tx
                .update(operationalIds)
                .set({ serverPath: input.serverPath, uploadedAt: new Date() })
                .where(eq(operationalIds.ticketId, input.ticketId));
            } else {
              await tx.insert(operationalIds).values({
                ticketId: input.ticketId,
                serverPath: input.serverPath,
                uploadedAt: new Date(),
              });
            }
            await tx
              .update(tickets)
              .set({
                processStatus: currentStatus === "siap_upload" ? "uploaded" : currentStatus,
                processUpdatedAt: new Date(),
              })
              .where(eq(tickets.id, input.ticketId));

            await event(
              {
                ticketId: input.ticketId,
                actorUserId: ctx.user.id,
                eventType: "server_uploaded",
                detail: `Berkas final produksi diunggah ke server jaringan: ${input.serverPath}`,
              },
              tx
            );
          });
          return { success: true };
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          console.warn("[registerServerUpload] DB failed, fallback to demoStore:", e);
        }
      }

      const t = ticketRow.ticket;
      if (t && t.processStatus === "siap_upload") {
        t.processStatus = "uploaded";
        t.processUpdatedAt = new Date();
      }
      let op = demoStore.operationalIds.find((o) => o.ticketId === input.ticketId);
      if (op) {
        op.serverPath = input.serverPath;
        op.uploadedAt = new Date();
      } else {
        demoStore.operationalIds.push({
          id: demoStore.operationalIds.length + 1,
          ticketId: input.ticketId,
          josdNo: null,
          josdAt: null,
          jodNo: null,
          jodStatus: "open",
          dgNo: null,
          serverPath: input.serverPath,
          uploadedAt: new Date(),
          clipperClosedAt: null,
        });
      }
      demoStore.activityEvents.unshift({
        id: demoStore.activityEvents.length + 1,
        ticketId: input.ticketId,
        actorUserId: ctx.user.id,
        eventType: "server_uploaded",
        detail: `Berkas final produksi diunggah ke server jaringan: ${input.serverPath}`,
        createdAt: new Date(),
      });
      return { success: true };
    }),

  close: protectedProcedure
    .input(z.object({ ticketId: z.number().int(), jodClosed: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      roles("admin", "spv", "superadmin")(ctx.user.appRole);
      const db = await getDb();
      let ticketRow: any = null;
      let opRow: any = null;

      if (db) {
        try {
          const [t] = await db.select().from(tickets).where(eq(tickets.id, input.ticketId)).limit(1);
          ticketRow = t || null;
          const [op] = await db.select().from(operationalIds).where(eq(operationalIds.ticketId, input.ticketId)).limit(1);
          opRow = op || null;
        } catch (e) {
          console.warn("[close] DB fetch error:", e);
        }
      }
      if (!ticketRow) {
        ticketRow = demoStore.tickets.find((item) => item.id === input.ticketId);
      }
      if (!opRow) {
        opRow = demoStore.operationalIds.find((o) => o.ticketId === input.ticketId);
      }

      // Validasi Kelengkapan Berkas Sebelum Penutupan
      if (!opRow?.jodNo || !opRow.jodNo.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Gagal menutup tiket: Nomor JOD (Clipper) wajib terisi terlebih dahulu.",
        });
      }
      if (!opRow?.serverPath || !opRow.serverPath.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Gagal menutup tiket: Berkas final belum dicatat/diunggah ke server produksi (192.168.0.24).",
        });
      }
      const allowedCloseStates = ["siap_upload", "uploaded", "menunggu_close", "closed"];
      if (!ticketRow || !allowedCloseStates.includes(ticketRow.processStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Gagal menutup tiket: Tiket belum menyelesaikan seluruh tahapan QC. Status tiket saat ini: '${ticketRow?.processStatus}'.`,
        });
      }

      if (db) {
        try {
          await db.transaction(async (tx) => {
            await tx
              .update(operationalIds)
              .set({ jodStatus: "closed", clipperClosedAt: new Date() })
              .where(eq(operationalIds.ticketId, input.ticketId));
            await tx
              .update(tickets)
              .set({
                processStatus: "closed",
                jobStatus: "Selesai",
                processUpdatedAt: new Date(),
                closedAt: new Date(),
              })
              .where(eq(tickets.id, input.ticketId));

            await event(
              {
                ticketId: input.ticketId,
                actorUserId: ctx.user.id,
                eventType: "ticket_closed",
                detail: `Penutupan JOD (${opRow.jodNo}) dan pengarsipan tiket selesai.`,
              },
              tx
            );
          });
          return { success: true };
        } catch (e) {
          console.warn("[close] DB failed, fallback to demoStore:", e);
        }
      }

      if (ticketRow) {
        ticketRow.processStatus = "closed";
        ticketRow.jobStatus = "Selesai";
        ticketRow.closedAt = new Date();
        ticketRow.processUpdatedAt = new Date();
      }
      if (opRow) {
        opRow.jodStatus = "closed";
        opRow.clipperClosedAt = new Date();
      }
      demoStore.activityEvents.unshift({
        id: demoStore.activityEvents.length + 1,
        ticketId: input.ticketId,
        actorUserId: ctx.user.id,
        eventType: "ticket_closed",
        detail: `Penutupan JOD (${opRow?.jodNo || "—"}) dan pengarsipan tiket selesai.`,
        createdAt: new Date(),
      });
      return { success: true };
    }),
});
