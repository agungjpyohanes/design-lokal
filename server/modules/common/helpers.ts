import { TRPCError } from "@trpc/server";
import { activityEvents, workflowSlaRules } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { PROCESS_SLA_HOURS, SLA_DEFAULT_HOURS } from "@shared/workflow";
import { demoStore } from "../../demoStore";

export const emptyToNull = (value?: string | null) => (value?.trim() ? value.trim() : null);

export const roles = (...allowed: string[]) => (role: string) => {
  // Superadmin has universal access to all actions in demo/bypass mode
  if (role === "superadmin") return;
  if (!allowed.includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Role Anda tidak memiliki akses untuk tindakan ini.",
    });
  }
};

export const ensureAdmin = (role: string) => roles("superadmin")(role);

export function canReadTicket(role: string) {
  roles(
    "admin",
    "superadmin",
    "owner",
    "manager",
    "spv",
    "designer",
    "mpp",
    "qc1",
    "qc2",
    "marketing"
  )(role);
}

export async function database() {
  const db = await getDb();
  return db;
}

export async function event(
  input: {
    ticketId?: number | null;
    requestId?: number | null;
    actorUserId: number;
    eventType: string;
    detail?: string;
  },
  executor?: any
) {
  const db = executor ?? (await database());
  if (db) {
    try {
      await db.insert(activityEvents).values({
        ticketId: input.ticketId ?? null,
        requestId: input.requestId ?? null,
        actorUserId: input.actorUserId,
        eventType: input.eventType,
        detail: input.detail ?? null,
      });
      return;
    } catch (e) {
      console.warn("[Event] Insert to DB failed, fallback to demoStore:", e);
    }
  }

  demoStore.activityEvents.unshift({
    id: demoStore.activityEvents.length + 1,
    ticketId: (input.ticketId ?? null) as any,
    requestId: (input.requestId ?? null) as any,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    detail: (input.detail ?? null) as any,
    createdAt: new Date(),
  } as any);
}

export async function readSlaHours(db: Awaited<ReturnType<typeof getDb>>) {
  if (db) {
    try {
      const overrides = await db.select().from(workflowSlaRules);
      if (overrides.length > 0) {
        return {
          ...SLA_DEFAULT_HOURS,
          ...Object.fromEntries(overrides.map((rule) => [rule.processStatus, rule.maxHours])),
        } as Record<string, number>;
      }
    } catch {
      // Fallback
    }
  }

  return {
    ...SLA_DEFAULT_HOURS,
    ...Object.fromEntries(demoStore.slaRules.map((rule) => [rule.processStatus, rule.maxHours])),
  } as Record<string, number>;
}

export function ticketIsOverdue(
  ticket: { processStatus: string; processUpdatedAt: Date; deadline: Date | null },
  now = new Date(),
  slaHours: Record<string, number> = PROCESS_SLA_HOURS
) {
  const stageHours = slaHours[ticket.processStatus];
  const stageDue = stageHours
    ? new Date(ticket.processUpdatedAt).getTime() + stageHours * 60 * 60 * 1000
    : null;
  let deadlineDue: number | null = null;
  if (ticket.deadline) {
    const deadline = new Date(ticket.deadline);
    deadline.setHours(23, 59, 59, 999);
    deadlineDue = deadline.getTime();
  }
  const due = stageDue && deadlineDue ? Math.min(stageDue, deadlineDue) : stageDue ?? deadlineDue;
  return due !== null && due < now.getTime();
}
