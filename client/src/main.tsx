import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        if (error instanceof TRPCClientError) {
          const status = error.data?.httpStatus;
          if (status === 401 || status === 403 || error.message === UNAUTHED_ERR_MSG) {
            return false;
          }
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      async fetch(input, init) {
        const response = await globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });

        // Resilience guard: If server returns non-JSON (HTML 502/504 gateway error, etc.),
        // synthesize a valid JSON response so TRPCClientError parses cleanly without throwing
        // "SyntaxError: Unexpected token 'A' / '<' ... is not valid JSON".
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          const rawText = await response.text().catch(() => "");
          console.warn(
            "[tRPC Network Interceptor] Intercepted non-JSON response:",
            response.status,
            rawText.slice(0, 100)
          );

          let batchCount = 1;
          const inputStr = typeof input === "string" ? input : (input as Request)?.url || "";
          if (inputStr) {
            const urlPath = inputStr.split("?")[0];
            const lastSegment = urlPath.split("/").pop() || "";
            const count = lastSegment.split(",").length;
            if (count > 1) batchCount = count;
          } else if (init?.body && typeof init.body === "string") {
            try {
              const parsed = JSON.parse(init.body);
              if (Array.isArray(parsed)) batchCount = parsed.length;
            } catch {}
          }

          const errorItem = {
            error: {
              message: rawText.trim() || `Network response error (${response.status})`,
              code: -32603,
              data: {
                code: "INTERNAL_SERVER_ERROR",
                httpStatus: response.status || 500,
              },
            },
          };
          const syntheticBody = JSON.stringify(Array.from({ length: batchCount }, () => errorItem));

          return new Response(syntheticBody, {
            status: response.status || 500,
            statusText: response.statusText || "Internal Server Error",
            headers: {
              "Content-Type": "application/json",
            },
          });
        }

        return response;
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// Registrasi Service Worker PWA
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[PWA] Service Worker aktif dengan scope:", reg.scope);
      })
      .catch((err) => {
        console.info("[PWA] Info: Registrasi Service Worker offline/lokal:", err);
      });
  });
}
