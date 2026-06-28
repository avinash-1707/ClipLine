"use client";

import { motion } from "motion/react";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

// Deterministic waveform bar heights (0.22–0.96). Layered sines read as organic
// audio without Math.random, so SSR and client markup always match.
const BARS = Array.from({ length: 38 }, (_, i) => {
  const a =
    Math.sin(i * 0.5) * 0.5 +
    Math.sin(i * 0.23 + 1) * 0.3 +
    Math.sin(i * 1.3 + 2) * 0.2;
  return 0.22 + Math.abs(a) * 0.72;
});

/**
 * The hero centrepiece: a living 9:16 frame built entirely from the editor's
 * own visual grammar — frame ruler, serif caption card, audio waveform and a
 * playhead that sweeps once on load. No idle loops; every motion plays once and
 * rests. Pure SVG / CSS, monochrome via tokens + currentColor.
 */
export function HeroPreview() {
  return (
    <div className="relative aspect-9/16 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-[0_32px_80px_-28px_rgb(0_0_0/0.55)] md:w-72">
      {/* graded backdrop — neutral grayscale only */}
      <div className="absolute inset-0 bg-[linear-gradient(165deg,oklch(0.34_0_0)_0%,oklch(0.2_0_0)_56%,oklch(0.15_0_0)_100%)]" />

      {/* frame ruler across the top */}
      <svg
        className="absolute inset-x-0 top-0 h-7 w-full text-white/25"
        viewBox="0 0 288 28"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {Array.from({ length: 25 }, (_, i) => {
          const x = 8 + i * 11.4;
          const major = i % 5 === 0;
          return (
            <line
              key={i}
              x1={x}
              x2={x}
              y1={14}
              y2={major ? 24 : 19}
              stroke="currentColor"
              strokeWidth={1}
            />
          );
        })}
      </svg>

      {/* serif caption — the "text layer" being previewed */}
      <div className="absolute left-1/2 top-[40%] w-full -translate-x-1/2 -translate-y-1/2 px-6 text-center">
        <motion.p
          className="font-display text-2xl italic leading-tight text-white/92"
          initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.5 }}
        >
          every frame,
          <br />
          exactly placed
        </motion.p>
      </div>

      {/* timecode chip */}
      <motion.div
        className="label-mono absolute bottom-[27%] left-1/2 -translate-x-1/2 rounded-md bg-white/10 px-2.5 py-1 text-white/80 backdrop-blur-sm"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.75 }}
      >
        00:00:42:11
      </motion.div>

      {/* waveform + track strip at the foot of the frame */}
      <div className="absolute inset-x-3 bottom-3 space-y-2">
        <div className="flex h-9 items-end gap-[2px]">
          {BARS.map((h, i) => (
            <motion.span
              key={i}
              className="flex-1 origin-bottom rounded-[1px] bg-white/35"
              style={{ height: `${h * 100}%` }}
              initial={{ scaleY: 0.12, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                duration: 0.5,
                ease: EASE,
                delay: 0.55 + i * 0.012,
              }}
            />
          ))}
        </div>
        <div className="flex gap-1">
          <div className="h-1.5 w-2/5 rounded-xs bg-white/30" />
          <div className="h-1.5 w-1/4 rounded-xs bg-white/18" />
          <div className="h-1.5 flex-1 rounded-xs bg-white/28" />
        </div>
      </div>

      {/* playhead — sweeps across once, then rests (a single play-through cue) */}
      <motion.div
        className="absolute top-7 bottom-3 left-0 w-px bg-white/75"
        initial={{ x: 26, opacity: 0 }}
        animate={{ x: [26, 26, 188], opacity: [0, 1, 1] }}
        transition={{
          duration: 2.1,
          ease: [0.4, 0, 0.2, 1],
          delay: 0.6,
          times: [0, 0.12, 1],
        }}
      >
        <span className="absolute -top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-white" />
      </motion.div>
    </div>
  );
}
