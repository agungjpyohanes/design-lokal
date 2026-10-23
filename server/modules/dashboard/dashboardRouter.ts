import { desc } from "drizzle-orm";
import { requests } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { demoStore } from "../../demoStore";
import { protectedProcedure, router } from "../../_core/trpc";
import { readSlaHours, ticketIsOverdue } from "../common/helpers";
import { ensureDesignerSlots } from "../settings/settingsRouter";
import { ticketRows, visibleRows } from "../tickets/helpers";

export const getDashboardSummary = protectedProcedure.query(async ({ ctx }) => {
  const db = await getDb();
  const role = ctx.user.appRole;

  if (role === "unassigned") {
    return {
      role,
      requests: [],
      requestsToReview: [],
      tickets: [],
      workload: [],
      stats: {
        open: 0,
        pendingReview: 0,
        waitingOwner: 0,
        quality: 0,
        overdue: 0,
        closedThisMonth: 0,
      },
      actions: [],
    };
  }

  let allRequests: any[] = [];
  if (db) {
    try {
      allRequests = await db
        .select()
        .from(requests)
        .orderBy(desc(requests.createdAt))
        .limit(120);
    } catch {
      allRequests = [];
    }
  }
  if (!allRequests || allRequests.length === 0) {
    allRequests = demoStore.requests;
  }

  const requestVisibleRoles = ["marketing", "owner", "manager", "spv", "superadmin"];
  const visibleRequests = !requestVisibleRoles.includes(role)
    ? []
    : role === "marketing"
      ? allRequests.filter((r) => r.requesterUserId === ctx.user.id)
      : allRequests;

  let rows = visibleRows(await ticketRows(), ctx.user);
  if (role === "qc1") rows = rows.filter(({ ticket }) => ticket.processStatus === "qc1");
  if (role === "qc2") rows = rows.filter(({ ticket }) => ticket.processStatus === "qc2");

  const now = new Date();
  const slaHours = await readSlaHours(db);
  const activeRows = rows.filter(
    ({ ticket }) => ticket.processStatus !== "closed" && ticket.processStatus !== "ditolak_owner"
  );

  const overdueRequests = visibleRequests.filter(
    (request) =>
      ["baru_masuk", "perlu_dilengkapi"].includes(request.status) &&
      new Date(request.createdAt).getTime() + slaHours.request_review * 60 * 60 * 1000 <
        now.getTime()
  ).length;

  const overdue =
    activeRows.filter(({ ticket }) => ticketIsOverdue(ticket, now, slaHours)).length +
    overdueRequests;

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const closedThisMonth = rows.filter(
    ({ ticket }) =>
      ticket.processStatus === "closed" &&
      ticket.closedAt &&
      new Date(ticket.closedAt).getMonth() === currentMonth &&
      new Date(ticket.closedAt).getFullYear() === currentYear
  ).length;

  const workloadVisible = ["superadmin", "admin", "spv", "manager", "owner"].includes(role);
  const slots = workloadVisible || role === "designer" ? await ensureDesignerSlots() : [];
  const workload = slots
    .map((slot) => {
      const assigned = activeRows.filter((row) => row.slot.id === slot.id);
      return {
        ...slot,
        total: assigned.length,
        notStarted: assigned.filter((row) => row.ticket.jobStatus === "Belum mulai").length,
        working: assigned.filter(
          (row) =>
            row.ticket.jobStatus === "Sedang dikerjakan" ||
            row.ticket.jobStatus === "Revisi dikerjakan"
        ).length,
        revision: assigned.filter(
          (row) =>
            row.ticket.jobStatus === "Revisi dikerjakan" ||
            ["revisi", "revisi_owner", "revisi_qc"].includes(row.ticket.processStatus)
        ).length,
        waiting: assigned.filter(
          (row) => row.ticket.jobStatus === "Menunggu feedback/keputusan"
        ).length,
        blocked: assigned.filter((row) => row.ticket.jobStatus === "Terhambat").length,
        overdue: assigned.filter((row) => ticketIsOverdue(row.ticket, now, slaHours)).length,
      };
    })
    .filter((slot) => workloadVisible || slot.userId === ctx.user.id);

  const openRequests = visibleRequests.filter((r) =>
    ["baru_masuk", "perlu_dilengkapi"].includes(r.status)
  ).length;

  const requestsToReview = ["manager", "spv", "superadmin"].includes(role)
    ? visibleRequests
        .filter((request) => ["baru_masuk", "perlu_dilengkapi"].includes(request.status))
        .slice(0, 6)
    : [];

  const actions = activeRows
    .filter(({ ticket }) => {
      if (role === "superadmin") return true;
      if (role === "spv")
        return [
          "draft",
          "review_spv",
          "revisi",
          "qc_spv",
          "siap_upload",
          "uploaded",
        ].includes(ticket.processStatus);
      if (role === "admin") return ticket.processStatus === "uploaded";
      if (role === "owner") return ticket.processStatus === "menunggu_acc_owner";
      if (role === "designer")
        return ["draft", "revisi", "revisi_owner", "finalisasi", "revisi_qc"].includes(
          ticket.processStatus
        );
      if (role === "qc1") return ticket.processStatus === "qc1";
      if (role === "qc2") return ticket.processStatus === "qc2";
      if (role === "mpp") return ticket.processStatus === "menunggu_josd";
      return false;
    })
    .slice(0, 8);

  return {
    role,
    requests: visibleRequests.slice(0, 8),
    requestsToReview,
    tickets: rows.slice(0, 10).map((row) => ({
      ...row.ticket,
      productType: row.request.productType,
      priority: row.request.finalPriority ?? row.request.requestedPriority,
      designerLabel: row.slot.displayName || row.slot.label,
      requesterName: row.request.requesterName,
      slaHours: slaHours[row.ticket.processStatus],
    })),
    workload,
    stats: {
      open: activeRows.length,
      pendingReview: openRequests,
      waitingOwner: activeRows.filter(
        ({ ticket }) => ticket.processStatus === "menunggu_acc_owner"
      ).length,
      quality: activeRows.filter(({ ticket }) =>
        ["qc_spv", "qc1", "qc2", "revisi_qc"].includes(ticket.processStatus)
      ).length,
      overdue,
      closedThisMonth,
    },
    actions: actions.map(({ ticket, request, slot }) => ({
      ...ticket,
      productType: request.productType,
      designerLabel: slot.displayName || slot.label,
    })),
  };
});

export const dashboardRouter = router({
  summary: getDashboardSummary,
});
