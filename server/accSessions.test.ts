import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { demoStore } from "./demoStore";

describe("Modul Sesi ACC Bulanan (acc_sessions)", () => {
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

  it("Mendapatkan daftar sesi ACC bulanan", async () => {
    const caller = appRouter.createCaller(superadminCtx);
    const sessions = await caller.workflow.accSessions.list();

    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);

    const first = sessions[0];
    expect(first).toHaveProperty("sessionNo");
    expect(first).toHaveProperty("presentationDate");
    expect(first).toHaveProperty("attendees");
    expect(Array.isArray(first.attendees)).toBe(true);
  });

  it("Validasi Nomor Sesi: Menolak nomor sesi yang tidak berformat ACC-YYYY-MM", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    await expect(
      caller.workflow.accSessions.create({
        sessionNo: "INVALID-SESSION",
        presentationDate: "2026-12-15",
        attendees: ["Pak Hendro (Owner)"],
        generalNotes: "Sesi tidak valid",
        status: "scheduled",
      })
    ).rejects.toThrow(/Format nomor sesi harus ACC-YYYY-MM/i);
  });

  it("Validasi Peserta: Menolak jika daftar peserta kosong", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    await expect(
      caller.workflow.accSessions.create({
        sessionNo: "ACC-2026-12",
        presentationDate: "2026-12-15",
        attendees: [],
        generalNotes: "Tanpa peserta",
        status: "scheduled",
      })
    ).rejects.toThrow(/Minimal 1 peserta/i);
  });

  it("Membuat Sesi ACC Bulanan baru dengan sukses", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    const res = await caller.workflow.accSessions.create({
      sessionNo: "ACC-2026-12",
      presentationDate: "2026-12-15",
      attendees: [
        "Pak Hendro (Owner)",
        "Budi Santoso (SPV)",
        "Eka Rahmawati (Marketing Lead)",
        "Cindy Permata (Senior Designer)",
      ],
      generalNotes: "Presentasi batch akhir tahun 2026 dan preview produk Q1 2027.",
      status: "scheduled",
    });

    expect(res.success).toBe(true);
    expect(res.sessionNo).toBe("ACC-2026-12");

    const created = demoStore.accSessions.find((s) => s.sessionNo === "ACC-2026-12")!;
    expect(created).toBeDefined();
    expect(created.attendees.length).toBe(4);
    expect(created.generalNotes).toContain("Presentasi batch akhir tahun");
  });

  it("Menolak pembuatan sesi dengan nomor sesi yang sudah ada (duplikat)", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    await expect(
      caller.workflow.accSessions.create({
        sessionNo: "ACC-2026-12",
        presentationDate: "2026-12-20",
        attendees: ["Pak Hendro (Owner)"],
        status: "scheduled",
      })
    ).rejects.toThrow(/sudah ada/i);
  });

  it("Melihat detail dan memperbarui status sesi ACC", async () => {
    const caller = appRouter.createCaller(superadminCtx);
    const targetSession = demoStore.accSessions.find((s) => s.sessionNo === "ACC-2026-12")!;

    const detail = await caller.workflow.accSessions.detail({ id: targetSession.id });
    expect(detail.sessionNo).toBe("ACC-2026-12");
    expect(detail.status).toBe("scheduled");

    const updateRes = await caller.workflow.accSessions.update({
      id: targetSession.id,
      status: "completed",
      generalNotes: "Sesi terlaksana dengan lancar, seluruh konsep Q1 2027 di-ACC.",
    });

    expect(updateRes.success).toBe(true);

    const updatedDetail = await caller.workflow.accSessions.detail({ id: targetSession.id });
    expect(updatedDetail.status).toBe("completed");
    expect(updatedDetail.generalNotes).toContain("seluruh konsep Q1 2027 di-ACC");
  });
});
