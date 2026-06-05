"use client";

/**
 * Center 9:16 stage. The canvas preview engine arrives in its own unit;
 * this renders the correctly-proportioned stage surface it will draw into.
 */
export function PreviewStage() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/20 p-6">
      <div className="relative flex aspect-9/16 max-h-full flex-col items-center justify-center overflow-hidden rounded-lg border border-border bg-black shadow-[0_16px_48px_-16px_rgb(0_0_0/0.5)]">
        {/* keeps the stage proportionate inside the flex container */}
        <div className="invisible h-[70vh] w-px" aria-hidden />
        <p className="label-mono absolute text-white/30">Preview</p>
      </div>
    </div>
  );
}
