"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Lenis smooth scrolling, mounted only on the landing page. The editor and
 * projects views keep native scrolling (high-frequency tool surfaces).
 * Renders nothing; lifecycle only.
 */
export function SmoothScroll() {
  useEffect(() => {
    // honor reduced motion: native scrolling, no inertia
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}
