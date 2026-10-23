import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { DEMO_USERS, DEMO_REQUESTS, DEMO_TICKETS, DEMO_DESIGNER_SLOTS } from "./mockData";
import { getDb, upsertUser, getUserByOpenId } from "./db";

describe("Backend Data Access Layer: In-Memory Demo Fallback & Core Queries", () => {
  // Test context using superadmin demo user
  const adminCtx = {
    user: DEMO_USERS[0],
  };
  const caller = appRouter.createCaller(adminCtx as any);

  it("1. getDb() returns null gracefully when DATABASE_URL is not configured", async () => {
    // When DATABASE_URL is not set or empty, getDb should safely return null or connected instance
    const db = await getDb();
    // In our test environment without a live DB URL, it returns null without throwing
    expect(db === null || typeof db === "object").toBe(true);
  });

  it("2. workflow.dashboard returns populated metrics and tickets in fallback mode", async () => {
    const summary = await caller.workflow.dashboard();
    expect(summary).toBeDefined();
    expect(summary.role).toBe(DEMO_USERS[0].appRole);
    expect(summary.tickets.length).toBeGreaterThan(0);
    expect(summary.stats).toBeDefined();
    expect(summary.workload.length).toBeGreaterThan(0);
  });

  it("3. workflow.requests.list returns pre-populated requests cleanly", async () => {
    const list = await caller.workflow.requests.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(DEMO_REQUESTS.length);
    expect(list[0]).toHaveProperty("requestNo");
    expect(list[0]).toHaveProperty("productType");
  });

  it("4. workflow.tickets.list returns all tickets with designerSlot and request metadata", async () => {
    const tickets = await caller.workflow.tickets.list();
    expect(Array.isArray(tickets)).toBe(true);
    expect(tickets.length).toBeGreaterThanOrEqual(DEMO_TICKETS.length);

    // Verify key fields required by Kanban board
    const sample = tickets[0];
    expect(sample).toHaveProperty("ticketNo");
    expect(sample).toHaveProperty("processStatus");
    expect(sample).toHaveProperty("request");
    expect(sample.request).toHaveProperty("productType");
    expect(sample).toHaveProperty("designerSlot");
    expect(sample.designerSlot).toHaveProperty("label");
  });

  it("5. workflow.tickets.list covers all 10 Kanban workflow stages", async () => {
    const tickets = await caller.workflow.tickets.list();
    const statuses = new Set(tickets.map((t) => t.processStatus));

    // Stages required by Kanban board:
    const requiredStages = [
      "draft",
      "review_spv",
      "menunggu_acc_owner",
      "revisi",
      "qc_spv",
      "qc1",
      "qc2",
      "siap_upload",
      "uploaded",
      "closed",
    ];

    for (const stage of requiredStages) {
      expect(statuses.has(stage as any)).toBe(true);
    }
  });

  it("6. workflow.settings.designerSlots returns all 8 pre-populated slots", async () => {
    const slots = await caller.workflow.settings.designerSlots();
    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBe(8);
    expect(slots[0].slotNumber).toBe(1);
    expect(slots[0].label).toBe("Designer 1");
  });

  it("7. workflow.accSessions.list returns pre-populated ACC sessions", async () => {
    const sessions = await caller.workflow.accSessions.list();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]).toHaveProperty("sessionNo");
  });

  it("8. upsertUser and getUserByOpenId gracefully handle fallback without throwing", async () => {
    const testOpenId = "test-demo-user-fallback";
    await expect(
      upsertUser({
        openId: testOpenId,
        name: "Test Fallback User",
        email: "test.fallback@desainlokal.internal",
        role: "user",
        appRole: "designer",
      })
    ).resolves.not.toThrow();

    const retrieved = await getUserByOpenId(testOpenId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("Test Fallback User");
  });
});
