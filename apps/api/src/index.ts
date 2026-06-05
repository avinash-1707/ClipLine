import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./lib/env";
import { fail } from "./lib/respond";
import { projectRoutes } from "./routes/projects";

const app = new Hono();

app.use(logger());
app.use(cors());

app.get("/health", (c) => c.json({ data: { status: "ok" } }));
app.route("/projects", projectRoutes);

app.notFound((c) => fail(c, "not found", 404));
app.onError((err, c) => {
  console.error(err);
  return fail(c, "internal server error", 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
