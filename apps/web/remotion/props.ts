import type { Timeline } from "@clipline/timeline";

/**
 * Input props the worker passes to the composition: the validated timeline
 * spec plus a map of assetId -> media URL (Cloudinary normalized media).
 */
export type TimelineVideoProps = {
  timeline: Timeline;
  assetUrls: Record<string, string>;
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
