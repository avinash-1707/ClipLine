import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./lib/env";
import { handleError } from "./lib/errors";
import { logger, requestLogger, type AppEnv } from "./lib/logger";
import { startQueueEventListeners } from "./lib/queues";
import { fail } from "./lib/respond";
import { assetRoutes, projectAssetRoutes } from "./routes/assets";
import { projectRoutes } from "./routes/projects";
import { projectRenderRoutes, renderJobRoutes } from "./routes/render";

const app = new Hono<AppEnv>();

app.use(requestLogger);
app.use(cors({ origin: env.CORS_ORIGIN }));

app.get("/health", (c) => c.json({ data: { status: "ok" } }));
app.route("/projects", projectRoutes);
app.route("/projects/:projectId/assets", projectAssetRoutes);
app.route("/assets", assetRoutes);
app.route("/projects/:projectId/render", projectRenderRoutes);
app.route("/render-jobs", renderJobRoutes);

startQueueEventListeners();

app.notFound((c) => fail(c, "not found", 404));
app.onError(handleError);

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection");
});
process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "uncaughtException");
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, `api listening on http://localhost:${info.port}`);
});
