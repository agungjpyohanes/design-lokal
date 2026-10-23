import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { DEMO_USERS } from "../mockData";

// Default demo user with Superadmin privileges for full application access
export const DEFAULT_DEMO_USER: User = DEMO_USERS[0];

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }

  // BYPASS AUTHENTICATION: Always fallback to demo superadmin user
  if (!user) {
    user = DEFAULT_DEMO_USER;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
