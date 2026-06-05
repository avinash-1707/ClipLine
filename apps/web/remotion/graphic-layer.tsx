import type { GraphicClip, TextAnimation } from "@clipline/timeline";
import { AbsoluteFill, useCurrentFrame } from "remotion";

/** Same entrance math as the preview's entranceState (parity invariant). */
function entrance(anim: TextAnimation, localFrame: number) {
  const p =
    anim.preset === "none"
      ? 1
      : Math.min(localFrame / anim.durationInFrames, 1);
  const easeOut = 1 - (1 - p) ** 3;
  switch (anim.preset) {
    case "fade-in":
      return { alpha: easeOut, offsetY: 0, scale: 1 };
    case "slide-up":
      return { alpha: easeOut, offsetY: (1 - easeOut) * 60, scale: 1 };
    case "pop":
      return { alpha: Math.min(p * 2, 1), offsetY: 0, scale: 0.8 + 0.2 * easeOut };
    default:
      return { alpha: 1, offsetY: 0, scale: 1 };
  }
}

/** Graphic clip renderer. Visual math mirrors the canvas preview exactly. */
export function GraphicLayer({ clip }: { clip: GraphicClip }) {
  const localFrame = useCurrentFrame();
  const g = clip.graphic;

  if (g.preset === "overlay") {
    return (
      <AbsoluteFill
        style={{
          opacity: clip.opacity,
          background: g.colorB
            ? `linear-gradient(${g.angleDeg}deg, ${g.color}, ${g.colorB})`
            : g.color,
        }}
      />
    );
  }

  if (g.preset === "progress-bar") {
    const p =
      clip.durationInFrames > 1
        ? Math.min(localFrame / (clip.durationInFrames - 1), 1)
        : 1;
    return (
      <AbsoluteFill style={{ opacity: clip.opacity }}>
        <div
          style={{
            position: "absolute",
            [g.edge]: 0,
            left: 0,
            width: `${p * 100}%`,
            height: g.thickness,
            backgroundColor: g.color,
          }}
        />
      </AbsoluteFill>
    );
  }

  if (g.preset === "lower-third") {
    const e = entrance(g.animation, localFrame);
    return (
      <AbsoluteFill style={{ opacity: clip.opacity * e.alpha }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `calc(${g.y * 100}% + ${e.offsetY}px)`,
            height: `${g.height * 100}%`,
            backgroundColor: g.color,
            borderTop: `max(${g.height * 1920 * 0.06}px, 4px) solid ${g.accentColor}`,
            boxSizing: "border-box",
          }}
        />
      </AbsoluteFill>
    );
  }

  if (g.preset === "badge") {
    const e = entrance(g.animation, localFrame);
    return (
      <AbsoluteFill style={{ opacity: clip.opacity * e.alpha }}>
        <div
          style={{
            position: "absolute",
            left: `${g.position.x * 100}%`,
            top: `${g.position.y * 100}%`,
            transform: `translate(-50%, -50%) translateY(${e.offsetY}px) scale(${e.scale})`,
            backgroundColor: g.color,
            color: g.textColor,
            fontSize: g.fontSize,
            fontWeight: 600,
            lineHeight: 1,
            padding: `${g.fontSize * 0.35}px ${g.fontSize * 0.6}px`,
            borderRadius: 9999,
            whiteSpace: "nowrap",
          }}
        >
          {g.label}
        </div>
      </AbsoluteFill>
    );
  }

  // shape
  const e = entrance(g.animation, localFrame);
  const lineH = Math.max(g.size.h * 1920 * 0.06, 2);
  return (
    <AbsoluteFill style={{ opacity: clip.opacity * e.alpha }}>
      <div
        style={{
          position: "absolute",
          left: `${g.position.x * 100}%`,
          top: `${g.position.y * 100}%`,
          transform: `translate(-50%, -50%) translateY(${e.offsetY}px) scale(${e.scale})`,
          width: `${g.size.w * 100}%`,
          height: g.shape === "line" ? lineH : `${g.size.h * 100}%`,
          backgroundColor: g.color,
          borderRadius: g.shape === "circle" ? "50%" : 0,
        }}
      />
    </AbsoluteFill>
  );
}
