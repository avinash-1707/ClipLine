import {
  MAX_DURATION_IN_FRAMES,
  timelineDurationInFrames,
  timelineSchema,
} from "@clipline/timeline";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { fail, ok } from "../lib/respond";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
  saveTimeline,
} from "../services/projects";

const idParam = z.object({ id: z.uuid() });
const nameBody = z.object({ name: z.string().min(1).max(200) });

export const projectRoutes = new Hono()

  .get("/", async (c) => {
    return ok(c, await listProjects());
  })

  .post("/", zValidator("json", nameBody), async (c) => {
    const { name } = c.req.valid("json");
    return ok(c, await createProject(name), 201);
  })

  .get("/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const project = await getProject(id);
    if (!project) return fail(c, "project not found", 404);
    return ok(c, project);
  })

  .patch(
    "/:id",
    zValidator("param", idParam),
    zValidator("json", nameBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const { name } = c.req.valid("json");
      const project = await renameProject(id, name);
      if (!project) return fail(c, "project not found", 404);
      return ok(c, project);
    },
  )

  .put(
    "/:id/timeline",
    zValidator("param", idParam),
    zValidator("json", timelineSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const timeline = c.req.valid("json");
      const duration = timelineDurationInFrames(timeline);
      if (duration > MAX_DURATION_IN_FRAMES) {
        return fail(
          c,
          `timeline is ${duration} frames; maximum is ${MAX_DURATION_IN_FRAMES}`,
          422,
        );
      }
      const project = await saveTimeline(id, timeline);
      if (!project) return fail(c, "project not found", 404);
      return ok(c, project);
    },
  )

  .delete("/:id", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await deleteProject(id);
    if (!deleted) return fail(c, "project not found", 404);
    return ok(c, { id });
  });
