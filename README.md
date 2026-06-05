# Clipline

A local-first, browser-based video editor for vertical short-form content (Reels, Shorts, TikTok). Upload clips, arrange them on a multi-track timeline, add animated captions, transitions and color grading, preview in real time, and export a 1080×1920 H.264 MP4 rendered with Remotion.

Editing is non-destructive: source media is never modified. Every edit mutates a timeline specification (a single zod-validated JSON document), and both the live preview and the final export consume that same spec, so what you preview is what ships.

## Features

- **Media library**: drag-drop upload, automatic normalization (H.264/AAC, faststart, 1s keyframes for fast scrubbing), thumbnails and audio waveforms generated at ingest
- **Multi-track timeline**: drag clips onto video/audio tracks, trim by edges, split at the playhead, reorder; 60fps interactions
- **Text layers**: animated captions (fade-in, slide-up, pop, typewriter) with size, color and position controls
- **Transitions**: fade, wipe, slide between adjacent clips
- **Color grading**: per-clip brightness/contrast/saturation, identical in preview and export
- **Live preview**: canvas compositing + Web Audio mixing, synced to the playhead
- **Export**: server-side Remotion render with live progress streaming, downloadable MP4
- **Light/dark mode**, responsive layout, keyboard-driven editing

## Stack

| Layer | Technology |
| --- | --- |
| Monorepo | Turborepo + pnpm workspaces |
| Editor | Next.js (App Router), React, Tailwind 4, shadcn/ui (Base UI), Zustand, TanStack Query, Motion |
| API | Hono on Node (`@hono/node-server`), Drizzle ORM, zod |
| Worker | Node, BullMQ, ffmpeg, Remotion (`@remotion/renderer`) |
| Data | PostgreSQL (timeline stored as JSONB), Redis (queues + progress) |
| Media storage | Cloudinary |

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 10
- Docker (for PostgreSQL + Redis)
- ffmpeg + ffprobe on PATH
- A [Cloudinary](https://cloudinary.com) account (free tier works)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL + Redis
docker compose up -d

# 3. Run database migrations
cd apps/api && pnpm db:migrate && cd ../..

# 4. Add Cloudinary credentials
#    Fill CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET in:
#      apps/api/.env
#      apps/worker/.env
#    (see .env.example; both files are gitignored)

# 5. Start everything
pnpm dev
```

| App | URL / role |
| --- | --- |
| `apps/web` | http://localhost:3000, landing + projects + editor |
| `apps/api` | http://localhost:4000, REST + SSE |
| `apps/worker` | BullMQ consumer running ingest (ffmpeg) and render (Remotion) jobs |

> Redis is exposed on host port **6380** (6379 is commonly taken by a system Redis). The apps default to `redis://localhost:6380`.

## Repository layout

```
apps/
  web/        Next.js editor: components/, store/ (Zustand), lib/ (api client,
              timeline ops, preview engine), remotion/ (export composition)
  api/        Hono server: routes/ -> services/ -> db/ (Drizzle schema + migrations)
  worker/     BullMQ consumer: processors/ingest (ffmpeg), processors/render (Remotion)
packages/
  timeline/   The timeline spec: zod schema, types, pure helpers (single source of truth)
  jobs/       Queue names + zod contracts for job payloads/results
  config/     Shared tsconfig
context/      Project context docs (architecture, standards, progress), gitignored
```

## How it works

**Ingest.** `POST /projects/:id/assets` streams the upload to Cloudinary, inserts an asset row (`processing`) and enqueues a BullMQ job. The worker downloads the original to scratch, probes it, normalizes with ffmpeg, generates a thumbnail and waveform PNG, uploads the artifacts and returns metadata over BullMQ. The API persists the result (`ready`/`failed`); the worker never touches PostgreSQL.

**Editing.** The editor keeps the timeline in a Zustand store; all transformations are pure functions (`apps/web/lib/timeline-ops.ts`) validated against the shared schema. Edits autosave (debounced 800 ms) to `PUT /projects/:id/timeline`.

**Preview.** An imperative canvas engine composites the active video frame (cover-fit, CSS-filter grading), draws text layers and transition blends, and mixes audio through a Web Audio gain graph. Media elements are pooled one-per-asset and drift-corrected rather than remounted.

**Export.** `POST /projects/:id/render` validates the timeline, resolves asset URLs and enqueues a render job. The worker renders the Remotion composition (`apps/web/remotion/`), the same spec and the same animation math, and uploads the MP4 to Cloudinary. Progress streams back over BullMQ to SSE to the export dialog.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `S` | Split selected clip at playhead |
| `Delete` / `Backspace` | Delete selected clip |
| `←` / `→` | Nudge playhead 1 frame (`Shift` = 10) |
| `Esc` | Clear selection |

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | All apps in watch mode (Turborepo) |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm --filter @clipline/api db:generate` | Generate Drizzle migration from schema |
| `pnpm --filter @clipline/api db:migrate` | Apply migrations |

## Output

Fixed format by design: **1080×1920, 30 fps, H.264 MP4, up to 120 seconds.** Single-user, local operation. No auth, no accounts.
