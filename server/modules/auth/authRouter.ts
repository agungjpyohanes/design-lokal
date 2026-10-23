import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { localAuthCredentials, users } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { getSessionCookieOptions } from "../../_core/cookies";
import { getDummyLocalPasswordHash, verifyLocalPassword } from "../../_core/localPassword";
import { sdk } from "../../_core/sdk";
import { publicProcedure, router } from "../../_core/trpc";

const LOCAL_LOGIN_MAX_ATTEMPTS = 5;
const LOCAL_LOGIN_BLOCK_MINUTES = 15;
const LOCAL_SESSION_MS = 8 * 60 * 60 * 1000;

export const authRouter = router({
  me: publicProcedure.query((opts) => opts.ctx.user),

  localLogin: publicProcedure
    .input(
      z.object({
        username: z.string().trim().min(1).max(64),
        password: z.string().min(1).max(1024),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Layanan login tidak tersedia.",
        });
      }
      const username = input.username.toLowerCase();
      const [record] = await db
        .select({ credential: localAuthCredentials, user: users })
        .from(localAuthCredentials)
        .innerJoin(users, eq(localAuthCredentials.userId, users.id))
        .where(eq(localAuthCredentials.username, username))
        .limit(1);

      const hashToVerify =
        record?.credential.passwordHash ?? (await getDummyLocalPasswordHash());
      const valid = await verifyLocalPassword(input.password, hashToVerify);
      const isLocked = Boolean(
        record?.credential.lockedUntil && record.credential.lockedUntil.getTime() > Date.now()
      );

      if (!record || !valid) {
        if (record && !isLocked) {
          await db
            .update(localAuthCredentials)
            .set({
              lockedUntil: sql`CASE WHEN ${localAuthCredentials.failedAttempts} + 1 >= ${LOCAL_LOGIN_MAX_ATTEMPTS} THEN DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${LOCAL_LOGIN_BLOCK_MINUTES} MINUTE) ELSE ${localAuthCredentials.lockedUntil} END`,
              failedAttempts: sql`${localAuthCredentials.failedAttempts} + 1`,
            })
            .where(eq(localAuthCredentials.id, record.credential.id));
        }
        if (isLocked) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
          });
        }
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Username atau password tidak valid.",
        });
      }

      if (isLocked) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
        });
      }

      await db
        .update(localAuthCredentials)
        .set({ failedAttempts: 0, lockedUntil: null })
        .where(eq(localAuthCredentials.id, record.credential.id));

      const sessionToken = await sdk.createSessionToken(record.user.openId, {
        name: record.user.name || "Administrator",
        expiresInMs: LOCAL_SESSION_MS,
      });

      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: LOCAL_SESSION_MS,
      });

      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, record.user.id));

      return { success: true } as const;
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});
