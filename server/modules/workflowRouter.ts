import { router } from "../_core/trpc";
import { getDashboardSummary } from "./dashboard/dashboardRouter";
import { requestsRouter } from "./requests/requestsRouter";
import { settingsRouter } from "./settings/settingsRouter";
import { ticketsRouter } from "./tickets/ticketsRouter";
import { accSessionsRouter } from "./accSessions/accSessionsRouter";

export const workflowRouter = router({
  dashboard: getDashboardSummary,
  requests: requestsRouter,
  tickets: ticketsRouter,
  settings: settingsRouter,
  accSessions: accSessionsRouter,
});

export type WorkflowRouter = typeof workflowRouter;
