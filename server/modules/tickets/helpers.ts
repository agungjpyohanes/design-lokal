import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { designerSlots, requests, tickets } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { demoStore } from "../../demoStore";
import { canSeeAllTickets } from "@shared/modules/auth/roles";
import { roles } from "../common/helpers";

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

/**
 * Checks whether a user has permission to access a specific ticket resource.
 * - superadmin: universal access
 * - designer: only tickets on slots assigned to this designer (slot.userId === user.id)
 * - marketing: only tickets with requests created by this user (request.requesterUserId === user.id)
 * - unassigned: no access
 * - other roles (admin, spv, manager, owner, mpp, qc1, qc2): access allowed per canSeeAllTickets
 */
export function canAccessTicketResource(
  user: { id: number; appRole: string },
  resource: {
    request?: { requesterUserId: number | null } | null;
    slot?: { userId: number | null; [key: string]: any } | null;
  }
): boolean {
  if (user.appRole === "superadmin") return true;
  if (user.appRole === "designer") {
    return resource.slot?.userId === user.id;
  }
  if (user.appRole === "marketing") {
    return resource.request?.requesterUserId === user.id;
  }
  if (user.appRole === "unassigned") {
    return false;
  }
  return canSeeAllTickets(user.appRole);
}

/**
 * Throws TRPCError FORBIDDEN if user is not authorized to access the ticket.
 */
export function assertCanAccessTicket(
  user: { id: number; appRole: string },
  resource: {
    request?: { requesterUserId: number | null } | null;
    slot?: { userId: number | null; [key: string]: any } | null;
  }
) {
  if (!canAccessTicketResource(user, resource)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Anda tidak memiliki izin untuk mengakses tiket ini.",
    });
  }
}

/**
 * Validates permission for updating ticket job status:
 * - Role must be designer, spv, admin, or superadmin.
 * - If designer, the designer MUST be assigned to the ticket's slot (slot.userId === user.id).
 * - Other authorized roles (spv, admin, superadmin) can update any ticket.
 */
export function assertCanUpdateJobStatus(
  user: { id: number; appRole: string },
  slot?: { userId: number | null; [key: string]: any } | null
) {
  roles("designer", "spv", "admin", "superadmin")(user.appRole);
  if (user.appRole === "designer") {
    if (!slot || slot.userId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Anda tidak memiliki izin untuk memperbarui tiket yang tidak ditugaskan kepada Anda.",
      });
    }
  }
}

/**
 * Validates upload permissions per role, resource assignment, and fileType:
 * - SPV, Admin, Superadmin: can upload draft, final, and referensi on any ticket.
 * - Designer: can ONLY upload to tickets where slot.userId === user.id.
 *   - Can upload draft, final, and referensi on their assigned ticket.
 * - Marketing: can ONLY upload referensi to tickets where request.requesterUserId === user.id.
 *   - Cannot upload draft or final.
 * - Other roles or unassigned / unassociated users: rejected with FORBIDDEN.
 */
export function assertCanUploadTicketFile(
  user: { id: number; appRole: string },
  resource: {
    request?: { requesterUserId: number | null } | null;
    slot?: { userId: number | null; [key: string]: any } | null;
  },
  fileType: "draft" | "final" | "referensi"
) {
  if (user.appRole === "superadmin" || user.appRole === "admin" || user.appRole === "spv") {
    return;
  }

  if (fileType === "draft" || fileType === "final") {
    if (user.appRole !== "designer" || resource.slot?.userId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Hanya desainer yang ditugaskan (atau SPV/Admin) yang dapat mengunggah draft atau berkas final.",
      });
    }
    return;
  }

  if (fileType === "referensi") {
    if (user.appRole === "designer" && resource.slot?.userId === user.id) {
      return;
    }
    if (user.appRole === "marketing" && resource.request?.requesterUserId === user.id) {
      return;
    }
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Anda tidak memiliki izin untuk mengunggah berkas referensi pada tiket ini.",
    });
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Role Anda tidak memiliki izin untuk mengunggah berkas pada tiket ini.",
  });
}

/**
 * Validates permission for registering server upload path:
 * - Allowed roles: admin, spv, superadmin, designer, qc1, qc2.
 * - If designer, the designer MUST be assigned to the ticket's slot (slot.userId === user.id).
 */
export function assertCanRegisterServerUpload(
  user: { id: number; appRole: string },
  resource: {
    slot?: { userId: number | null; [key: string]: any } | null;
  }
) {
  roles("admin", "spv", "superadmin", "designer", "qc1", "qc2")(user.appRole);
  if (user.appRole === "designer") {
    if (!resource.slot || resource.slot.userId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Desainer hanya dapat mencatat upload server untuk tiket yang ditugaskan kepadanya.",
      });
    }
  }
}

export const MAX_UPLOAD_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "ai",
  "psd",
  "eps",
  "tif",
  "tiff",
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export function validateBase64Payload(dataBase64: string): Buffer {
  if (!dataBase64 || typeof dataBase64 !== "string") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Data berkas Base64 tidak boleh kosong.",
    });
  }

  // Strip data URL prefix if present (e.g. "data:image/png;base64,")
  const cleanBase64 = dataBase64.replace(/^data:[^;]+;base64,/, "").trim();

  // Validate Base64 characters and padding
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!cleanBase64 || cleanBase64.length % 4 !== 0 || !base64Regex.test(cleanBase64)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Format data Base64 tidak valid.",
    });
  }

  const buffer = Buffer.from(cleanBase64, "base64");

  if (buffer.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Berkas yang diunggah tidak boleh kosong (0 bytes).",
    });
  }

  if (buffer.length > MAX_UPLOAD_FILE_SIZE) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Ukuran berkas melebihi batas maksimum 8 MB (terdeteksi: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
    });
  }

  return buffer;
}

export function detectAndValidateFile(
  fileName: string,
  buffer: Buffer
): { extension: string; canonicalContentType: string } {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === fileName.length - 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Nama berkas harus memiliki ekstensi yang valid (misal: .pdf, .png, .jpg).",
    });
  }

  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Ekstensi berkas .${ext} tidak diizinkan. Format yang didukung: ${ALLOWED_EXTENSIONS.join(", ").toUpperCase()}.`,
    });
  }

  let canonicalContentType = "application/octet-stream";

  if (ext === "pdf") {
    // %PDF- (0x25 0x50 0x44 0x46)
    if (buffer.length < 4 || buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Isi berkas tidak valid untuk format PDF.",
      });
    }
    canonicalContentType = "application/pdf";
  } else if (ext === "png") {
    // \x89PNG (0x89 0x50 0x4E 0x47)
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x89 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x4e ||
      buffer[3] !== 0x47
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Isi berkas tidak valid untuk format PNG.",
      });
    }
    canonicalContentType = "image/png";
  } else if (ext === "jpg" || ext === "jpeg") {
    // 0xFF 0xD8 0xFF
    if (
      buffer.length < 3 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[2] !== 0xff
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Isi berkas tidak valid untuk format JPEG/JPG.",
      });
    }
    canonicalContentType = "image/jpeg";
  } else if (ext === "psd") {
    // 8BPS (0x38 0x42 0x50 0x53)
    if (buffer.length < 4 || buffer.subarray(0, 4).toString("ascii") !== "8BPS") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Isi berkas tidak valid untuk format Photoshop (PSD).",
      });
    }
    canonicalContentType = "image/vnd.adobe.photoshop";
  } else if (ext === "tif" || ext === "tiff") {
    // Little-endian II*\0 (49 49 2A 00) or Big-endian MM\0* (4D 4D 00 2A)
    const isLe = buffer.length >= 4 && buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
    const isBe = buffer.length >= 4 && buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
    if (!isLe && !isBe) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Isi berkas tidak valid untuk format TIFF.",
      });
    }
    canonicalContentType = "image/tiff";
  } else if (ext === "eps") {
    // Binary EPS (C5 D0 D3 C6) or ASCII PostScript (%!PS)
    const isBinEps = buffer.length >= 4 && buffer[0] === 0xc5 && buffer[1] === 0xd0 && buffer[2] === 0xd3 && buffer[3] === 0xc6;
    const isAsciiPs = buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%!PS";
    if (!isBinEps && !isAsciiPs) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Isi berkas tidak valid untuk format EPS.",
      });
    }
    canonicalContentType = "application/postscript";
  } else if (ext === "ai") {
    // Modern AI is PDF (%PDF) or PostScript (%!PS)
    const isPdfAi = buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF";
    const isPsAi = buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%!PS";
    if (!isPdfAi && !isPsAi) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Isi berkas tidak valid untuk format Adobe Illustrator (AI).",
      });
    }
    canonicalContentType = "application/illustrator";
  }

  return { extension: ext, canonicalContentType };
}
