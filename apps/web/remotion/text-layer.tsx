import {
  resolveTextAnimation,
  TEXT_LINE_HEIGHT,
  wordRevealAlpha,
  type TextClip,
} from "@clipline/timeline";
import { AbsoluteFill, useCurrentFrame } from "remotion";

/**
 * Text clip renderer for the export. Animation math (entrance + exit) comes
 * from the shared `resolveTextAnimation` the canvas preview also uses, and the
 * box is sized by CSS — which the ADR 0001 spike proved equals the canvas
 * `measureText` geometry to sub-pixel — so preview and export stay identical.
 */
export function TextLayer({ clip }: { clip: TextClip }) {
  const localFrame = useCurrentFrame();
  const anim = resolveTextAnimation(
    clip.animation,
    localFrame,
    clip.durationInFrames,
  );
  if (anim.alpha <= 0) return null;

  const { bg, border, cornerRadius, padding } = clip.box;
  const hasBox = bg.enabled || border.enabled;
  const pad = hasBox ? padding : 0;
  const fontWeight = clip.fontStyle.bold ? 700 : 600;
  const fontStyle = clip.fontStyle.italic ? "italic" : "normal";
  const textDecoration = clip.fontStyle.underline ? "underline" : "none";

  const content =
    clip.animation.preset === "word-reveal" ? (
      <WordReveal text={clip.text} progress={anim.progress} />
    ) : clip.animation.preset === "typewriter" ? (
      clip.text.slice(0, Math.ceil(clip.text.length * anim.progress))
    ) : (
      clip.text
    );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${clip.position.x * 100}%`,
          top: `${clip.position.y * 100}%`,
          transform: `translate(-50%, -50%) translate(${anim.offsetX}px, ${anim.offsetY}px) scale(${anim.scale})`,
          opacity: anim.alpha,
          filter: anim.blur > 0 ? `blur(${anim.blur}px)` : undefined,
          padding: pad,
          boxSizing: "border-box",
          borderRadius: cornerRadius || undefined,
          outline:
            border.enabled && border.width > 0
              ? `${border.width}px solid ${border.color}`
              : undefined,
          color: clip.color,
          fontFamily: `'${clip.fontFamily}', sans-serif`,
          fontSize: clip.fontSize,
          fontWeight,
          fontStyle,
          textDecoration,
          lineHeight: TEXT_LINE_HEIGHT,
          textAlign: clip.align,
          whiteSpace: "pre",
        }}
      >
        {bg.enabled && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: bg.color,
              opacity: bg.opacity,
              borderRadius: cornerRadius || undefined,
            }}
          />
        )}
        <span style={{ position: "relative" }}>{content}</span>
      </div>
    </AbsoluteFill>
  );
}

/** Per-word staggered reveal, mirroring the canvas drawWordReveal. */
function WordReveal({ text, progress }: { text: string; progress: number }) {
  const lines = text.split("\n");
  const totalWords = lines.reduce(
    (n, line) => n + line.split(/\s+/).filter(Boolean).length,
    0,
  );
  let wordIndex = 0;
  return (
    <>
      {lines.map((line, li) => {
        const tokens = line.split(" ");
        return (
          <span key={li}>
            {li > 0 ? "\n" : null}
            {tokens.map((token, ti) => {
              if (token === "") return ti > 0 ? " " : null;
              const a = wordRevealAlpha(progress, wordIndex, totalWords);
              wordIndex++;
              return (
                <span key={ti} style={{ opacity: a }}>
                  {ti > 0 ? " " : ""}
                  {token}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
}
