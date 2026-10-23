import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("Otorisasi Server-Side: Tiket Detail & Update Status Pekerjaan", () => {
  // Setup contexts for different roles
  // Ticket 1: Slot 1 (assigned to Designer User 5), Request 1 (created by Marketing User 3)
  const assignedDesignerCtx = {
    user: {
      id: 5,
      openId: "demo-designer-1",
      name: "Rian Hidayat (Designer 1)",
      email: "rian.des1@desainlokal.internal",
      appRole: "designer" as const,
      isSuperAdmin: false,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const otherDesignerCtx = {
    user: {
      id: 6,
      openId: "demo-designer-2",
      name: "Siti Nurhaliza (Designer 2)",
      email: "siti.des2@desainlokal.internal",
      appRole: "designer" as const,
      isSuperAdmin: false,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const ownerMarketingCtx = {
    user: {
      id: 3,
      openId: "demo-marketing",
      name: "Dewi Lestari (Marketing)",
      email: "dewi.mkt@desainlokal.internal",
      appRole: "marketing" as const,
      isSuperAdmin: false,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const otherMarketingCtx = {
    user: {
      id: 99,
      openId: "demo-other-marketing",
      name: "Marketing Lain",
      email: "other.mkt@desainlokal.internal",
      appRole: "marketing" as const,
      isSuperAdmin: false,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const spvCtx = {
    user: {
      id: 2,
      openId: "demo-spv",
      name: "Bambang Suryo (SPV)",
      email: "bambang.spv@desainlokal.internal",
      appRole: "spv" as const,
      isSuperAdmin: false,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const superadminCtx = {
    user: {
      id: 1,
      openId: "demo-superadmin",
      name: "Ahmad Zaky (Superadmin)",
      email: "zaky.admin@desainlokal.internal",
      appRole: "superadmin" as const,
      isSuperAdmin: true,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const unassignedCtx = {
    user: {
      id: 88,
      openId: "demo-unassigned",
      name: "User Tanpa Akses",
      email: "unassigned@desainlokal.internal",
      appRole: "unassigned" as const,
      isSuperAdmin: false,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  describe("tickets.detail", () => {
    it("Positif: Designer yang ditugaskan dapat membaca detail tiket", async () => {
      const caller = appRouter.createCaller(assignedDesignerCtx);
      const detail = await caller.workflow.tickets.detail({ id: 1 });
      expect(detail).toBeDefined();
      expect(detail.id).toBe(1);
      expect(detail.designerSlot.userId).toBe(5);
    });

    it("Negatif: Designer lain ditolak (FORBIDDEN) saat membaca detail tiket bukan miliknya", async () => {
      const caller = appRouter.createCaller(otherDesignerCtx);
      await expect(caller.workflow.tickets.detail({ id: 1 })).rejects.toThrow(
        /tidak memiliki izin untuk mengakses tiket/i
      );
    });

    it("Positif: Marketing pemilik permintaan dapat membaca detail tiket", async () => {
      const caller = appRouter.createCaller(ownerMarketingCtx);
      const detail = await caller.workflow.tickets.detail({ id: 1 });
      expect(detail).toBeDefined();
      expect(detail.id).toBe(1);
      expect(detail.request.requesterUserId).toBe(3);
    });

    it("Negatif: Marketing lain ditolak (FORBIDDEN) saat membaca tiket yang bukan permintaannya", async () => {
      const caller = appRouter.createCaller(otherMarketingCtx);
      await expect(caller.workflow.tickets.detail({ id: 1 })).rejects.toThrow(
        /tidak memiliki izin untuk mengakses tiket/i
      );
    });

    it("Positif: SPV dapat membaca detail tiket apa pun", async () => {
      const caller = appRouter.createCaller(spvCtx);
      const detail = await caller.workflow.tickets.detail({ id: 1 });
      expect(detail).toBeDefined();
      expect(detail.id).toBe(1);
    });

    it("Positif: Superadmin dapat membaca detail tiket apa pun", async () => {
      const caller = appRouter.createCaller(superadminCtx);
      const detail = await caller.workflow.tickets.detail({ id: 1 });
      expect(detail).toBeDefined();
      expect(detail.id).toBe(1);
    });

    it("Negatif: User dengan role unassigned ditolak saat membaca detail tiket", async () => {
      const caller = appRouter.createCaller(unassignedCtx);
      await expect(caller.workflow.tickets.detail({ id: 1 })).rejects.toThrow();
    });

    it("Negatif: Tiket dengan ID yang tidak ada mengembalikan NOT_FOUND", async () => {
      const caller = appRouter.createCaller(superadminCtx);
      await expect(caller.workflow.tickets.detail({ id: 99999 })).rejects.toThrow(
        /Tiket tidak ditemukan/i
      );
    });
  });

  describe("tickets.updateJobStatus", () => {
    it("Positif: Designer yang ditugaskan dapat mengubah status pekerjaan", async () => {
      const caller = appRouter.createCaller(assignedDesignerCtx);
      const result = await caller.workflow.tickets.updateJobStatus({
        ticketId: 1,
        status: "Sedang dikerjakan",
        note: "Mulai mengerjakan revisi",
      });
      expect(result).toEqual({ success: true });
    });

    it("Negatif: Designer lain ditolak (FORBIDDEN) saat mencoba mengubah status tiket yang tidak ditugaskan kepadanya", async () => {
      const caller = appRouter.createCaller(otherDesignerCtx);
      await expect(
        caller.workflow.tickets.updateJobStatus({
          ticketId: 1,
          status: "Sedang dikerjakan",
          note: "Mencoba mengubah tiket orang lain",
        })
      ).rejects.toThrow(/tidak memiliki izin untuk memperbarui tiket yang tidak ditugaskan/i);
    });

    it("Negatif: Marketing ditolak saat mencoba mengubah status tiket", async () => {
      const caller = appRouter.createCaller(ownerMarketingCtx);
      await expect(
        caller.workflow.tickets.updateJobStatus({
          ticketId: 1,
          status: "Sedang dikerjakan",
        })
      ).rejects.toThrow(/Role Anda tidak memiliki akses untuk tindakan ini/i);
    });

    it("Positif: SPV dapat mengubah status pekerjaan tiket", async () => {
      const caller = appRouter.createCaller(spvCtx);
      const result = await caller.workflow.tickets.updateJobStatus({
        ticketId: 1,
        status: "Sedang dikerjakan",
        note: "Diupdate oleh SPV",
      });
      expect(result).toEqual({ success: true });
    });

    it("Negatif: Mencoba mengubah status tiket yang tidak ada menghasilkan NOT_FOUND", async () => {
      const caller = appRouter.createCaller(superadminCtx);
      await expect(
        caller.workflow.tickets.updateJobStatus({
          ticketId: 99999,
          status: "Sedang dikerjakan",
        })
      ).rejects.toThrow(/Tiket tidak ditemukan/i);
    });
  });

  describe("tickets.uploadFile", () => {
    const validPdfBase64 = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    ).toString("base64");
    const validPngBase64 = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]).toString("base64");
    const fakePdfBase64 = Buffer.from("NOT_A_REAL_PDF_CONTENT").toString("base64");

    it("Positif: Designer yang ditugaskan dapat mengunggah draft (update status ke review_spv)", async () => {
      const caller = appRouter.createCaller(assignedDesignerCtx);
      const res = await caller.workflow.tickets.uploadFile({
        ticketId: 1,
        fileName: "cover_draft.pdf",
        fileType: "draft",
        note: "Draft cover revisi",
        dataBase64: validPdfBase64,
      });
      expect(res.success).toBe(true);
      expect(res.nextProcess).toBe("review_spv");
    });

    it("Positif: Designer yang ditugaskan dapat mengunggah final (update status ke qc_spv)", async () => {
      const caller = appRouter.createCaller(assignedDesignerCtx);
      const res = await caller.workflow.tickets.uploadFile({
        ticketId: 1,
        fileName: "cover_final.png",
        fileType: "final",
        note: "Final cover siap QC",
        dataBase64: validPngBase64,
      });
      expect(res.success).toBe(true);
      expect(res.nextProcess).toBe("qc_spv");
    });

    it("Positif: Marketing pembuat permintaan dapat mengunggah berkas referensi", async () => {
      const caller = appRouter.createCaller(ownerMarketingCtx);
      const res = await caller.workflow.tickets.uploadFile({
        ticketId: 1,
        fileName: "referensi_warna.pdf",
        fileType: "referensi",
        note: "Referensi palet warna dari klien",
        dataBase64: validPdfBase64,
      });
      expect(res.success).toBe(true);
    });

    it("Negatif: Marketing ditolak (FORBIDDEN) saat mencoba mengunggah draft atau final", async () => {
      const caller = appRouter.createCaller(ownerMarketingCtx);
      await expect(
        caller.workflow.tickets.uploadFile({
          ticketId: 1,
          fileName: "marketing_draft.pdf",
          fileType: "draft",
          dataBase64: validPdfBase64,
        })
      ).rejects.toThrow(/Hanya desainer yang ditugaskan/i);
    });

    it("Negatif: Designer lain ditolak (FORBIDDEN) saat mencoba mengunggah ke tiket yang bukan miliknya", async () => {
      const caller = appRouter.createCaller(otherDesignerCtx);
      await expect(
        caller.workflow.tickets.uploadFile({
          ticketId: 1,
          fileName: "other_designer.pdf",
          fileType: "draft",
          dataBase64: validPdfBase64,
        })
      ).rejects.toThrow(/Hanya desainer yang ditugaskan/i);
    });

    it("Negatif: Marketing lain ditolak (FORBIDDEN) saat mengunggah referensi ke tiket orang lain", async () => {
      const caller = appRouter.createCaller(otherMarketingCtx);
      await expect(
        caller.workflow.tickets.uploadFile({
          ticketId: 1,
          fileName: "other_ref.pdf",
          fileType: "referensi",
          dataBase64: validPdfBase64,
        })
      ).rejects.toThrow(/tidak memiliki izin untuk mengunggah berkas referensi/i);
    });

    it("Negatif: Format Base64 yang cacat ditolak dengan BAD_REQUEST", async () => {
      const caller = appRouter.createCaller(assignedDesignerCtx);
      await expect(
        caller.workflow.tickets.uploadFile({
          ticketId: 1,
          fileName: "invalid.pdf",
          fileType: "draft",
          dataBase64: "NOT_VALID_BASE_64!@#$%",
        })
      ).rejects.toThrow(/Format data Base64 tidak valid/i);
    });

    it("Negatif: Berkas dengan ekstensi tidak diizinkan (.exe) ditolak dengan BAD_REQUEST", async () => {
      const caller = appRouter.createCaller(assignedDesignerCtx);
      await expect(
        caller.workflow.tickets.uploadFile({
          ticketId: 1,
          fileName: "malicious.exe",
          fileType: "draft",
          dataBase64: validPdfBase64,
        })
      ).rejects.toThrow(/Ekstensi berkas .exe tidak diizinkan/i);
    });

    it("Negatif: Magic bytes tidak cocok (nama .pdf tetapi isi teks biasa) ditolak dengan BAD_REQUEST", async () => {
      const caller = appRouter.createCaller(assignedDesignerCtx);
      await expect(
        caller.workflow.tickets.uploadFile({
          ticketId: 1,
          fileName: "corrupt.pdf",
          fileType: "draft",
          dataBase64: fakePdfBase64,
        })
      ).rejects.toThrow(/Isi berkas tidak valid untuk format PDF/i);
    });

    it("Negatif: Berkas melebihi ukuran maksimum 8 MB ditolak dengan BAD_REQUEST", async () => {
      const caller = appRouter.createCaller(assignedDesignerCtx);
      // Buat payload > 8 MB (8.5 MB)
      const bigBuffer = Buffer.alloc(8.5 * 1024 * 1024, 0x25); // %PDF-..
      bigBuffer.write("%PDF-1.4\n", 0);
      const bigBase64 = bigBuffer.toString("base64");

      await expect(
        caller.workflow.tickets.uploadFile({
          ticketId: 1,
          fileName: "huge.pdf",
          fileType: "draft",
          dataBase64: bigBase64,
        })
      ).rejects.toThrow(/melebihi batas maksimum 8 MB/i);
    });
  });

  describe("tickets.registerServerUpload", () => {
    it("Negatif: Gerbang QC menolak tiket yang belum lolos seluruh QC (status 'qc_spv')", async () => {
      const caller = appRouter.createCaller(superadminCtx);
      // Tiket 7 berstatus 'qc_spv' (belum lolos QC)
      await expect(
        caller.workflow.tickets.registerServerUpload({
          ticketId: 7,
          serverPath: "\\\\192.168.0.24\\Desain_Produksi\\2026\\Test",
        })
      ).rejects.toThrow(/Gerbang Upload Server Produksi .* TERKUNCI/i);
    });

    it("Negatif: Designer yang tidak ditugaskan ditolak (FORBIDDEN)", async () => {
      const caller = appRouter.createCaller(assignedDesignerCtx); // Designer 5 bukan pemilik slot Tiket 2 (dimiliki Designer 6)
      // Tiket 2 berstatus 'siap_upload', tetapi ditugaskan ke Designer 6 (Siti), bukan Designer 5 (Rian)
      await expect(
        caller.workflow.tickets.registerServerUpload({
          ticketId: 2,
          serverPath: "\\\\192.168.0.24\\Desain_Produksi\\2026\\Test",
        })
      ).rejects.toThrow(/Desainer hanya dapat mencatat upload server untuk tiket yang ditugaskan/i);
    });

    it("Negatif: Marketing ditolak (FORBIDDEN) karena di luar cakupan role", async () => {
      const caller = appRouter.createCaller(ownerMarketingCtx);
      await expect(
        caller.workflow.tickets.registerServerUpload({
          ticketId: 2,
          serverPath: "\\\\192.168.0.24\\Desain_Produksi\\2026\\Test",
        })
      ).rejects.toThrow(/Role Anda tidak memiliki akses untuk tindakan ini/i);
    });

    it("Positif: Designer yang ditugaskan dapat mencatat upload server pada tiket yang memenuhi gerbang", async () => {
      const caller = appRouter.createCaller(otherDesignerCtx); // Designer 6 adalah desainer yang ditugaskan pada Tiket 2
      // Tiket 2 berstatus 'siap_upload' (lolos gerbang) dan ditugaskan ke Designer 6
      const res = await caller.workflow.tickets.registerServerUpload({
        ticketId: 2,
        serverPath: "\\\\192.168.0.24\\Desain_Produksi\\2026\\Box_Hampers\\Lebaran",
      });
      expect(res.success).toBe(true);
    });

    it("Positif: SPV dapat mencatat upload server pada tiket yang memenuhi gerbang", async () => {
      const caller = appRouter.createCaller(spvCtx);
      // Tiket 2 berstatus 'uploaded' sekarang (lolos gerbang)
      const res = await caller.workflow.tickets.registerServerUpload({
        ticketId: 2,
        serverPath: "\\\\192.168.0.24\\Desain_Produksi\\2026\\Box_Hampers\\Lebaran_SPV",
      });
      expect(res.success).toBe(true);
    });
  });
});
