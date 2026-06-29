import type { Timeline } from "@clipline/timeline";

/**
 * Input props the worker passes to the composition: the validated timeline
 * spec plus a map of assetId -> media URL (Cloudinary normalized media).
 */
/** Source media intrinsic dimensions, keyed by assetId. Needed to compute the
 * pan/zoom framing rect at render time (Remotion has no live <video> to read
 * videoWidth/videoHeight from, unlike the canvas preview). */
export type AssetDims = Record<string, { width: number; height: number }>;

export type TimelineVideoProps = {
  timeline: Timeline;
  assetUrls: Record<string, string>;
  assetDims: AssetDims;
  // Remotion's Composition requires props assignable to Record<string, unknown>
} & Record<string, unknown>;

/** Same color grade math as the preview's gradeToFilter — parity invariant. */
export function gradeFilter(grade: {
  brightness: number;
  contrast: number;
  saturation: number;
}): string {
  if (
    grade.brightness === 0 &&
    grade.contrast === 0 &&
    grade.saturation === 0
  ) {
    return "none";
  }
  return [
    `brightness(${1 + grade.brightness})`,
    `contrast(${1 + grade.contrast})`,
    `saturate(${1 + grade.saturation})`,
  ].join(" ");
}
