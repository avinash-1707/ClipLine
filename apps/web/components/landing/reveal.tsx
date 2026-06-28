"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

// Shared landing easing — same curve as the CSS .rise load reveal so scroll
// reveals feel like one continuous motion language across the page.
const EASE = [0.21, 0.47, 0.32, 0.98] as const;

/**
 * Scroll-triggered reveal: opacity + translateY + blur, fired once when the
 * element enters the viewport. Jakub's enter recipe. Reduced motion is handled
 * globally (MotionConfig reducedMotion="user" + the CSS guard in globals.css).
 */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}
