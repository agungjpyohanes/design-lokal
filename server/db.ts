import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { demoStore } from "./demoStore";

let _db: ReturnType<typeof drizzle> | null = null;
let _isDbConnected: boolean | null = null;
let _lastConnectionAttempt = 0;
const RETRY_INTERVAL_MS = 30_000; // Check DB at most once every 30s if offline/failed

export function markDbFailed(error?: unknown) {
  console.warn(
    "[Database] Connection failure detected, tripping circuit breaker to demoStore:",
    error instanceof Error ? error.message : error
  );
  _isDbConnected = false;
  _lastConnectionAttempt = Date.now();
  _db = null;
}

export function resetDbCircuitBreaker() {
  _isDbConnected = null;
  _lastConnectionAttempt = 0;
  _db = null;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb(): Promise<ReturnType<typeof drizzle> | null> {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl || dbUrl === "false") {
    return null;
  }

  const now = Date.now();
  // Circuit breaker: prevent connection hangs on serverless when DB is unreachable
  if (_isDbConnected === false && now - _lastConnectionAttempt < RETRY_INTERVAL_MS) {
    return null;
  }

  if (!_db) {
    try {
      _db = drizzle(dbUrl);
      _isDbConnected = true;
    } catch (error) {
      markDbFailed(error);
      return null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    // In-Memory Demo Fallback when database is unconfigured
    const existing = demoStore.users.find((u) => u.openId === user.openId);
    if (!existing) {
      const newUser = {
        id: demoStore.users.length + 1,
        openId: user.openId,
        name: user.name || "Demo User",
        email: user.email || `${user.openId}@desainlokal.internal`,
        loginMethod: user.loginMethod || "demo",
        role: user.openId === ENV.ownerOpenId ? "admin" : (user.role || "user"),
        appRole: user.openId === ENV.ownerOpenId ? "superadmin" : (user.appRole || "designer"),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: user.lastSignedIn || new Date(),
      };
      demoStore.users.push(newUser);
    } else {
      if (user.name !== undefined) existing.name = user.name;
      if (user.email !== undefined) existing.email = user.email;
      if (user.role !== undefined) existing.role = user.role;
      if (user.appRole !== undefined) existing.appRole = user.appRole;
      existing.lastSignedIn = user.lastSignedIn || new Date();
    }
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    for (const field of textFields) {
      if (user[field] !== undefined) {
        const normalized = user[field] ?? null;
        values[field] = normalized;
        updateSet[field] = normalized;
      }
    }
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    } else {
      values.lastSignedIn = new Date();
      updateSet.lastSignedIn = values.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }
    if (user.appRole !== undefined) {
      values.appRole = user.appRole;
      updateSet.appRole = user.appRole;
    }
    if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      values.appRole = "superadmin";
      updateSet.role = "admin";
      updateSet.appRole = "superadmin";
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.warn("[upsertUser] DB insert failed, fallback to demoStore:", error);
    const existing = demoStore.users.find((u) => u.openId === user.openId);
    if (!existing) {
      demoStore.users.push({
        id: demoStore.users.length + 1,
        openId: user.openId,
        name: user.name || "Demo User",
        email: user.email || `${user.openId}@desainlokal.internal`,
        loginMethod: user.loginMethod || "demo",
        role: user.openId === ENV.ownerOpenId ? "admin" : (user.role || "user"),
        appRole: user.openId === ENV.ownerOpenId ? "superadmin" : (user.appRole || "designer"),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: user.lastSignedIn || new Date(),
      });
    }
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (db) {
    try {
      const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      if (result.length > 0) return result[0];
    } catch (e) {
      console.warn("[getUserByOpenId] DB error, using demoStore fallback:", e);
    }
  }
  return demoStore.users.find((u) => u.openId === openId) || undefined;
}
