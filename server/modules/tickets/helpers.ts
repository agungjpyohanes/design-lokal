import { desc, eq } from "drizzle-orm";
import { designerSlots, requests, tickets } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { demoStore } from "../../demoStore";

export async function ticketRows(): Promise<Array<{ ticket: any; request: any; slot: any }>> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db
        .select({ ticket: tickets, request: requests, slot: designerSlots })
        .from(tickets)
        .innerJoin(requests, eq(tickets.requestId, requests.id))
        .innerJoin(designerSlots, eq(tickets.designerSlotId, designerSlots.id))
        .orderBy(desc(tickets.updatedAt))
        .limit(250);
      if (rows.length > 0) return rows as any;
    } catch (e) {
      console.warn("[ticketRows] DB query failed, using demoStore fallback:", e);
    }
  }

  return demoStore.getTicketRows() as any;
}

export function visibleRows<
  T extends { ticket: any; request: { requesterUserId: number | null }; slot: { userId: number | null; [key: string]: any } },
>(rows: T[], user: { id: number; appRole: string }): T[] {
  if (user.appRole === "designer") return rows.filter((row) => row.slot.userId === user.id);
  if (user.appRole === "marketing")
    return rows.filter((row) => row.request.requesterUserId === user.id);
  return rows;
}
