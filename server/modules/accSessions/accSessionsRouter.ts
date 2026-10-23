import { TRPCError } from "@trpc/server";
import { eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { protectedProcedure, router } from "../../_core/trpc";
import {
  accSessions,
  accSessionItems,
  users,
  tickets,
  requests,
  ticketFiles,
  approvals,
  activityEvents,
} from "../../../drizzle/schema";
import {
  ACC_SESSION_STATUSES,
  ACC_DECISION_TYPES,
  type AccDecisionType,
} from "../../../shared/modules/accSessions/constants";
import { roles, emptyToNull, event } from "../common/helpers";
import { demoStore } from "../../demoStore";

function syncTicketStatus(
  decision: AccDecisionType,
  notes?: string
): {
  nextProcess?: "menunggu_josd" | "revisi_owner" | "ditolak_owner" | "menunggu_acc_owner";
  nextJobStatus?: "Sedang dikerjakan" | "Revisi dikerjakan" | "Terhambat";
  eventDetail: string;
} {
  if (decision === "acc" || decision === "acc_catatan") {
    return {
      nextProcess: "menunggu_josd",
      nextJobStatus: "Sedang dikerjakan",
      eventDetail: `ACC Owner disahkan: status dilanjutkan ke Menunggu JOS-D${notes ? ` — Catatan: ${notes}` : ""}`,
    };
  }
  if (decision === "revisi") {
    return {
      nextProcess: "revisi_owner",
      nextJobStatus: "Revisi dikerjakan",
      eventDetail: `Owner meminta revisi: tiket dikembalikan ke antrean desainer — ${notes || "Harap sesuaikan catatan Owner"}`,
    };
  }
  if (decision === "tolak") {
    return {
      nextProcess: "ditolak_owner",
      nextJobStatus: "Terhambat",
      eventDetail: `Owner menolak konsep desain — ${notes || "Desain dibatalkan"}`,
    };
  }
  return {
    nextProcess: "menunggu_acc_owner",
    eventDetail: "Diajukan ke agenda Sesi ACC Owner",
  };
}

export const accSessionsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (db) {
      try {
        const rows = await db
          .select({
            session: accSessions,
            recorder: users,
          })
          .from(accSessions)
          .leftJoin(users, eq(accSessions.recordedByUserId, users.id))
          .orderBy(desc(accSessions.presentationDate), desc(accSessions.id));

        const allItems = await db.select().from(accSessionItems);

        return rows.map(({ session, recorder }) => {
          const items = allItems.filter((it) => it.sessionId === session.id);
          return {
            ...session,
            recorderName: recorder?.name || "SPV / Admin",
            itemsCount: items.length,
          };
        });
      } catch (e) {
        console.warn("[accSessions.list] DB failed, fallback to demoStore:", e);
      }
    }

    return demoStore
      .getAccSessions()
      .sort((a, b) => new Date(b.presentationDate).getTime() - new Date(a.presentationDate).getTime());
  }),

  detail: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (db) {
        try {
          const [row] = await db
            .select({
              session: accSessions,
              recorder: users,
            })
            .from(accSessions)
            .leftJoin(users, eq(accSessions.recordedByUserId, users.id))
            .where(eq(accSessions.id, input.id))
            .limit(1);

          if (row) {
            const rawItems = await db
              .select({
                item: accSessionItems,
                ticket: tickets,
                request: requests,
              })
              .from(accSessionItems)
              .leftJoin(tickets, eq(accSessionItems.ticketId, tickets.id))
              .leftJoin(requests, eq(tickets.requestId, requests.id))
              .where(eq(accSessionItems.sessionId, input.id));

            const items = rawItems.map(({ item, ticket, request }) => ({
              ...item,
              ticketNo: ticket?.ticketNo || null,
              processStatus: ticket?.processStatus || null,
              jobStatus: ticket?.jobStatus || null,
              productType: request?.productType || null,
            }));

            return {
              ...row.session,
              recorderName: row.recorder?.name || "SPV / Admin",
              items,
            };
          }
        } catch (e) {
          console.warn("[accSessions.detail] DB failed, fallback to demoStore:", e);
        }
      }

      const session = demoStore.getAccSessionDetail(input.id);
      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesi ACC tidak ditemukan." });
      }
      return session;
    }),

  availableTickets: protectedProcedure.query(async () => {
    const db = await getDb();
    if (db) {
      try {
        const rows = await db
          .select({
            ticket: tickets,
            request: requests,
          })
          .from(tickets)
          .innerJoin(requests, eq(tickets.requestId, requests.id))
          .orderBy(desc(tickets.id));

        const files = await db.select().from(ticketFiles);

        return rows.map(({ ticket, request }) => {
          const tFiles = files
            .filter((f) => f.ticketId === ticket.id)
            .sort((a, b) => b.versionNo - a.versionNo);
          const latest = tFiles[0];
          return {
            id: ticket.id,
            ticketNo: ticket.ticketNo,
            productType: request.productType,
            requesterName: request.requesterName,
            processStatus: ticket.processStatus,
            jobStatus: ticket.jobStatus,
            latestVersion: latest ? `v${latest.versionNo} (${latest.fileType})` : "v1",
            latestFileName: latest?.fileName || null,
          };
        });
      } catch (e) {
        console.warn("[accSessions.availableTickets] DB failed, fallback to demoStore:", e);
      }
    }

    return demoStore.tickets.map((ticket) => {
      const request = demoStore.requests.find((r) => r.id === ticket.requestId)!;
      const tFiles = demoStore.ticketFiles
        .filter((f) => f.ticketId === ticket.id)
        .sort((a, b) => b.versionNo - a.versionNo);
      const latest = tFiles[0];
      return {
        id: ticket.id,
        ticketNo: ticket.ticketNo,
        productType: request?.productType || "Desain Produk",
        requesterName: request?.requesterName || "Peminta",
        processStatus: ticket.processStatus,
        jobStatus: ticket.jobStatus,
        latestVersion: latest ? `v${latest.versionNo} (${latest.fileType})` : "v1",
        latestFileName: latest?.fileName || null,
      };
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        sessionNo: z
          .string()
          .trim()
          .regex(/^ACC-\d{4}-(0[1-9]|1[0-2])$/, "Format nomor sesi harus ACC-YYYY-MM (contoh: ACC-2026-10)"),
        presentationDate: z.string().min(10).max(10), // YYYY-MM-DD
        attendees: z.array(z.string().trim().min(1)).min(1, "Minimal 1 peserta meeting harus diisi"),
        generalNotes: z.string().max(4000).optional(),
        status: z.enum(ACC_SESSION_STATUSES).default("scheduled"),
        items: z
          .array(
            z.object({
              ticketId: z.number().int().optional(),
              title: z.string().trim().min(1).max(255),
              fileVersion: z.string().trim().max(64).optional(),
              decision: z.enum(ACC_DECISION_TYPES).default("pending"),
              notes: z.string().max(2000).optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("spv", "admin", "superadmin", "manager", "owner")(ctx.user.appRole);

      const db = await getDb();

      // Cek duplikasi nomor sesi
      if (db) {
        try {
          const [existing] = await db
            .select({ id: accSessions.id })
            .from(accSessions)
            .where(eq(accSessions.sessionNo, input.sessionNo))
            .limit(1);

          if (existing) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Nomor sesi ${input.sessionNo} sudah pernah digunakan. Harap gunakan nomor sesi yang unik.`,
            });
          }

          let createdId = 0;
          await db.transaction(async (tx) => {
            const [inserted] = await tx.insert(accSessions).values({
              sessionNo: input.sessionNo,
              presentationDate: input.presentationDate as any,
              recordedByUserId: ctx.user.id,
              attendees: input.attendees,
              generalNotes: emptyToNull(input.generalNotes),
              status: input.status,
            });
            createdId = inserted.insertId;

            if (input.items && input.items.length > 0) {
              for (const it of input.items) {
                await tx.insert(accSessionItems).values({
                  sessionId: createdId,
                  ticketId: it.ticketId || null,
                  title: it.title,
                  fileVersion: emptyToNull(it.fileVersion),
                  decision: it.decision,
                  notes: emptyToNull(it.notes),
                });

                // Sinkronisasi status tiket jika ada keputusan non-pending
                if (it.ticketId && it.decision !== "pending") {
                  const sync = syncTicketStatus(it.decision, it.notes);
                  if (sync.nextProcess) {
                    await tx
                      .update(tickets)
                      .set({
                        processStatus: sync.nextProcess,
                        ...(sync.nextJobStatus ? { jobStatus: sync.nextJobStatus } : {}),
                        processUpdatedAt: new Date(),
                      })
                      .where(eq(tickets.id, it.ticketId));

                    await tx.insert(approvals).values({
                      ticketId: it.ticketId,
                      reviewerUserId: ctx.user.id,
                      stage: "owner",
                      decision: it.decision,
                      note: emptyToNull(it.notes) || `Disahkan melalui Sesi ACC ${input.sessionNo}`,
                    });

                    await tx.insert(activityEvents).values({
                      ticketId: it.ticketId,
                      actorUserId: ctx.user.id,
                      eventType: "owner_decision",
                      detail: `${input.sessionNo}: ${sync.eventDetail}`,
                    });
                  }
                }
              }
            }
          });

          return { success: true, id: createdId, sessionNo: input.sessionNo };
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          console.warn("[accSessions.create] DB failed, fallback to demoStore:", e);
        }
      }

      // Fallback demoStore
      const dup = demoStore.accSessions.find((s) => s.sessionNo.toLowerCase() === input.sessionNo.toLowerCase());
      if (dup) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Nomor sesi ${input.sessionNo} sudah ada dalam riwayat sesi ACC.`,
        });
      }

      const newId = demoStore.accSessions.length + 1;
      const newSession = {
        id: newId,
        sessionNo: input.sessionNo,
        presentationDate: input.presentationDate,
        recordedByUserId: ctx.user.id,
        attendees: input.attendees,
        generalNotes: input.generalNotes || null,
        status: input.status,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      demoStore.accSessions.unshift(newSession);

      if (input.items && input.items.length > 0) {
        input.items.forEach((it) => {
          demoStore.accSessionItems.push({
            id: demoStore.accSessionItems.length + 1,
            sessionId: newId,
            ticketId: it.ticketId || null,
            title: it.title,
            fileVersion: it.fileVersion || null,
            decision: it.decision,
            notes: it.notes || null,
            createdAt: new Date(),
          });

          if (it.ticketId && it.decision !== "pending") {
            const sync = syncTicketStatus(it.decision, it.notes);
            const t = demoStore.tickets.find((tick) => tick.id === it.ticketId);
            if (t && sync.nextProcess) {
              t.processStatus = sync.nextProcess;
              if (sync.nextJobStatus) t.jobStatus = sync.nextJobStatus;
              t.processUpdatedAt = new Date();
            }
            demoStore.approvals.unshift({
              id: demoStore.approvals.length + 1,
              ticketId: it.ticketId,
              reviewerUserId: ctx.user.id,
              stage: "owner",
              decision: it.decision,
              note: it.notes || `Disahkan melalui Sesi ACC ${input.sessionNo}`,
              fileId: null,
              createdAt: new Date(),
            });
            demoStore.activityEvents.unshift({
              id: demoStore.activityEvents.length + 1,
              ticketId: it.ticketId,
              actorUserId: ctx.user.id,
              eventType: "owner_decision",
              detail: `${input.sessionNo}: ${sync.eventDetail}`,
              createdAt: new Date(),
            });
          }
        });
      }

      demoStore.activityEvents.unshift({
        id: demoStore.activityEvents.length + 1,
        ticketId: null,
        actorUserId: ctx.user.id,
        eventType: "acc_session_created",
        detail: `Sesi presentasi ACC bulanan ${input.sessionNo} dijadwalkan pada ${input.presentationDate}.`,
        createdAt: new Date(),
      });

      return { success: true, id: newId, sessionNo: input.sessionNo };
    }),

  addItem: protectedProcedure
    .input(
      z.object({
        sessionId: z.number().int(),
        ticketId: z.number().int(),
        title: z.string().trim().min(1).max(255).optional(),
        fileVersion: z.string().trim().max(64).optional(),
        decision: z.enum(ACC_DECISION_TYPES),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("spv", "admin", "superadmin", "manager", "owner")(ctx.user.appRole);

      // Validasi: Keputusan revisi atau tolak wajib menyertakan catatan
      if ((input.decision === "revisi" || input.decision === "tolak") && (!input.notes || !input.notes.trim())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Wajib mengisi catatan/alasan jika keputusan Owner adalah '${input.decision === "revisi" ? "Revisi" : "Tolak"}'.`,
        });
      }

      const db = await getDb();
      if (db) {
        try {
          const [session] = await db
            .select()
            .from(accSessions)
            .where(eq(accSessions.id, input.sessionId))
            .limit(1);

          if (!session) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Sesi ACC tidak ditemukan." });
          }

          const [ticket] = await db
            .select({ ticket: tickets, request: requests })
            .from(tickets)
            .innerJoin(requests, eq(tickets.requestId, requests.id))
            .where(eq(tickets.id, input.ticketId))
            .limit(1);

          if (!ticket) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
          }

          const itemTitle = input.title || `${ticket.ticket.ticketNo} - ${ticket.request.productType}`;
          const sync = syncTicketStatus(input.decision, input.notes);

          let createdItemId = 0;
          await db.transaction(async (tx) => {
            const [inserted] = await tx.insert(accSessionItems).values({
              sessionId: input.sessionId,
              ticketId: input.ticketId,
              title: itemTitle,
              fileVersion: emptyToNull(input.fileVersion) || "v1",
              decision: input.decision,
              notes: emptyToNull(input.notes),
            });
            createdItemId = inserted.insertId;

            // Sinkronisasi status tiket otomatis
            if (sync.nextProcess) {
              await tx
                .update(tickets)
                .set({
                  processStatus: sync.nextProcess,
                  ...(sync.nextJobStatus ? { jobStatus: sync.nextJobStatus } : {}),
                  processUpdatedAt: new Date(),
                })
                .where(eq(tickets.id, input.ticketId));

              await tx.insert(approvals).values({
                ticketId: input.ticketId,
                reviewerUserId: ctx.user.id,
                stage: "owner",
                decision: input.decision,
                note: emptyToNull(input.notes) || `Disahkan melalui Sesi ACC ${session.sessionNo}`,
              });

              await tx.insert(activityEvents).values({
                ticketId: input.ticketId,
                actorUserId: ctx.user.id,
                eventType: "owner_decision",
                detail: `Sesi ${session.sessionNo}: ${sync.eventDetail}`,
              });
            }
          });

          return { success: true, id: createdItemId, nextProcess: sync.nextProcess };
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          console.warn("[accSessions.addItem] DB failed, fallback to demoStore:", e);
        }
      }

      // Fallback demoStore
      const session = demoStore.accSessions.find((s) => s.id === input.sessionId);
      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesi ACC tidak ditemukan." });
      }

      const ticketRow = demoStore.tickets.find((t) => t.id === input.ticketId);
      if (!ticketRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tiket tidak ditemukan." });
      }
      const requestRow = demoStore.requests.find((r) => r.id === ticketRow.requestId);
      const itemTitle = input.title || `${ticketRow.ticketNo} - ${requestRow?.productType || "Desain"}`;
      const sync = syncTicketStatus(input.decision, input.notes);

      const newItemId = demoStore.accSessionItems.length + 1;
      demoStore.accSessionItems.push({
        id: newItemId,
        sessionId: input.sessionId,
        ticketId: input.ticketId,
        title: itemTitle,
        fileVersion: input.fileVersion || "v1",
        decision: input.decision,
        notes: input.notes || null,
        createdAt: new Date(),
      });

      // Sinkronisasi tiket otomatis di demoStore
      if (sync.nextProcess) {
        ticketRow.processStatus = sync.nextProcess;
        if (sync.nextJobStatus) ticketRow.jobStatus = sync.nextJobStatus;
        ticketRow.processUpdatedAt = new Date();

        demoStore.approvals.unshift({
          id: demoStore.approvals.length + 1,
          ticketId: input.ticketId,
          reviewerUserId: ctx.user.id,
          stage: "owner",
          decision: input.decision,
          note: input.notes || `Disahkan melalui Sesi ACC ${session.sessionNo}`,
          fileId: null,
          createdAt: new Date(),
        });

        demoStore.activityEvents.unshift({
          id: demoStore.activityEvents.length + 1,
          ticketId: input.ticketId,
          actorUserId: ctx.user.id,
          eventType: "owner_decision",
          detail: `Sesi ${session.sessionNo}: ${sync.eventDetail}`,
          createdAt: new Date(),
        });
      }

      return { success: true, id: newItemId, nextProcess: sync.nextProcess };
    }),

  updateItemDecision: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int(),
        decision: z.enum(ACC_DECISION_TYPES),
        notes: z.string().max(2000).optional(),
        fileVersion: z.string().trim().max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("spv", "admin", "superadmin", "manager", "owner")(ctx.user.appRole);

      if ((input.decision === "revisi" || input.decision === "tolak") && (!input.notes || !input.notes.trim())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Wajib mengisi catatan/alasan jika keputusan Owner adalah '${input.decision === "revisi" ? "Revisi" : "Tolak"}'.`,
        });
      }

      const db = await getDb();
      if (db) {
        try {
          const [item] = await db
            .select()
            .from(accSessionItems)
            .where(eq(accSessionItems.id, input.itemId))
            .limit(1);

          if (!item) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Baris item sesi tidak ditemukan." });
          }

          const sync = syncTicketStatus(input.decision, input.notes);

          await db.transaction(async (tx) => {
            await tx
              .update(accSessionItems)
              .set({
                decision: input.decision,
                notes: emptyToNull(input.notes),
                ...(input.fileVersion ? { fileVersion: emptyToNull(input.fileVersion) } : {}),
              })
              .where(eq(accSessionItems.id, input.itemId));

            if (item.ticketId && sync.nextProcess) {
              await tx
                .update(tickets)
                .set({
                  processStatus: sync.nextProcess,
                  ...(sync.nextJobStatus ? { jobStatus: sync.nextJobStatus } : {}),
                  processUpdatedAt: new Date(),
                })
                .where(eq(tickets.id, item.ticketId));

              await tx.insert(approvals).values({
                ticketId: item.ticketId,
                reviewerUserId: ctx.user.id,
                stage: "owner",
                decision: input.decision,
                note: emptyToNull(input.notes) || "Pembaruan keputusan sesi ACC",
              });

              await tx.insert(activityEvents).values({
                ticketId: item.ticketId,
                actorUserId: ctx.user.id,
                eventType: "owner_decision",
                detail: `Pembaruan keputusan Sesi ACC: ${sync.eventDetail}`,
              });
            }
          });

          return { success: true, nextProcess: sync.nextProcess };
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          console.warn("[accSessions.updateItemDecision] DB failed, fallback to demoStore:", e);
        }
      }

      // Fallback demoStore
      const it = demoStore.accSessionItems.find((i) => i.id === input.itemId);
      if (!it) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Baris item sesi tidak ditemukan." });
      }

      it.decision = input.decision;
      if (input.notes !== undefined) it.notes = input.notes || null;
      if (input.fileVersion) it.fileVersion = input.fileVersion;

      if (it.ticketId) {
        const sync = syncTicketStatus(input.decision, input.notes);
        const ticketRow = demoStore.tickets.find((t) => t.id === it.ticketId);
        if (ticketRow && sync.nextProcess) {
          ticketRow.processStatus = sync.nextProcess;
          if (sync.nextJobStatus) ticketRow.jobStatus = sync.nextJobStatus;
          ticketRow.processUpdatedAt = new Date();
        }

        demoStore.approvals.unshift({
          id: demoStore.approvals.length + 1,
          ticketId: it.ticketId,
          reviewerUserId: ctx.user.id,
          stage: "owner",
          decision: input.decision,
          note: input.notes || "Pembaruan keputusan sesi ACC",
          fileId: null,
          createdAt: new Date(),
        });

        demoStore.activityEvents.unshift({
          id: demoStore.activityEvents.length + 1,
          ticketId: it.ticketId,
          actorUserId: ctx.user.id,
          eventType: "owner_decision",
          detail: `Pembaruan keputusan Sesi ACC: ${sync.eventDetail}`,
          createdAt: new Date(),
        });
        return { success: true, nextProcess: sync.nextProcess };
      }

      return { success: true };
    }),

  removeItem: protectedProcedure
    .input(z.object({ itemId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      roles("spv", "admin", "superadmin", "manager", "owner")(ctx.user.appRole);

      const db = await getDb();
      if (db) {
        try {
          await db.delete(accSessionItems).where(eq(accSessionItems.id, input.itemId));
          return { success: true };
        } catch (e) {
          console.warn("[accSessions.removeItem] DB failed, fallback to demoStore:", e);
        }
      }

      const idx = demoStore.accSessionItems.findIndex((i) => i.id === input.itemId);
      if (idx !== -1) {
        demoStore.accSessionItems.splice(idx, 1);
      }
      return { success: true };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        generalNotes: z.string().max(4000).optional(),
        status: z.enum(ACC_SESSION_STATUSES).optional(),
        attendees: z.array(z.string().trim().min(1)).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("spv", "admin", "superadmin", "manager", "owner")(ctx.user.appRole);

      const db = await getDb();
      if (db) {
        try {
          await db
            .update(accSessions)
            .set({
              ...(input.generalNotes !== undefined ? { generalNotes: emptyToNull(input.generalNotes) } : {}),
              ...(input.status ? { status: input.status } : {}),
              ...(input.attendees ? { attendees: input.attendees } : {}),
              updatedAt: new Date(),
            })
            .where(eq(accSessions.id, input.id));
          return { success: true };
        } catch (e) {
          console.warn("[accSessions.update] DB failed, fallback to demoStore:", e);
        }
      }

      const s = demoStore.accSessions.find((item) => item.id === input.id);
      if (!s) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sesi ACC tidak ditemukan." });
      }
      if (input.generalNotes !== undefined) s.generalNotes = input.generalNotes || null;
      if (input.status) s.status = input.status;
      if (input.attendees) s.attendees = input.attendees;
      s.updatedAt = new Date();

      return { success: true };
    }),
});
