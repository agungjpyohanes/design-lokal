import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./modules/auth/authRouter";
import { workflowRouter } from "./modules/workflowRouter";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  workflow: workflowRouter,
});

export type AppRouter = typeof appRouter;
