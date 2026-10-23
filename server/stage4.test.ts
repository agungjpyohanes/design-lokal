import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { QC_ITEMS } from "../shared/modules/qc/constants";
import { demoStore } from "./demoStore";

describe("Tahap 4: Quality Control Berurutan, Gerbang Server, dan Penutupan Tiket", () => {
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

  it("Aturan Gerbang Ketat QC: QC1 terkunci jika belum lolos QC SPV", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Tiket 7 saat ini berstatus 'qc_spv'
    const ticket7 = demoStore.tickets.find((t) => t.id === 7)!;
    expect(ticket7.processStatus).toBe("qc_spv");

    // Mencoba langsung melakukan QC1 pada Tiket 7 harus ditolak karena belum melewati QC SPV
    const items = QC_ITEMS.map((_, i) => ({ id: i + 1, passed: true }));
    await expect(
      caller.workflow.tickets.submitQc({
        ticketId: 7,
        stage: "qc1",
        result: "lolos",
        items,
        summary: "Mencoba bypass ke QC1",
      })
    ).rejects.toThrow(/TERKUNCI/i);
  });

  it("QC Revisi: Wajib menyertakan catatan kegagalan dan mengembalikan tiket ke revisi_qc", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Menjalankan QC SPV pada Tiket 7 dengan hasil revisi tanpa catatan harus ditolak
    const failedItemsNoNotes = QC_ITEMS.map((_, i) => ({
      id: i + 1,
      passed: i !== 2, // item 3 tidak lolos
    }));

    await expect(
      caller.workflow.tickets.submitQc({
        ticketId: 7,
        stage: "spv",
        result: "revisi",
        items: failedItemsNoNotes,
      })
    ).rejects.toThrow(/Wajib mengisi catatan kegagalan/i);

    // Menjalankan QC SPV dengan catatan kegagalan harus berhasil mengubah tiket ke revisi_qc
    const failedItemsWithNotes = QC_ITEMS.map((_, i) => ({
      id: i + 1,
      passed: i !== 2,
      note: i === 2 ? "Bleed belum diset 3mm" : undefined,
    }));

    const res = await caller.workflow.tickets.submitQc({
      ticketId: 7,
      stage: "spv",
      result: "revisi",
      items: failedItemsWithNotes,
      summary: "Perbaiki bleed dan margin pisau pond.",
    });

    expect(res.success).toBe(true);
    expect(res.next).toBe("revisi_qc");

    const t7Updated = demoStore.tickets.find((t) => t.id === 7)!;
    expect(t7Updated.processStatus).toBe("revisi_qc");
    expect(t7Updated.jobStatus).toBe("Revisi dikerjakan");
  });

  it("Gerbang Upload Server Produksi (192.168.0.24): Terkunci jika QC2 belum Lolos", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Tiket 3 saat ini berstatus 'qc1' (belum melewati QC2)
    const ticket3 = demoStore.tickets.find((t) => t.id === 3)!;
    expect(ticket3.processStatus).toBe("qc1");

    await expect(
      caller.workflow.tickets.registerServerUpload({
        ticketId: 3,
        serverPath: "\\\\192.168.0.24\\Desain_Produksi\\2026\\Binder_B5",
      })
    ).rejects.toThrow(/TERKUNCI/i);
  });

  it("Gerbang Upload Server Produksi (192.168.0.24): Terbuka setelah QC2 Lolos", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Tiket 2 berstatus 'siap_upload' (QC2 sudah Lolos)
    const ticket2 = demoStore.tickets.find((t) => t.id === 2)!;
    expect(ticket2.processStatus).toBe("siap_upload");

    const res = await caller.workflow.tickets.registerServerUpload({
      ticketId: 2,
      serverPath: "\\\\192.168.0.24\\Desain_Produksi\\2026\\Hampers_IdulFitri",
    });

    expect(res.success).toBe(true);
    const op2 = demoStore.operationalIds.find((o) => o.ticketId === 2)!;
    expect(op2.serverPath).toBe("\\\\192.168.0.24\\Desain_Produksi\\2026\\Hampers_IdulFitri");
    expect(ticket2.processStatus).toBe("uploaded");
  });

  it("Validasi Penutupan Tiket: Menolak jika berkas belum lengkap", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Tiket 5 berstatus 'revisi', belum QC dan belum serverPath
    await expect(
      caller.workflow.tickets.close({
        ticketId: 5,
        jodClosed: true,
      })
    ).rejects.toThrow(/Gagal menutup tiket/i);
  });

  it("Penutupan Tiket Sukses: Menutup JOD dan mengarsipkan tiket jika berkas lengkap", async () => {
    const caller = appRouter.createCaller(superadminCtx);

    // Tiket 9: sudah uploaded, ada JOD, ada serverPath
    const ticket9 = demoStore.tickets.find((t) => t.id === 9)!;
    expect(ticket9.processStatus).toBe("uploaded");

    const res = await caller.workflow.tickets.close({
      ticketId: 9,
      jodClosed: true,
    });

    expect(res.success).toBe(true);
    expect(ticket9.processStatus).toBe("closed");
    expect(ticket9.jobStatus).toBe("Selesai");

    const op9 = demoStore.operationalIds.find((o) => o.ticketId === 9)!;
    expect(op9.jodStatus).toBe("closed");
  });
});
