import { TRPCError } from "@trpc/server";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requestFiles, requests, users } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { demoStore } from "../../demoStore";
import { storageGetSignedUrl, storagePut } from "../../storage";
import { protectedProcedure, router } from "../../_core/trpc";
import { emptyToNull, event, readSlaHours, roles } from "../common/helpers";

export const requestsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    roles("superadmin", "marketing", "owner", "manager", "spv")(ctx.user.appRole);
    const db = await getDb();
    const slaHours = await readSlaHours(db);

    if (db) {
      try {
        const rows = await db
          .select({ request: requests, reviewerName: users.name })
          .from(requests)
          .leftJoin(users, eq(requests.reviewedBy, users.id))
          .orderBy(desc(requests.createdAt))
          .limit(200);

        if (rows.length > 0) {
          const visible =
            ctx.user.appRole === "marketing"
              ? rows.filter(({ request }) => request.requesterUserId === ctx.user.id)
              : rows;

          const files = await db
            .select()
            .from(requestFiles)
            .where(inArray(requestFiles.requestId, visible.map(({ request }) => request.id)));

          return Promise.all(
            visible.map(async ({ request, reviewerName }) => ({
              ...request,
              reviewerName,
              slaHours: slaHours.request_review,
              referenceFiles: await Promise.all(
                files
                  .filter((file) => file.requestId === request.id)
                  .map(async (file) => {
                    try {
                      return { ...file, downloadUrl: await storageGetSignedUrl(file.storageKey) };
                    } catch {
                      return { ...file, downloadUrl: `/manus-storage/${file.storageKey}` };
                    }
                  })
              ),
            }))
          );
        }
      } catch (e) {
        console.warn("[requests.list] DB query failed, fallback to demoStore:", e);
      }
    }

    // Demo store fallback
    const demoRows = ctx.user.appRole === "marketing"
      ? demoStore.requests.filter((r) => r.requesterUserId === ctx.user.id)
      : demoStore.requests;

    return demoRows.map((req) => ({
      ...req,
      reviewerName: demoStore.users.find((u) => u.id === req.reviewedBy)?.name || null,
      slaHours: slaHours.request_review,
      referenceFiles: [],
    }));
  }),

  create: protectedProcedure
    .input(
      z
        .object({
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
          designReuse: z.enum(["reuse", "recolor", "new"]).optional(),
          requestedPriority: z.enum(["normal", "urgent"]).default("normal"),
          urgentReason: z.string().max(2000).optional(),
          deadline: z.string().date().optional(),
          referenceLink: z.string().max(2000).optional(),
          notes: z.string().max(2000).optional(),
          gateDecision: z.enum(["lanjut", "tunda", "tolak", "desain_existing"]).optional(),
          gateReason: z.string().max(2000).optional(),
          internalNotes: z.string().max(2000).optional(),
          referenceFile: z
            .object({
              fileName: z.string().min(1).max(255),
              contentType: z.string().max(120),
              dataBase64: z.string().min(1).max(12_000_000),
            })
            .optional(),
        })
        .superRefine((data, ctx) => {
          if (data.source === "marketing") {
            if (!data.productionEstimate?.trim())
              ctx.addIssue({
                code: "custom",
                path: ["productionEstimate"],
                message: "Estimasi produksi wajib diisi.",
              });
            if (!data.businessJustification?.trim())
              ctx.addIssue({
                code: "custom",
                path: ["businessJustification"],
                message: "Justifikasi bisnis wajib diisi.",
              });
            if (!data.sourceReason?.trim())
              ctx.addIssue({
                code: "custom",
                path: ["sourceReason"],
                message: "Sumber permintaan wajib dipilih.",
              });
            if (!data.targetArea?.trim())
              ctx.addIssue({
                code: "custom",
                path: ["targetArea"],
                message: "Cabang/area target wajib diisi.",
              });
            if (!data.sizeSpec?.trim())
              ctx.addIssue({
                code: "custom",
                path: ["sizeSpec"],
                message: "Ukuran/spesifikasi wajib diisi.",
              });
            if (!data.theme?.trim())
              ctx.addIssue({
                code: "custom",
                path: ["theme"],
                message: "Tema/konsep desain wajib diisi.",
              });
            if (!data.similarDesign)
              ctx.addIssue({
                code: "custom",
                path: ["similarDesign"],
                message: "Pilih apakah desain serupa sudah ada.",
              });
            if (data.similarDesign === "ya" && !data.similarDesignRef?.trim())
              ctx.addIssue({
                code: "custom",
                path: ["similarDesignRef"],
                message: "Sebutkan nomor DG atau nama desain serupa.",
              });
            if (data.sourceReason === "Kompetitor" && !data.competitorReference?.trim())
              ctx.addIssue({
                code: "custom",
                path: ["competitorReference"],
                message: "Cantumkan merek/produk acuan kompetitor.",
              });
          }
          if (data.gateDecision && data.gateDecision !== "lanjut" && !data.gateReason?.trim()) {
            ctx.addIssue({
              code: "custom",
              path: ["gateReason"],
              message: "Alasan wajib diisi jika keputusan gerbang selain Lanjut.",
            });
          }
          if (
            data.referenceLink?.trim() &&
            !(
              /^https?:\/\//i.test(data.referenceLink.trim()) ||
              /^\\\\192\.168\.0\.24[\\/]/i.test(data.referenceLink.trim()) ||
              /^192\.168\.0\.24[\\/]/i.test(data.referenceLink.trim())
            )
          ) {
            ctx.addIssue({
              code: "custom",
              path: ["referenceLink"],
              message:
                "Referensi harus berupa URL HTTP(S) atau path pada server 192.168.0.24.",
            });
          }
          if (data.requestedPriority === "urgent" && !data.urgentReason?.trim()) {
            ctx.addIssue({
              code: "custom",
              path: ["urgentReason"],
              message: "Alasan urgent wajib diisi.",
            });
          }
        })
    )
    .mutation(async ({ ctx, input }) => {
      roles("marketing", "owner", "manager", "spv", "admin", "superadmin")(ctx.user.appRole);
      const db = await getDb();
      const existingCount = db
        ? (await db.select({ id: requests.id }).from(requests)).length
        : demoStore.requests.length;
      const requestNo = `REQ-${new Date().getFullYear()}-${String(existingCount + 1).padStart(3, "0")}`;

      const initialStatus = input.gateDecision || "baru_masuk";
      const isInternalGate = Boolean(input.gateDecision);
      const isInternalUser = ["spv", "manager", "admin", "superadmin"].includes(ctx.user.appRole);

      if (db) {
        try {
          let storedReference: { key: string; bytes: Buffer; contentType: string } | null = null;
          if (input.referenceFile) {
            const ext = input.referenceFile.fileName.split(".").pop()?.toLowerCase() ?? "";
            const bytes = Buffer.from(input.referenceFile.dataBase64, "base64");
            const safeName = input.referenceFile.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
            const contentType =
              ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
            const upload = await storagePut(
              `design-local/requests/${requestNo}/${Date.now()}_${safeName}`,
              bytes,
              contentType
            );
            storedReference = { key: upload.key, bytes, contentType };
          }

          let created: typeof requests.$inferSelect | undefined;
          await db.transaction(async (tx) => {
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
              designReuse: (input.designReuse as any) || null,
              requestedPriority: input.requestedPriority,
              finalPriority: input.requestedPriority,
              urgentReason: emptyToNull(input.urgentReason),
              deadline: input.deadline ? new Date(`${input.deadline}T00:00:00Z`) : null,
              referenceLink: emptyToNull(input.referenceLink),
              notes: emptyToNull(input.notes),
              status: initialStatus,
              gateDecision: input.gateDecision || null,
              gateReason: emptyToNull(input.gateReason),
              internalNotes: emptyToNull(input.internalNotes),
              reviewDecision: input.gateDecision || null,
              reviewReason: emptyToNull(input.gateReason),
              reviewedBy: isInternalGate && isInternalUser ? ctx.user.id : null,
              reviewedAt: isInternalGate && isInternalUser ? new Date() : null,
            });

            [created] = await tx
              .select()
              .from(requests)
              .where(eq(requests.requestNo, requestNo))
              .limit(1);

            if (storedReference && input.referenceFile && created) {
              await tx.insert(requestFiles).values({
                requestId: created.id,
                uploadedBy: ctx.user.id,
                fileName: input.referenceFile.fileName,
                storageKey: storedReference.key,
                contentType: storedReference.contentType,
                fileSize: storedReference.bytes.length,
              });
            }

            if (created) {
              await event(
                {
                  requestId: created.id,
                  actorUserId: ctx.user.id,
                  eventType: "request_created",
                  detail: `Permintaan ${requestNo} dibuat (${input.productType}) · Gerbang: ${input.gateDecision ? input.gateDecision.toUpperCase() : "Pending"}`,
                },
                tx
              );
            }
          });

          if (created) return created;
        } catch (e) {
          console.warn("[requests.create] DB insert failed, using demoStore fallback:", e);
        }
      }

      // In-memory demo store fallback
      const newRequest = {
        id: demoStore.requests.length + 1,
        requestNo,
        source: input.source,
        requesterName: input.requesterName?.trim() || ctx.user.name || "Peminta",
        requesterUserId: ctx.user.id,
        contact: input.contact || null,
        productType: input.productType,
        sizeSpec: input.sizeSpec || null,
        seriesCount: input.seriesCount,
        theme: input.theme || null,
        sourceReason: input.sourceReason || null,
        competitorReference: input.competitorReference || null,
        productionEstimate: input.productionEstimate || null,
        targetArea: input.targetArea || null,
        businessJustification: input.businessJustification || null,
        similarDesign: (input.similarDesign as any) || null,
        similarDesignRef: input.similarDesignRef || null,
        designReuse: (input.designReuse as any) || null,
        requestedPriority: input.requestedPriority,
        finalPriority: input.requestedPriority,
        urgentReason: input.urgentReason || null,
        deadline: input.deadline ? new Date(`${input.deadline}T00:00:00Z`) : null,
        referenceLink: input.referenceLink || null,
        notes: input.notes || null,
        status: initialStatus,
        gateDecision: input.gateDecision || null,
        gateReason: input.gateReason || null,
        internalNotes: input.internalNotes || null,
        reviewDecision: input.gateDecision || null,
        reviewReason: input.gateReason || null,
        reviewedBy: isInternalGate && isInternalUser ? ctx.user.id : null,
        reviewedAt: isInternalGate && isInternalUser ? new Date() : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      demoStore.requests.unshift(newRequest);
      await event({
        requestId: newRequest.id,
        actorUserId: ctx.user.id,
        eventType: "request_created",
        detail: `Permintaan ${requestNo} dibuat · Gerbang: ${input.gateDecision ? input.gateDecision.toUpperCase() : "Pending"}`,
      });
      return newRequest;
    }),

  review: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        decision: z.enum([
          "lanjut",
          "tunda",
          "tolak",
          "desain_existing",
          "diterima",
          "perlu_dilengkapi",
          "ditunda",
          "ditolak",
        ]),
        reason: z.string().max(2000).optional(),
        finalPriority: z.enum(["normal", "urgent"]).optional(),
        designReuse: z.enum(["reuse", "recolor", "new"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      roles("spv", "manager", "admin", "superadmin")(ctx.user.appRole);

      let mappedStatus = input.decision;
      if (mappedStatus === "diterima") mappedStatus = "lanjut";
      if (mappedStatus === "ditunda") mappedStatus = "tunda";
      if (mappedStatus === "ditolak") mappedStatus = "tolak";

      if (mappedStatus !== "lanjut" && !input.reason?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Alasan keputusan wajib dicatat jika selain Lanjut.",
        });
      }
      const db = await getDb();
      if (db) {
        try {
          const [request] = await db.select().from(requests).where(eq(requests.id, input.id)).limit(1);
          if (request) {
            await db.transaction(async (tx) => {
              await tx
                .update(requests)
                .set({
                  status: mappedStatus,
                  gateDecision: mappedStatus,
                  gateReason: emptyToNull(input.reason),
                  reviewDecision: mappedStatus,
                  reviewReason: emptyToNull(input.reason),
                  finalPriority: input.finalPriority ?? request.requestedPriority,
                  designReuse: input.designReuse ?? request.designReuse,
                  reviewedBy: ctx.user.id,
                  reviewedAt: new Date(),
                })
                .where(eq(requests.id, input.id));

              await event(
                {
                  requestId: input.id,
                  actorUserId: ctx.user.id,
                  eventType: "request_reviewed",
                  detail: `Gerbang Keputusan: ${mappedStatus.toUpperCase()}${input.reason ? `. Alasan: ${input.reason}` : ""}`,
                },
                tx
              );
            });
            return { success: true };
          }
        } catch (e) {
          console.warn("[requests.review] DB update failed, using demoStore fallback:", e);
        }
      }

      // In-memory demo store fallback
      const req = demoStore.requests.find((r) => r.id === input.id);
      if (req) {
        req.status = mappedStatus;
        req.gateDecision = mappedStatus;
        req.gateReason = input.reason || null;
        req.reviewDecision = mappedStatus;
        req.reviewReason = input.reason || null;
        req.finalPriority = input.finalPriority || req.requestedPriority;
        req.designReuse = input.designReuse || req.designReuse;
        req.reviewedBy = ctx.user.id;
        req.reviewedAt = new Date();
      }
      return { success: true };
    }),
});
