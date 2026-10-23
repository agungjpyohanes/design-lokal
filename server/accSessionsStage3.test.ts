import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { demoStore } from "./demoStore";

describe("Tahap 3: Pengetatan Gerbang JOS-D Berbasis Sesi ACC & Rekapitulasi Laporan", () => {
  const superadminCtx = {
    user: {
      id: 1,
      openId: "demo-superadmin",
      name: "Budi Santoso",
      email: "budi.superadmin@desainlokal.internal",
      appRole: "superadmin" as const,
      isSuperAdmin: true,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  it("Pengetatan Gerbang JOS-D: Menolak penerbitan JOS-D jika tiket belum tercatat ACC di Sesi Bulanan", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Tiket 6 berstatus 'revisi_owner', belum pernah di-ACC di Sesi ACC bulanan
    // Mencoba menerbitkan nomor JOS-D tanpa mode darurat harus ditolak
    await expect(
      caller.workflow.tickets.requestJosd({
        ticketId: 6,
      })
    ).rejects.toThrow(/Gerbang JOS-D TERKUNCI/i);
  });

  it("Pengecualian Darurat: Menolak jika alasan darurat kosong", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    await expect(
      caller.workflow.tickets.requestJosd({
        ticketId: 6,
        isEmergencyOutOfSession: true,
        emergencyReason: "",
      })
    ).rejects.toThrow(/Gerbang JOS-D TERKUNCI/i);
  });

  it("Pengecualian Darurat: Berhasil menerbitkan JOS-D jika alasan darurat diisi dan mencatat ke audit log", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    const res = await caller.workflow.tickets.requestJosd({
      ticketId: 6,
      isEmergencyOutOfSession: true,
      emergencyReason: "Pesanan VIP mendesak, Owner telah memberikan persetujuan via telepon.",
    });

    expect(res.success).toBe(true);
    expect(res.josdNo).toMatch(/^JOSD-\d{4}-\d{3}$/);
    expect(res.next).toBe("menunggu_jod");

    // Verifikasi audit log aktivitas darurat
    const audit = demoStore.activityEvents.find(
      (e) => e.ticketId === 6 && e.eventType === "emergency_acc_josd"
    );
    expect(audit).toBeDefined();
    expect(audit?.detail).toContain("Pesanan VIP mendesak");
  });

  it("Gerbang JOS-D Normal: Berhasil langsung menerbitkan JOS-D untuk tiket yang sudah disahkan di Sesi ACC", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Tiket 5 telah tercatat di Sesi ACC 2 dengan keputusan 'acc_catatan'
    const res = await caller.workflow.tickets.requestJosd({
      ticketId: 5,
    });

    expect(res.success).toBe(true);
    expect(res.josdNo).toMatch(/^JOSD-\d{4}-\d{3}$/);
    expect(res.next).toBe("menunggu_jod");

    const t5 = demoStore.tickets.find((t) => t.id === 5)!;
    expect(t5.processStatus).toBe("menunggu_jod");
  });

  it("Rekapitulasi Laporan Sesi ACC: Data detail sesi menyajikan perhitungan akurat", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Sesi 1: ACC-2026-09
    const session1 = await caller.workflow.accSessions.detail({ id: 1 });
    expect(session1.items).toBeDefined();
    expect(session1.items.length).toBeGreaterThanOrEqual(2);

    const accCount = session1.items.filter((i) => i.decision === "acc").length;
    const accCatatanCount = session1.items.filter((i) => i.decision === "acc_catatan").length;
    const totalCount = session1.items.length;

    expect(totalCount).toBe(accCount + accCatatanCount);
    expect(session1.sessionNo).toBe("ACC-2026-09");
  });
});
