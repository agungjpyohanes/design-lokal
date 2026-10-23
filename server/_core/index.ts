import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.ts";
import { publicPlatformScript } from "./publicConfig.ts";
import { appRouter } from "../routers.ts";
import { createContext } from "./context.ts";
import { serveStatic, setupVite } from "./vite.ts";

// Inisialisasi aplikasi Express
const app = express();
const server = createServer(app);

// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/api/health", (_req: any, res: any) => res.json({ status: "ok" }));
app.get("/api/platform/config.js", (_req: any, res: any) => {
  res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
});

registerOAuthRoutes(app);

// tRPC API
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ path, error }) {
      console.warn(`[tRPC Error on ${path ?? "unknown"}]:`, error.message);
    },
  })
);

// Guarantee zero HTML/plain-text leaks on /api endpoints: always return clean JSON
app.use("/api", (err: any, _req: any, res: any, next: any) => {
  if (res.headersSent) return next(err);
  console.error("[API Error Caught]:", err?.message || err);
  res.status(err.status || err.statusCode || 500).json({
    error: {
      message: err.message || "Internal Server Error",
      code: err.code || "INTERNAL_SERVER_ERROR",
    },
  });
});

// API 404 Catch-All: Ensure any unmatched /api route returns JSON, never falling through to HTML
app.all("/api/*", (_req: any, res: any) => {
  res.status(404).json({
    error: {
      message: "API endpoint not found",
      code: "NOT_FOUND",
    },
  });
});

// development mode uses Vite, production mode uses static files (only for standalone server)
if (process.env.NODE_ENV === "development") {
  setupVite(app, server).catch(console.error);
} else if (!process.env.VERCEL) {
  serveStatic(app);
}

// Jalankan listen hanya jika tidak berjalan di Vercel Serverless (misal: dijalankan lokal)
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", (error: any) => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

// Ekspor app Express sebagai handler untuk Vercel Serverless Function
export default app;