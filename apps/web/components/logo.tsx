/**
 * Clipline mark: a film reel with a trailing strip, clapper notch on top.
 * Inherits currentColor so it follows the theme everywhere it is used.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* reel */}
      <circle cx="11" cy="12" r="8" />
      {/* hub + spoke holes */}
      <circle cx="11" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.2" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="11" cy="16.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6.8" cy="12" r="1.5" fill="currentColor" stroke="none" />
      {/* clapper notch */}
      <path d="M14.5 4.6 L17.8 2.8" />
      {/* film strip trailing out of the reel */}
      <path d="M17.6 17.4c1.2 1.5 2.7 2.4 4.4 2.6" />
    </svg>
  );
}
