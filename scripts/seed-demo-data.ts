import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import {
  users,
  designerSlots,
  workflowSlaRules,
  requests,
  tickets,
  operationalIds,
  ticketFiles,
  approvals,
  qcReviews,
  jobUpdates,
  activityEvents,
} from "../drizzle/schema";
import {
  DEMO_USERS,
  DEMO_DESIGNER_SLOTS,
  DEMO_SLA_RULES,
  DEMO_REQUESTS,
  DEMO_TICKETS,
  DEMO_OPERATIONAL_IDS,
  DEMO_TICKET_FILES,
  DEMO_APPROVALS,
  DEMO_QC_REVIEWS,
  DEMO_JOB_UPDATES,
  DEMO_ACTIVITY_EVENTS,
} from "../server/mockData";

export async function seedDemoData(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    console.log("[Seed] DATABASE_URL tidak ditemukan. Melewati seeding ke database fisik.");
    return false;
  }

  const db = drizzle(url);
  try {
    console.log("[Seed] Memulai pengisian data demo ke database Drizzle ORM...");

    // 1. Users
    for (const user of DEMO_USERS) {
      await db
        .insert(users)
        .values(user)
        .onDuplicateKeyUpdate({
          set: {
            name: user.name,
            email: user.email,
            appRole: user.appRole,
            role: user.role,
          },
        });
    }
    console.log(`[Seed] ✓ ${DEMO_USERS.length} pengguna demo terisi.`);

    // 2. Designer Slots 1-8
    for (const slot of DEMO_DESIGNER_SLOTS) {
      await db
        .insert(designerSlots)
        .values(slot)
        .onDuplicateKeyUpdate({
          set: {
            displayName: slot.displayName,
            userId: slot.userId,
            isActive: slot.isActive,
          },
        });
    }
    console.log(`[Seed] ✓ ${DEMO_DESIGNER_SLOTS.length} slot Designer terisi.`);

    // 3. SLA Rules
    for (const rule of DEMO_SLA_RULES) {
      await db
        .insert(workflowSlaRules)
        .values(rule)
        .onDuplicateKeyUpdate({
          set: { maxHours: rule.maxHours },
        });
    }
    console.log(`[Seed] ✓ Aturan target SLA terisi.`);

    // 4. Design Requests
    for (const req of DEMO_REQUESTS) {
      await db
        .insert(requests)
        .values(req as any)
        .onDuplicateKeyUpdate({
          set: {
            status: req.status,
            gateDecision: (req as any).gateDecision || null,
            gateReason: (req as any).gateReason || null,
            internalNotes: (req as any).internalNotes || null,
            reviewDecision: req.reviewDecision,
            reviewReason: req.reviewReason,
          },
        });
    }
    console.log(`[Seed] ✓ ${DEMO_REQUESTS.length} permintaan desain terisi.`);

    // 5. Tickets
    for (const t of DEMO_TICKETS) {
      await db
        .insert(tickets)
        .values(t)
        .onDuplicateKeyUpdate({
          set: {
            processStatus: t.processStatus,
            jobStatus: t.jobStatus,
            jobNote: t.jobNote,
            closedAt: t.closedAt,
          },
        });
    }
    console.log(`[Seed] ✓ ${DEMO_TICKETS.length} tiket alur kerja terisi.`);

    // 6. Operational IDs
    for (const op of DEMO_OPERATIONAL_IDS) {
      await db
        .insert(operationalIds)
        .values(op)
        .onDuplicateKeyUpdate({
          set: {
            josdNo: op.josdNo,
            jodNo: op.jodNo,
            jodStatus: op.jodStatus,
            dgNo: op.dgNo,
            serverPath: op.serverPath,
          },
        });
    }
    console.log(`[Seed] ✓ Data nomor operasional JOS-D / JOD / DG terisi.`);

    // 7. Ticket Files
    for (const file of DEMO_TICKET_FILES) {
      const existing = await db
        .select()
        .from(ticketFiles)
        .where(eq(ticketFiles.id, file.id))
        .limit(1);
      if (!existing.length) {
        await db.insert(ticketFiles).values(file as any);
      }
    }

    // 8. Approvals
    for (const app of DEMO_APPROVALS) {
      const existing = await db
        .select()
        .from(approvals)
        .where(eq(approvals.id, app.id))
        .limit(1);
      if (!existing.length) {
        await db.insert(approvals).values(app);
      }
    }

    // 9. QC Reviews
    for (const qc of DEMO_QC_REVIEWS) {
      const existing = await db
        .select()
        .from(qcReviews)
        .where(eq(qcReviews.id, qc.id))
        .limit(1);
      if (!existing.length) {
        await db.insert(qcReviews).values(qc);
      }
    }

    // 10. Job Updates
    for (const ju of DEMO_JOB_UPDATES) {
      const existing = await db
        .select()
        .from(jobUpdates)
        .where(eq(jobUpdates.id, ju.id))
        .limit(1);
      if (!existing.length) {
        await db.insert(jobUpdates).values(ju);
      }
    }

    // 11. Activity Events
    for (const ev of DEMO_ACTIVITY_EVENTS) {
      const existing = await db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.id, ev.id))
        .limit(1);
      if (!existing.length) {
        await db.insert(activityEvents).values(ev);
      }
    }

    console.log("[Seed] Selesai! Data demo berhasil dimasukkan ke database.");
    return true;
  } catch (err) {
    console.error("[Seed] Gagal seeding ke database:", err);
    return false;
  } finally {
    await db.$client.end();
  }
}

// Direct execution
if (import.meta.url.endsWith(process.argv[1] || "")) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
