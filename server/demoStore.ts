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
  DEMO_ACC_SESSIONS,
  DEMO_ACC_SESSION_ITEMS,
} from "./mockData";

// In-Memory store clone of demo data for seamless execution without DB connection
export class DemoDataStore {
  users: any[] = structuredClone(DEMO_USERS);
  designerSlots: any[] = structuredClone(DEMO_DESIGNER_SLOTS);
  slaRules: any[] = structuredClone(DEMO_SLA_RULES);
  requests: any[] = structuredClone(DEMO_REQUESTS);
  tickets: any[] = structuredClone(DEMO_TICKETS);
  operationalIds: any[] = structuredClone(DEMO_OPERATIONAL_IDS);
  ticketFiles: any[] = structuredClone(DEMO_TICKET_FILES);
  approvals: any[] = structuredClone(DEMO_APPROVALS);
  qcReviews: any[] = structuredClone(DEMO_QC_REVIEWS);
  jobUpdates: any[] = structuredClone(DEMO_JOB_UPDATES);
  activityEvents: any[] = structuredClone(DEMO_ACTIVITY_EVENTS);
  accSessions: any[] = structuredClone(DEMO_ACC_SESSIONS);
  accSessionItems: any[] = structuredClone(DEMO_ACC_SESSION_ITEMS);

  getTicketRows() {
    return this.tickets.map((ticket) => {
      const request = this.requests.find((r) => r.id === ticket.requestId)!;
      const slot = this.designerSlots.find((s) => s.id === ticket.designerSlotId)!;
      return { ticket, request, slot };
    });
  }

  getTicketDetail(id: number) {
    const row = this.getTicketRows().find((r) => r.ticket.id === id);
    if (!row) return null;
    const op = this.operationalIds.find((o) => o.ticketId === id) || null;
    const files = this.ticketFiles
      .filter((f) => f.ticketId === id)
      .map((f) => ({
        ...f,
        uploaderName: this.users.find((u) => u.id === f.uploadedBy)?.name || "User",
        downloadUrl: "#",
      }));
    const requestReferenceFiles = (row.request as any).referenceFiles || [];
    const approvals = this.approvals
      .filter((a) => a.ticketId === id)
      .map((a) => ({
        ...a,
        reviewerName: this.users.find((u) => u.id === a.reviewerUserId)?.name || "Reviewer",
      }));
    const qcReviews = this.qcReviews
      .filter((q) => q.ticketId === id)
      .map((q) => ({
        ...q,
        checkerName: this.users.find((u) => u.id === q.checkerUserId)?.name || "Checker",
      }));
    const events = this.activityEvents
      .filter((e) => e.ticketId === id)
      .map((e) => ({
        ...e,
        actorName: this.users.find((u) => u.id === e.actorUserId)?.name || "Actor",
      }));
    const jobUpdates = this.jobUpdates
      .filter((j) => j.ticketId === id)
      .map((j) => ({
        ...j,
        designerName: this.users.find((u) => u.id === j.designerUserId)?.name || "Designer",
      }));

    const accItem =
      this.accSessionItems.find((it) => it.ticketId === id && ["acc", "acc_catatan"].includes(it.decision)) ||
      this.accSessionItems.find((it) => it.ticketId === id);
    const accSession = accItem ? this.accSessions.find((s) => s.id === accItem.sessionId) : null;
    const accSessionApproval =
      accItem && accSession
        ? {
            sessionId: accSession.id,
            sessionNo: accSession.sessionNo,
            presentationDate: accSession.presentationDate,
            decision: accItem.decision,
            notes: accItem.notes,
            fileVersion: accItem.fileVersion,
          }
        : null;

    return {
      ...row.ticket,
      request: row.request,
      designerSlot: row.slot,
      operationalIds: op,
      files,
      requestReferenceFiles,
      approvals,
      qcReviews,
      events,
      jobUpdates,
      accSessionApproval,
    };
  }

  getAccSessions() {
    return this.accSessions.map((session) => {
      const recorder = this.users.find((u) => u.id === session.recordedByUserId);
      const items = this.accSessionItems.filter((it) => it.sessionId === session.id);
      return {
        ...session,
        recorderName: recorder?.name || "SPV / Admin",
        itemsCount: items.length,
      };
    });
  }

  getAccSessionDetail(id: number) {
    const session = this.accSessions.find((s) => s.id === id);
    if (!session) return null;
    const recorder = this.users.find((u) => u.id === session.recordedByUserId);
    const items = this.accSessionItems
      .filter((it) => it.sessionId === session.id)
      .map((it) => {
        const ticket = it.ticketId ? this.tickets.find((t) => t.id === it.ticketId) : null;
        const request = ticket ? this.requests.find((r) => r.id === ticket.requestId) : null;
        return {
          ...it,
          ticketNo: ticket?.ticketNo || null,
          processStatus: ticket?.processStatus || null,
          jobStatus: ticket?.jobStatus || null,
          productType: request?.productType || null,
        };
      });
    return {
      ...session,
      recorderName: recorder?.name || "SPV / Admin",
      items,
    };
  }
}

export const demoStore = new DemoDataStore();
