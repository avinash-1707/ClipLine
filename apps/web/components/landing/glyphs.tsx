/**
 * Custom monochrome glyphs for the feature row, drawn in the editor's own
 * visual language (tracks, frames, captions) rather than generic icons.
 * Stroke-based, inherit currentColor, 1.5 stroke to match the Lucide set.
 */

const base = {
  viewBox: "0 0 40 40",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Stacked timeline tracks with clip blocks and a playhead. */
export function GlyphTimeline({ className }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="9" width="13" height="6" rx="1.5" />
      <rect x="19" y="9" width="17" height="6" rx="1.5" />
      <rect x="4" y="19" width="9" height="6" rx="1.5" />
      <rect x="15" y="19" width="14" height="6" rx="1.5" />
      <rect x="4" y="29" width="20" height="6" rx="1.5" />
      <line x1="24" y1="5" x2="24" y2="38" strokeWidth="1.25" />
      <circle cx="24" cy="5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Two identical frames joined by an equals — preview equals export. */
export function GlyphMirror({ className }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="8" width="12" height="24" rx="2" />
      <rect x="24" y="8" width="12" height="24" rx="2" />
      <line x1="18.5" y1="17" x2="21.5" y2="17" />
      <line x1="18.5" y1="23" x2="21.5" y2="23" />
      <path d="M7 26 l3 -4 l2.5 2.5 l-5.5 5.5 z" fill="currentColor" stroke="none" opacity="0.55" />
      <path d="M27 26 l3 -4 l2.5 2.5 l-5.5 5.5 z" fill="currentColor" stroke="none" opacity="0.55" />
    </svg>
  );
}

/** A caption baseline with a moving text bar and motion chevrons. */
export function GlyphCaption({ className }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="6" width="32" height="28" rx="2.5" />
      <line x1="10" y1="24" x2="30" y2="24" strokeOpacity="0.4" />
      <rect x="13" y="19" width="14" height="6" rx="1.5" fill="currentColor" stroke="none" opacity="0.9" />
      <path d="M9 16.5 l2.5 2.5 l-2.5 2.5" strokeOpacity="0.55" />
      <path d="M31 16.5 l-2.5 2.5 l2.5 2.5" strokeOpacity="0.55" />
    </svg>
  );
}
