import { createRequire } from "node:module";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { Timeline } from "@clipline/timeline";

const COMPOSITION_ID = "clipline";

/** apps/web owns the composition (preview/export parity); resolve its entry. */
const ENTRY_POINT = resolve(
  import.meta.dirname,
  "../../../../web/remotion/index.ts",
);

const require = createRequire(import.meta.url);

let bundlePromise: Promise<string> | null = null;

/** Bundle the composition once per worker process and reuse it. */
function getBundle(): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: ENTRY_POINT,
    // the composition imports @clipline/timeline as raw TypeScript (JIT
    // workspace package); let webpack compile TS inside node_modules too
    webpackOverride: (config) => ({
      ...config,
      module: {
        ...config.module,
        rules: config.module?.rules?.map((rule) => {
          if (
            rule &&
            typeof rule === "object" &&
            "test" in rule &&
            rule.test instanceof RegExp &&
            rule.test.test("file.ts")
          ) {
            return { ...rule, exclude: undefined };
          }
          return rule;
        }),
      },
    }),
  });
  return bundlePromise;
}

export interface RenderInput {
  timeline: Timeline;
  assetUrls: Record<string, string>;
  outputPath: string;
  onProgress?: (progress: number) => void;
}

/** Render the timeline to a 1080x1920 H.264 MP4 at outputPath. */
export async function renderTimeline({
  timeline,
  assetUrls,
  outputPath,
  onProgress,
}: RenderInput): Promise<void> {
  const serveUrl = await getBundle();
  const inputProps = { timeline, assetUrls };

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
  });

  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    // intra-render parallelism: Remotion saturates cores; the render queue
    // itself stays at concurrency 1 (architecture decision)
    concurrency: null,
    onProgress: ({ progress }) => onProgress?.(progress),
  });
}

export { COMPOSITION_ID };
