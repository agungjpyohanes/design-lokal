import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request | any, key: string): string | undefined {
  const value = (req as any).query?.[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express | any) {
  (app as any).get("/api/oauth/callback", async (req: Request | any, res: Response | any) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      (res as any).status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(((req as any).headers?.cookie ?? "") as string)[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      (res as any).status(403).json({ error: "invalid oauth state" });
      return;
    }
    (res as any).clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        (res as any).status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req as any);
      (res as any).cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      (res as any).redirect(302, "/");
    } catch (error: any) {
      console.error("[OAuth] Callback failed", error instanceof Error ? error.message : "unknown error");
      (res as any).status(500).json({ error: "OAuth callback failed" });
    }
  });
}
