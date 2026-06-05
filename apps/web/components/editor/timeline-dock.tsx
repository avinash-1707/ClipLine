"use client";

/**
 * Bottom dock. The interactive multi-track timeline arrives in its own unit;
 * this lays out the ruler/track scaffolding it will inhabit.
 */
export function TimelineDock() {
  return (
    <div className="flex h-full flex-col">
      {/* ruler strip */}
      <div className="flex h-8 shrink-0 items-end gap-px overflow-hidden border-b border-border px-3 pb-1.5">
        {Array.from({ length: 60 }, (_, i) => (
          <div
            key={i}
            className={
              i % 10 === 0
                ? "h-3 w-px shrink-0 bg-muted-foreground/50"
                : "h-1.5 w-px shrink-0 bg-muted-foreground/25"
            }
            style={{ marginRight: "max(0.75rem, 1.4%)" }}
          />
        ))}
      </div>
      {/* empty tracks */}
      <div className="flex flex-1 flex-col justify-center gap-2 px-3 py-3">
        {["V1", "V2", "A1"].map((label) => (
          <div key={label} className="flex items-center gap-3">
            <span className="label-mono w-7 shrink-0 text-right text-muted-foreground">
              {label}
            </span>
            <div className="h-9 flex-1 rounded-md border border-dashed border-border bg-muted/20" />
          </div>
        ))}
      </div>
      <p className="label-mono shrink-0 px-3 pb-2 text-center text-muted-foreground/60">
        Drag media here — timeline editing arrives next
      </p>
    </div>
  );
}
