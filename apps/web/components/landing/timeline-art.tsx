"use client";

import { motion } from "motion/react";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

// Clip blocks per track: [left%, width%]. Hand-placed to read like a real edit.
const VIDEO_CLIPS = [
  [0, 22],
  [23, 17],
  [41, 31],
  [73, 27],
];
const TEXT_CLIPS = [
  [6, 14],
  [44, 19],
  [80, 16],
];

// Continuous waveform polyline, deterministic. Drawn on scroll via pathLength.
function waveformPath(width: number, height: number, points: number) {
  const mid = height / 2;
  let d = `M 0 ${mid.toFixed(1)}`;
  for (let i = 1; i <= points; i += 1) {
    const x = (i / points) * width;
    const a =
      Math.sin(i * 0.55) * 0.5 +
      Math.sin(i * 0.26 + 1.1) * 0.32 +
      Math.sin(i * 1.4 + 2.2) * 0.18;
    const y = mid - a * (height * 0.4);
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

const WAVE = waveformPath(1000, 64, 150);

function Track({
  label,
  clips,
  baseDelay,
  tone,
}: {
  label: string;
  clips: number[][];
  baseDelay: number;
  tone: "solid" | "outline";
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="label-mono w-8 shrink-0 text-muted-foreground">
        {label}
      </span>
      <div className="relative h-9 flex-1">
        {clips.map(([left, width], i) => (
          <motion.div
            key={i}
            className={
              tone === "solid"
                ? "absolute inset-y-0 rounded-md border border-border bg-muted"
                : "absolute inset-y-0 rounded-md border border-border bg-background"
            }
            style={{ left: `${left}%`, width: `calc(${width}% - 4px)` }}
            initial={{ opacity: 0, scaleX: 0.82, filter: "blur(4px)" }}
            whileInView={{ opacity: 1, scaleX: 1, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
            transition={{
              duration: 0.5,
              ease: EASE,
              delay: baseDelay + i * 0.06,
            }}
          >
            <span className="absolute inset-y-1.5 left-1.5 w-px bg-foreground/20" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/**
 * The page's signature art: a full-width editor timeline reconstructed in pure
 * markup — ruler, video / text / audio tracks, clip blocks and a playhead that
 * sweeps once when the band scrolls into view. Shows the product without a
 * screenshot. Strictly monochrome.
 */
export function TimelineArt() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/40">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="label-mono text-muted-foreground">Timeline</span>
        <span className="label-mono text-muted-foreground">
          00:00:00:00 → 00:02:00:00
        </span>
      </div>

      <div className="space-y-3 px-5 py-6">
        {/* ruler */}
        <div className="flex items-center gap-3">
          <span className="w-8 shrink-0" />
          <svg
            className="h-5 flex-1 text-border"
            viewBox="0 0 1000 20"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {Array.from({ length: 49 }, (_, i) => {
              const x = (i / 48) * 1000;
              const major = i % 4 === 0;
              return (
                <line
                  key={i}
                  x1={x}
                  x2={x}
                  y1={major ? 4 : 10}
                  y2={20}
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              );
            })}
          </svg>
        </div>

        <Track label="V1" clips={VIDEO_CLIPS} baseDelay={0.05} tone="solid" />
        <Track label="TXT" clips={TEXT_CLIPS} baseDelay={0.18} tone="outline" />

        {/* audio waveform track */}
        <div className="flex items-center gap-3">
          <span className="label-mono w-8 shrink-0 text-muted-foreground">
            A1
          </span>
          <div className="h-12 flex-1 rounded-md border border-border bg-background px-2">
            <svg
              className="h-full w-full text-foreground/55"
              viewBox="0 0 1000 64"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line
                x1={0}
                x2={1000}
                y1={32}
                y2={32}
                stroke="currentColor"
                strokeOpacity={0.25}
                strokeWidth={1}
              />
              <motion.path
                d={WAVE}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: 1 }}
                viewport={{ once: true, margin: "0px 0px -15% 0px" }}
                transition={{ duration: 1.3, ease: EASE, delay: 0.25 }}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* playhead — a wrapper spanning the track region (label col + paddings
          excluded) so an x:0→100% translate carries the 1px line edge-to-edge.
          Percent translate resolves against the wrapper's own width. */}
      <motion.div
        className="pointer-events-none absolute top-[4.25rem] bottom-6 left-16 right-5"
        initial={{ x: "0%", opacity: 0 }}
        whileInView={{ x: ["0%", "0%", "100%"], opacity: [0, 1, 1] }}
        viewport={{ once: true, margin: "0px 0px -15% 0px" }}
        transition={{
          duration: 2.4,
          ease: [0.4, 0, 0.2, 1],
          delay: 0.35,
          times: [0, 0.1, 1],
        }}
      >
        <span className="absolute inset-y-0 left-0 w-px bg-foreground/60" />
        <span className="absolute -top-1 left-0 size-2 -translate-x-1/2 rounded-full bg-foreground" />
      </motion.div>
    </div>
  );
}
