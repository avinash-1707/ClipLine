import type { TextClip } from "@clipline/timeline";
import { AbsoluteFill, useCurrentFrame } from "remotion";

/**
 * Text clip renderer. Animation math mirrors the canvas preview exactly:
 * cubic ease-out over `animation.durationInFrames` local frames.
 */
export function TextLayer({ clip }: { clip: TextClip }) {
  const localFrame = useCurrentFrame();
  const anim = clip.animation;
  const p =
    anim.preset === "none"
      ? 1
      : Math.min(localFrame / anim.durationInFrames, 1);
  const easeOut = 1 - (1 - p) ** 3;

  let opacity = 1;
  let offsetY = 0;
  let scale = 1;
  let text = clip.text;
  switch (anim.preset) {
    case "fade-in":
      opacity = easeOut;
      break;
    case "slide-up":
      opacity = easeOut;
      offsetY = (1 - easeOut) * 60;
      break;
    case "pop":
      opacity = Math.min(p * 2, 1);
      scale = 0.8 + 0.2 * easeOut;
      break;
    case "typewriter":
      text = clip.text.slice(0, Math.ceil(clip.text.length * p));
      break;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${clip.position.x * 100}%`,
          top: `${clip.position.y * 100}%`,
          transform: `translate(-50%, -50%) translateY(${offsetY}px) scale(${scale})`,
          opacity,
          color: clip.color,
          fontFamily: `'${clip.fontFamily}', sans-serif`,
          fontSize: clip.fontSize,
          fontWeight: 600,
          lineHeight: 1.2,
          textAlign: "center",
          whiteSpace: "pre",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}
