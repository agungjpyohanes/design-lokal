import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { appRoles, designerSlots, users, workflowSlaRules } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { demoStore } from "../../demoStore";
import { protectedProcedure, router } from "../../_core/trpc";
import { APP_ROLE_LABELS, PROCESS_LABELS, SLA_RULE_KEYS, SLA_RULE_LABELS } from "@shared/workflow";
import { emptyToNull, ensureAdmin, event, readSlaHours, roles } from "../common/helpers";

export async function ensureDesignerSlots() {
  const db = await getDb();
  if (db) {
    try {
      const existing = await db.select().from(designerSlots);
      const found = new Set(existing.map((slot) => slot.slotNumber));
      for (let n = 1; n <= 8; n++) {
        if (!found.has(n)) {
          const demoSlot = demoStore.designerSlots.find((s) => s.slotNumber === n);
          await db
            .insert(designerSlots)
            .values({
              slotNumber: n,
              label: `Designer ${n}`,
              displayName: demoSlot?.displayName || `Designer ${n}`,
              isActive: true,
            })
            .onDuplicateKeyUpdate({ set: { label: `Designer ${n}` } });
        }
      }
      return db.select().from(designerSlots).orderBy(designerSlots.slotNumber);
    } catch (e) {
      console.warn("[ensureDesignerSlots] DB failed, fallback to demoStore:", e);
    }
  }

  return demoStore.designerSlots;
}

export const settingsRouter = router({
  users: protectedProcedure.query(async ({ ctx }) => {
    ensureAdmin(ctx.user.appRole);
    const db = await getDb();
    if (db) {
      try {
        const rows = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            appRole: users.appRole,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(users.name);
        if (rows.length > 0) return rows;
      } catch (e) {
        console.warn("[settings.users] DB query failed, fallback to demoStore:", e);
      }
    }

    return demoStore.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      appRole: u.appRole,
      createdAt: u.createdAt,
    }));
  }),

  assignRole: protectedProcedure
    .input(z.object({ userId: z.number().int(), appRole: z.enum(appRoles) }))
    .mutation(async ({ ctx, input }) => {
      ensureAdmin(ctx.user.appRole);
      const db = await getDb();
      if (db) {
        try {
          await db.transaction(async (tx) => {
            await tx.update(users).set({ appRole: input.appRole }).where(eq(users.id, input.userId));
            await event(
              {
                actorUserId: ctx.user.id,
                eventType: "role_assigned",
                detail: `Role ${APP_ROLE_LABELS[input.appRole]} diberikan kepada user #${input.userId}.`,
              },
              tx
            );
          });
          return { success: true };
        } catch (e) {
          console.warn("[assignRole] DB failed, fallback to demoStore:", e);
        }
      }

      const target = demoStore.users.find((u) => u.id === input.userId);
      if (target) target.appRole = input.appRole;
      return { success: true };
    }),

  designerSlots: protectedProcedure.query(async ({ ctx }) => {
    roles("admin", "superadmin", "spv", "manager", "owner")(ctx.user.appRole);
    return ensureDesignerSlots();
  }),

  updateDesignerSlot: protectedProcedure
    .input(
      z.object({
        slotNumber: z.number().int().min(1).max(8),
        displayName: z.string().max(120).optional(),
        userId: z.number().int().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ensureAdmin(ctx.user.appRole);
      await ensureDesignerSlots();
      const db = await getDb();
      if (db) {
        try {
          const [slot] = await db
            .select()
            .from(designerSlots)
            .where(eq(designerSlots.slotNumber, input.slotNumber))
            .limit(1);

          if (slot) {
            await db.transaction(async (tx) => {
              await tx
                .update(designerSlots)
                .set({
                  displayName:
                    input.displayName !== undefined
                      ? emptyToNull(input.displayName)
                      : slot.displayName,
                  userId: input.userId !== undefined ? input.userId : slot.userId,
                  isActive: input.isActive ?? slot.isActive,
                })
                .where(eq(designerSlots.id, slot.id));

              await event(
                {
                  actorUserId: ctx.user.id,
                  eventType: "designer_slot_updated",
                  detail: `Konfigurasi ${slot.label} diperbarui.`,
                },
                tx
              );
            });
            return { success: true };
          }
        } catch (e) {
          console.warn("[updateDesignerSlot] DB failed, fallback to demoStore:", e);
        }
      }

      const slot = demoStore.designerSlots.find((s) => s.slotNumber === input.slotNumber);
      if (slot) {
        if (input.displayName !== undefined) slot.displayName = input.displayName || null;
        if (input.userId !== undefined) slot.userId = input.userId;
        if (input.isActive !== undefined) slot.isActive = input.isActive;
      }
      return { success: true };
    }),

  slaRules: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const hours = await readSlaHours(db);
    return SLA_RULE_KEYS.map((processStatus) => ({
      processStatus,
      label: SLA_RULE_LABELS[processStatus],
      maxHours: hours[processStatus],
    }));
  }),

  updateSlaRules: protectedProcedure
    .input(
      z
        .array(
          z.object({
            processStatus: z.enum(SLA_RULE_KEYS),
            maxHours: z.number().int().min(1).max(720),
          })
        )
        .length(SLA_RULE_KEYS.length)
    )
    .mutation(async ({ ctx, input }) => {
      ensureAdmin(ctx.user.appRole);
      const db = await getDb();
      if (db) {
        try {
          await db.transaction(async (tx) => {
            for (const rule of input) {
              const [existing] = await tx
                .select()
                .from(workflowSlaRules)
                .where(eq(workflowSlaRules.processStatus, rule.processStatus))
                .limit(1);

              if (existing) {
                await tx
                  .update(workflowSlaRules)
                  .set({ maxHours: rule.maxHours, updatedBy: ctx.user.id })
                  .where(eq(workflowSlaRules.processStatus, rule.processStatus));
              } else {
                await tx.insert(workflowSlaRules).values({
                  processStatus: rule.processStatus,
                  maxHours: rule.maxHours,
                  updatedBy: ctx.user.id,
                });
              }
            }
            await event(
              {
                actorUserId: ctx.user.id,
                eventType: "sla_rules_updated",
                detail: `${input.length} target SLA diperbarui.`,
              },
              tx
            );
          });
          return { success: true };
        } catch (e) {
          console.warn("[updateSlaRules] DB failed, fallback to demoStore:", e);
        }
      }

      for (const rule of input) {
        const item = demoStore.slaRules.find((r) => r.processStatus === rule.processStatus);
        if (item) item.maxHours = rule.maxHours;
      }
      return { success: true };
    }),

  processLabels: protectedProcedure.query(() => PROCESS_LABELS),
});
