import {
  boolean,
  date,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const appRoles = [
  "unassigned",
  "marketing",
  "owner",
  "manager",
  "spv",
  "designer",
  "mpp",
  "admin",
  "superadmin",
  "qc1",
  "qc2",
] as const;
export type AppRole = (typeof appRoles)[number];

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  appRole: mysqlEnum("appRole", appRoles).default("unassigned").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const localAuthCredentials = mysqlTable("local_auth_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  failedAttempts: int("failedAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const designerSlots = mysqlTable("designer_slots", {
  id: int("id").autoincrement().primaryKey(),
  slotNumber: int("slotNumber").notNull().unique(),
  label: varchar("label", { length: 32 }).notNull(),
  displayName: varchar("displayName", { length: 120 }),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const requests = mysqlTable("design_requests", {
  id: int("id").autoincrement().primaryKey(),
  requestNo: varchar("requestNo", { length: 32 }).notNull().unique(),
  source: mysqlEnum("source", ["marketing", "owner", "other"]).notNull(),
  requesterName: varchar("requesterName", { length: 160 }).notNull(),
  requesterUserId: int("requesterUserId").references(() => users.id, { onDelete: "set null" }),
  contact: varchar("contact", { length: 120 }),
  productType: varchar("productType", { length: 100 }).notNull(),
  sizeSpec: varchar("sizeSpec", { length: 120 }),
  seriesCount: int("seriesCount").default(1).notNull(),
  theme: text("theme"),
  sourceReason: varchar("sourceReason", { length: 120 }),
  competitorReference: text("competitorReference"),
  productionEstimate: varchar("productionEstimate", { length: 160 }),
  targetArea: varchar("targetArea", { length: 160 }),
  businessJustification: text("businessJustification"),
  similarDesign: varchar("similarDesign", { length: 32 }),
  similarDesignRef: varchar("similarDesignRef", { length: 160 }),
  designReuse: mysqlEnum("designReuse", ["reuse", "recolor", "new"]),
  requestedPriority: mysqlEnum("requestedPriority", ["normal", "urgent"]).default("normal").notNull(),
  finalPriority: mysqlEnum("finalPriority", ["normal", "urgent"]),
  urgentReason: text("urgentReason"),
  deadline: date("deadline"),
  referenceLink: text("referenceLink"),
  notes: text("notes"),
  status: varchar("status", { length: 40 }).default("baru_masuk").notNull(),
  gateDecision: varchar("gateDecision", { length: 40 }),
  gateReason: text("gateReason"),
  internalNotes: text("internalNotes"),
  reviewDecision: varchar("reviewDecision", { length: 40 }),
  reviewReason: text("reviewReason"),
  reviewedBy: int("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const requestFiles = mysqlTable("design_request_files", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull().references(() => requests.id, { onDelete: "cascade" }),
  uploadedBy: int("uploadedBy").notNull().references(() => users.id),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  contentType: varchar("contentType", { length: 120 }).notNull(),
  fileSize: int("fileSize").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const workflowSlaRules = mysqlTable("workflow_sla_rules", {
  processStatus: varchar("processStatus", { length: 40 }).primaryKey(),
  maxHours: int("maxHours").notNull(),
  updatedBy: int("updatedBy").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const tickets = mysqlTable("design_tickets", {
  id: int("id").autoincrement().primaryKey(),
  ticketNo: varchar("ticketNo", { length: 32 }).notNull().unique(),
  requestId: int("requestId").notNull().unique().references(() => requests.id, { onDelete: "cascade" }),
  spvUserId: int("spvUserId").notNull().references(() => users.id),
  designerSlotId: int("designerSlotId").notNull().references(() => designerSlots.id),
  brief: text("brief").notNull(),
  processStatus: varchar("processStatus", { length: 40 }).default("draft").notNull(),
  processUpdatedAt: timestamp("processUpdatedAt").defaultNow().notNull(),
  jobStatus: varchar("jobStatus", { length: 48 }).default("Belum mulai").notNull(),
  jobNote: text("jobNote"),
  eta: date("eta"),
  deadline: date("deadline"),
  startedAt: timestamp("startedAt"),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const jobUpdates = mysqlTable("designer_job_updates", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  designerSlotId: int("designerSlotId").notNull().references(() => designerSlots.id),
  designerUserId: int("designerUserId").references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 48 }).notNull(),
  note: text("note"),
  eta: date("eta"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const approvals = mysqlTable("ticket_approvals", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  reviewerUserId: int("reviewerUserId").notNull().references(() => users.id),
  stage: varchar("stage", { length: 32 }).notNull(),
  decision: varchar("decision", { length: 40 }).notNull(),
  note: text("note"),
  fileId: int("fileId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ticketFiles = mysqlTable("ticket_files", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  uploadedBy: int("uploadedBy").notNull().references(() => users.id),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  fileType: varchar("fileType", { length: 32 }).notNull(),
  contentType: varchar("contentType", { length: 120 }).notNull(),
  fileSize: int("fileSize").notNull(),
  versionNo: int("versionNo").default(1).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const qcReviews = mysqlTable("qc_reviews", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  checkerUserId: int("checkerUserId").notNull().references(() => users.id),
  stage: varchar("stage", { length: 16 }).notNull(),
  result: mysqlEnum("result", ["lolos", "revisi"]).notNull(),
  items: json("items").$type<Array<{ id: number; passed: boolean; note?: string }>>().notNull(),
  summary: text("summary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const operationalIds = mysqlTable("ticket_operational_ids", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull().unique().references(() => tickets.id, { onDelete: "cascade" }),
  josdNo: varchar("josdNo", { length: 120 }),
  josdAt: timestamp("josdAt"),
  jodNo: varchar("jodNo", { length: 120 }),
  jodStatus: varchar("jodStatus", { length: 40 }),
  dgNo: varchar("dgNo", { length: 120 }),
  serverPath: text("serverPath"),
  uploadedAt: timestamp("uploadedAt"),
  clipperClosedAt: timestamp("clipperClosedAt"),
});

export const activityEvents = mysqlTable("ticket_activity_events", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").references(() => tickets.id, { onDelete: "cascade" }),
  requestId: int("requestId").references(() => requests.id, { onDelete: "cascade" }),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  eventType: varchar("eventType", { length: 48 }).notNull(),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accSessions = mysqlTable("acc_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionNo: varchar("sessionNo", { length: 32 }).notNull().unique(), // Format: ACC-YYYY-MM
  presentationDate: date("presentationDate").notNull(),
  recordedByUserId: int("recordedByUserId").notNull().references(() => users.id),
  attendees: json("attendees").$type<string[]>().notNull(),
  generalNotes: text("generalNotes"),
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled"]).default("scheduled").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AccSession = typeof accSessions.$inferSelect;
export type InsertAccSession = typeof accSessions.$inferInsert;

export const accSessionItems = mysqlTable("acc_session_items", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().references(() => accSessions.id, { onDelete: "cascade" }),
  ticketId: int("ticketId").references(() => tickets.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  fileVersion: varchar("fileVersion", { length: 64 }), // Keterangan versi file yang dipresentasikan (contoh: v1, v2)
  decision: mysqlEnum("decision", ["pending", "acc", "acc_catatan", "revisi", "tolak"]).default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccSessionItem = typeof accSessionItems.$inferSelect;
export type InsertAccSessionItem = typeof accSessionItems.$inferInsert;

