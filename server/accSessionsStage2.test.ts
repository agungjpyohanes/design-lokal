import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { demoStore } from "./demoStore";

describe("Tahap 2: Baris Keputusan Sesi ACC (acc_session_items) & Sinkronisasi Tiket", () => {
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

  it("availableTickets: Mengambil tiket aktif beserta versi berkas terakhir", async () => {
    const caller = appRouter.createCaller(superadminCtx);
    const available = await caller.workflow.accSessions.availableTickets();

    expect(Array.isArray(available)).toBe(true);
    expect(available.length).toBeGreaterThan(0);

    const first = available[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("ticketNo");
    expect(first).toHaveProperty("productType");
    expect(first).toHaveProperty("latestVersion");
  });

  it("Validasi Catatan: Menolak keputusan Revisi atau Tolak jika catatan kosong", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Mencoba memberikan keputusan revisi tanpa catatan harus ditolak
    await expect(
      caller.workflow.accSessions.addItem({
        sessionId: 2,
        ticketId: 6,
        decision: "revisi",
        notes: "",
      })
    ).rejects.toThrow(/Wajib mengisi catatan\/alasan/i);

    // Mencoba memberikan keputusan tolak tanpa catatan harus ditolak
    await expect(
      caller.workflow.accSessions.addItem({
        sessionId: 2,
        ticketId: 6,
        decision: "tolak",
        notes: "   ",
      })
    ).rejects.toThrow(/Wajib mengisi catatan\/alasan/i);
  });

  it("Keputusan ACC: Menambahkan item dan otomatis memajukan tiket ke menunggu_josd", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Tiket 4 awalnya menunggu_acc_owner
    const ticket4 = demoStore.tickets.find((t) => t.id === 4)!;
    expect(ticket4.processStatus).toBe("menunggu_acc_owner");

    const res = await caller.workflow.accSessions.addItem({
      sessionId: 2,
      ticketId: 4,
      fileVersion: "v1",
      decision: "acc",
      notes: "ACC tanpa perubahan oleh Pak Hendro.",
    });

    expect(res.success).toBe(true);
    expect(res.nextProcess).toBe("menunggu_josd");

    // Verifikasi sinkronisasi otomatis status tiket
    expect(ticket4.processStatus).toBe("menunggu_josd");
    expect(ticket4.jobStatus).toBe("Sedang dikerjakan");

    // Verifikasi audit approvals
    const approval = demoStore.approvals.find((a) => a.ticketId === 4 && a.stage === "owner")!;
    expect(approval).toBeDefined();
    expect(approval.decision).toBe("acc");
  });

  it("Keputusan Revisi: Mengembalikan tiket ke revisi_owner dan Job Status 'Revisi dikerjakan'", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    const ticket6 = demoStore.tickets.find((t) => t.id === 6)!;

    const res = await caller.workflow.accSessions.addItem({
      sessionId: 2,
      ticketId: 6,
      fileVersion: "v1",
      decision: "revisi",
      notes: "Ubah ukuran tali pita menjadi 2cm dan perbaiki warna hijau.",
    });

    expect(res.success).toBe(true);
    expect(res.nextProcess).toBe("revisi_owner");

    // Verifikasi sinkronisasi status tiket
    expect(ticket6.processStatus).toBe("revisi_owner");
    expect(ticket6.jobStatus).toBe("Revisi dikerjakan");
  });

  it("Keputusan Tolak: Mengubah tiket ke ditolak_owner dan Job Status 'Terhambat'", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    const res = await caller.workflow.accSessions.addItem({
      sessionId: 2,
      ticketId: 5,
      fileVersion: "v2",
      decision: "tolak",
      notes: "Desain dibatalkan karena kuota anggaran Q4 dialihkan.",
    });

    expect(res.success).toBe(true);
    expect(res.nextProcess).toBe("ditolak_owner");

    const ticket5 = demoStore.tickets.find((t) => t.id === 5)!;
    expect(ticket5.processStatus).toBe("ditolak_owner");
    expect(ticket5.jobStatus).toBe("Terhambat");
  });

  it("updateItemDecision: Memperbarui keputusan baris item dan menyinkronkan status tiket", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Cari item yang tadi ditambahkan untuk tiket 5
    const item = demoStore.accSessionItems.find((it) => it.ticketId === 5 && it.sessionId === 2)!;
    expect(item).toBeDefined();

    // Owner meralat keputusan: dari Tolak menjadi ACC + Catatan
    const res = await caller.workflow.accSessions.updateItemDecision({
      itemId: item.id,
      decision: "acc_catatan",
      notes: "Diputuskan untuk tetap diproduksi dengan revisi minimum budget.",
    });

    expect(res.success).toBe(true);
    expect(res.nextProcess).toBe("menunggu_josd");

    const ticket5 = demoStore.tickets.find((t) => t.id === 5)!;
    expect(ticket5.processStatus).toBe("menunggu_josd");
    expect(item.decision).toBe("acc_catatan");
  });

  it("removeItem: Menghapus baris item dari sesi ACC", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    const item = demoStore.accSessionItems.find((it) => it.ticketId === 6 && it.sessionId === 2)!;
    expect(item).toBeDefined();

    const res = await caller.workflow.accSessions.removeItem({ itemId: item.id });
    expect(res.success).toBe(true);

    const removed = demoStore.accSessionItems.find((it) => it.id === item.id);
    expect(removed).toBeUndefined();
  });
});
