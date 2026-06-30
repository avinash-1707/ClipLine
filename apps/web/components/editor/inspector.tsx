"use client";

import {
  clampFraming,
  editCaptionWords,
  FPS,
  MAX_FRAMING_ZOOM,
  MIN_FRAMING_ZOOM,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  type CaptionClip,
  type Framing,
  type GraphicClip,
  type TextAnimation,
  type TextAnimationPreset,
  type TextClip,
  type TextExitPreset,
  type Transition,
  type VideoClip,
} from "@clipline/timeline";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  SlidersHorizontal,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { adjacentNextClip } from "@/lib/timeline-ops";
import { selectSelectedClip, useTimelineStore } from "@/store/timeline";

/** Compact labelled slider row used across all inspector sections. */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="label-mono text-muted-foreground">{label}</span>
        <span className="label-mono tabular-nums text-foreground/70">
          {display ?? value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0]! : (v as number))}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-border px-4 py-4">
      <h3 className="label-mono text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="label-mono text-muted-foreground">{label}</span>
      <input
        type="color"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-12 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
      />
    </div>
  );
}

/** Entrance animation preset + duration, shared by text and graphic clips. */
function AnimationControls({
  animation,
  presets,
  onChange,
}: {
  animation: TextAnimation;
  presets: readonly string[];
  onChange: (a: TextAnimation) => void;
}) {
  return (
    <>
      <Select
        value={animation.preset}
        onValueChange={(v) =>
          onChange({ ...animation, preset: v as TextAnimation["preset"] })
        }
      >
        <SelectTrigger className="w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {animation.preset !== "none" && (
        <SliderRow
          label="Duration"
          value={animation.durationInFrames}
          min={5}
          max={90}
          step={1}
          display={`${(animation.durationInFrames / FPS).toFixed(2)}s`}
          onChange={(v) => onChange({ ...animation, durationInFrames: v })}
        />
      )}
    </>
  );
}

const TRANSITION_PRESETS = ["none", "fade", "wipe", "slide"] as const;
const DIRECTIONS = ["left", "right", "up", "down"] as const;

const TEXT_ANIMATION_LABELS: Record<TextAnimationPreset, string> = {
  none: "None",
  "fade-in": "Fade in",
  "slide-up": "Slide up",
  pop: "Pop",
  typewriter: "Typewriter",
  "blur-in": "Blur in",
  "slide-in-right": "Slide in (right)",
  "scale-pop": "Scale pop",
  "word-reveal": "Word reveal",
};

const TEXT_ANIMATIONS: readonly TextAnimationPreset[] = [
  "none",
  "fade-in",
  "slide-up",
  "pop",
  "typewriter",
  "blur-in",
  "slide-in-right",
  "scale-pop",
  "word-reveal",
];

const TEXT_EXIT_LABELS: Record<TextExitPreset, string> = {
  none: "None",
  "fade-out": "Fade out",
  "slide-out-up": "Slide out (up)",
  "scale-out": "Scale out",
};

const TEXT_EXIT_PRESETS: readonly TextExitPreset[] = [
  "none",
  "fade-out",
  "slide-out-up",
  "scale-out",
];

function VideoInspector({ clip }: { clip: VideoClip }) {
  const update = useTimelineStore((s) => s.updateClip);
  const timeline = useTimelineStore((s) => s.timeline);
  const hasNeighbour =
    timeline != null && adjacentNextClip(timeline, clip.id) != null;
  const transition = clip.transitionToNext;

  const patchGrade = (key: keyof VideoClip["colorGrade"], v: number) =>
    update(clip.id, { colorGrade: { ...clip.colorGrade, [key]: v } });

  const patchTransition = (patch: Partial<Transition>) =>
    update(clip.id, {
      transitionToNext: {
        preset: transition?.preset ?? "fade",
        durationInFrames: transition?.durationInFrames ?? 15,
        direction: transition?.direction ?? "left",
        ...patch,
      },
    });

  const framing = clip.framing;
  const dims = useTimelineStore((s) => s.assetsById[clip.assetId]);
  // Clamp through the shared resolver so the stored value matches what the
  // renderer draws (no out-of-range offsets, no thumb/render mismatch). Falls
  // back to the raw patch when source dimensions aren't known yet.
  const patchFraming = (patch: Partial<VideoClip["framing"]>) => {
    const next: Framing = { ...framing, ...patch };
    if (dims?.width && dims?.height) {
      const c = clampFraming({
        srcW: dims.width,
        srcH: dims.height,
        frameW: OUTPUT_WIDTH,
        frameH: OUTPUT_HEIGHT,
        framing: next,
      });
      update(clip.id, { framing: { zoom: next.zoom, ...c } });
    } else {
      update(clip.id, { framing: next });
    }
  };
  const isFramed =
    framing.zoom !== 1 || framing.offsetX !== 0 || framing.offsetY !== 0;

  return (
    <>
      <Section title="Framing">
        <SliderRow
          label="Zoom"
          value={framing.zoom}
          min={MIN_FRAMING_ZOOM}
          max={MAX_FRAMING_ZOOM}
          step={0.01}
          display={`${Math.round(framing.zoom * 100)}%`}
          onChange={(v) => patchFraming({ zoom: v })}
        />
        <SliderRow
          label="Pan X"
          value={framing.offsetX}
          min={-OUTPUT_WIDTH}
          max={OUTPUT_WIDTH}
          step={1}
          display={`${Math.round(framing.offsetX)}px`}
          onChange={(v) => patchFraming({ offsetX: v })}
        />
        <SliderRow
          label="Pan Y"
          value={framing.offsetY}
          min={-OUTPUT_HEIGHT}
          max={OUTPUT_HEIGHT}
          step={1}
          display={`${Math.round(framing.offsetY)}px`}
          onChange={(v) => patchFraming({ offsetY: v })}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={!isFramed}
          onClick={() =>
            update(clip.id, { framing: { zoom: 1, offsetX: 0, offsetY: 0 } })
          }
        >
          Reset framing
        </Button>
      </Section>

      <Section title="Audio">
        <SliderRow
          label="Gain"
          value={clip.gain}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => update(clip.id, { gain: v })}
        />
      </Section>

      <Section title="Color">
        <SliderRow
          label="Brightness"
          value={clip.colorGrade.brightness}
          min={-1}
          max={1}
          step={0.02}
          onChange={(v) => patchGrade("brightness", v)}
        />
        <SliderRow
          label="Contrast"
          value={clip.colorGrade.contrast}
          min={-1}
          max={1}
          step={0.02}
          onChange={(v) => patchGrade("contrast", v)}
        />
        <SliderRow
          label="Saturation"
          value={clip.colorGrade.saturation}
          min={-1}
          max={1}
          step={0.02}
          onChange={(v) => patchGrade("saturation", v)}
        />
      </Section>

      <Section title="Transition to next">
        {hasNeighbour ? (
          <>
            <Select
              value={transition?.preset ?? "none"}
              onValueChange={(v) => {
                if (v === "none") update(clip.id, { transitionToNext: null });
                else patchTransition({ preset: v as Transition["preset"] });
              }}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSITION_PRESETS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {transition && (
              <>
                <SliderRow
                  label="Duration"
                  value={transition.durationInFrames}
                  min={5}
                  max={60}
                  step={1}
                  display={`${(transition.durationInFrames / FPS).toFixed(2)}s`}
                  onChange={(v) => patchTransition({ durationInFrames: v })}
                />
                {transition.preset !== "fade" && (
                  <Select
                    value={transition.direction}
                    onValueChange={(v) =>
                      patchTransition({
                        direction: v as Transition["direction"],
                      })
                    }
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECTIONS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Butt another clip up against this one to add a transition.
          </p>
        )}
      </Section>
    </>
  );
}

function TextInspector({ clip }: { clip: TextClip }) {
  const update = useTimelineStore((s) => s.updateClip);

  const boxActive = clip.box.bg.enabled || clip.box.border.enabled;

  return (
    <>
      {/* ── Text ─────────────────────────────────────────────────── */}
      <Section title="Text">
        <Input
          value={clip.text}
          onChange={(e) => update(clip.id, { text: e.target.value })}
        />
        <SliderRow
          label="Size"
          value={clip.fontSize}
          min={16}
          max={240}
          step={2}
          display={`${clip.fontSize}px`}
          onChange={(v) => update(clip.id, { fontSize: v })}
        />
        <div className="flex items-center justify-between">
          <span className="label-mono text-muted-foreground">Color</span>
          <input
            type="color"
            value={clip.color}
            aria-label="Text color"
            onChange={(e) => update(clip.id, { color: e.target.value })}
            className="h-7 w-12 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          />
        </div>

        {/* Font style: B / I / U toggles */}
        <div className="flex items-center justify-between">
          <span className="label-mono text-muted-foreground">Style</span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-pressed={clip.fontStyle.bold}
              className={
                clip.fontStyle.bold
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : ""
              }
              onClick={() =>
                update(clip.id, {
                  fontStyle: {
                    ...clip.fontStyle,
                    bold: !clip.fontStyle.bold,
                  },
                })
              }
            >
              <Bold className="size-3.5 font-bold" strokeWidth={2.5} />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-pressed={clip.fontStyle.italic}
              className={
                clip.fontStyle.italic
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : ""
              }
              onClick={() =>
                update(clip.id, {
                  fontStyle: {
                    ...clip.fontStyle,
                    italic: !clip.fontStyle.italic,
                  },
                })
              }
            >
              <Italic className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-pressed={clip.fontStyle.underline}
              className={
                clip.fontStyle.underline
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : ""
              }
              onClick={() =>
                update(clip.id, {
                  fontStyle: {
                    ...clip.fontStyle,
                    underline: !clip.fontStyle.underline,
                  },
                })
              }
            >
              <Underline className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Alignment: Left / Center / Right segmented toggle */}
        <div className="flex items-center justify-between">
          <span className="label-mono text-muted-foreground">Align</span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-pressed={clip.align === "left"}
              className={
                clip.align === "left"
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : ""
              }
              onClick={() => update(clip.id, { align: "left" })}
            >
              <AlignLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-pressed={clip.align === "center"}
              className={
                clip.align === "center"
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : ""
              }
              onClick={() => update(clip.id, { align: "center" })}
            >
              <AlignCenter className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-pressed={clip.align === "right"}
              className={
                clip.align === "right"
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : ""
              }
              onClick={() => update(clip.id, { align: "right" })}
            >
              <AlignRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </Section>

      {/* ── Background ───────────────────────────────────────────── */}
      <Section title="Background">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <span className="label-mono text-muted-foreground">Enable</span>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={clip.box.bg.enabled}
            className={
              clip.box.bg.enabled
                ? "border-foreground/30 bg-foreground/10 text-foreground"
                : ""
            }
            onClick={() =>
              update(clip.id, {
                box: {
                  ...clip.box,
                  bg: { ...clip.box.bg, enabled: !clip.box.bg.enabled },
                },
              })
            }
          >
            {clip.box.bg.enabled ? "On" : "Off"}
          </Button>
        </div>

        {clip.box.bg.enabled && (
          <>
            <ColorRow
              label="Color"
              value={clip.box.bg.color}
              onChange={(v) =>
                update(clip.id, {
                  box: {
                    ...clip.box,
                    bg: { ...clip.box.bg, color: v },
                  },
                })
              }
            />
            <SliderRow
              label="Opacity"
              value={clip.box.bg.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) =>
                update(clip.id, {
                  box: {
                    ...clip.box,
                    bg: { ...clip.box.bg, opacity: v },
                  },
                })
              }
            />
          </>
        )}

        {/* Padding + corner radius shown when bg OR border is active */}
        {boxActive && (
          <>
            <SliderRow
              label="Padding"
              value={clip.box.padding}
              min={0}
              max={256}
              step={1}
              display={`${Math.round(clip.box.padding)}px`}
              onChange={(v) =>
                update(clip.id, { box: { ...clip.box, padding: v } })
              }
            />
            <SliderRow
              label="Radius"
              value={clip.box.cornerRadius}
              min={0}
              max={256}
              step={1}
              display={`${Math.round(clip.box.cornerRadius)}px`}
              onChange={(v) =>
                update(clip.id, { box: { ...clip.box, cornerRadius: v } })
              }
            />
          </>
        )}
      </Section>

      {/* ── Border ───────────────────────────────────────────────── */}
      <Section title="Border">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <span className="label-mono text-muted-foreground">Enable</span>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={clip.box.border.enabled}
            className={
              clip.box.border.enabled
                ? "border-foreground/30 bg-foreground/10 text-foreground"
                : ""
            }
            onClick={() =>
              update(clip.id, {
                box: {
                  ...clip.box,
                  border: {
                    ...clip.box.border,
                    enabled: !clip.box.border.enabled,
                  },
                },
              })
            }
          >
            {clip.box.border.enabled ? "On" : "Off"}
          </Button>
        </div>

        {clip.box.border.enabled && (
          <>
            <ColorRow
              label="Color"
              value={clip.box.border.color}
              onChange={(v) =>
                update(clip.id, {
                  box: {
                    ...clip.box,
                    border: { ...clip.box.border, color: v },
                  },
                })
              }
            />
            <SliderRow
              label="Width"
              value={clip.box.border.width}
              min={0}
              max={64}
              step={1}
              display={`${Math.round(clip.box.border.width)}px`}
              onChange={(v) =>
                update(clip.id, {
                  box: {
                    ...clip.box,
                    border: { ...clip.box.border, width: v },
                  },
                })
              }
            />
            {/* Padding + radius also shown here when bg is off but border is on */}
            {!clip.box.bg.enabled && (
              <>
                <SliderRow
                  label="Padding"
                  value={clip.box.padding}
                  min={0}
                  max={256}
                  step={1}
                  display={`${Math.round(clip.box.padding)}px`}
                  onChange={(v) =>
                    update(clip.id, { box: { ...clip.box, padding: v } })
                  }
                />
                <SliderRow
                  label="Radius"
                  value={clip.box.cornerRadius}
                  min={0}
                  max={256}
                  step={1}
                  display={`${Math.round(clip.box.cornerRadius)}px`}
                  onChange={(v) =>
                    update(clip.id, { box: { ...clip.box, cornerRadius: v } })
                  }
                />
              </>
            )}
          </>
        )}
      </Section>

      {/* ── Position ─────────────────────────────────────────────── */}
      <Section title="Position">
        <SliderRow
          label="X"
          value={clip.position.x}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            update(clip.id, { position: { ...clip.position, x: v } })
          }
        />
        <SliderRow
          label="Y"
          value={clip.position.y}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            update(clip.id, { position: { ...clip.position, y: v } })
          }
        />
      </Section>

      {/* ── Animation ────────────────────────────────────────────── */}
      <Section title="Animation">
        {/* Entrance */}
        <Select
          value={clip.animation.preset}
          onValueChange={(v) =>
            update(clip.id, {
              animation: {
                ...clip.animation,
                preset: v as TextAnimationPreset,
              },
            })
          }
        >
          <SelectTrigger className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_ANIMATIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {TEXT_ANIMATION_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clip.animation.preset !== "none" && (
          <SliderRow
            label="Duration"
            value={clip.animation.durationInFrames}
            min={5}
            max={90}
            step={1}
            display={`${(clip.animation.durationInFrames / FPS).toFixed(2)}s`}
            onChange={(v) =>
              update(clip.id, {
                animation: { ...clip.animation, durationInFrames: v },
              })
            }
          />
        )}

        {/* Exit */}
        <Select
          value={clip.animation.exit}
          onValueChange={(v) =>
            update(clip.id, {
              animation: {
                ...clip.animation,
                exit: v as TextExitPreset,
              },
            })
          }
        >
          <SelectTrigger className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_EXIT_PRESETS.map((e) => (
              <SelectItem key={e} value={e}>
                {TEXT_EXIT_LABELS[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clip.animation.exit !== "none" && (
          <SliderRow
            label="Exit duration"
            value={clip.animation.exitDurationInFrames}
            min={5}
            max={90}
            step={1}
            display={`${(clip.animation.exitDurationInFrames / FPS).toFixed(2)}s`}
            onChange={(v) =>
              update(clip.id, {
                animation: { ...clip.animation, exitDurationInFrames: v },
              })
            }
          />
        )}
      </Section>
    </>
  );
}

function CaptionInspector({ clip }: { clip: CaptionClip }) {
  const update = useTimelineStore((s) => s.updateClip);

  // Derive the editable text from the word array (display only; timing
  // is preserved when word count is unchanged — see editCaptionWords).
  const wordsText = clip.words.map((w) => w.text).join(" ");

  const durationSec = (clip.durationInFrames / FPS).toFixed(2);
  const inFrame = clip.startFrame;
  const outFrame = clip.startFrame + clip.durationInFrames;

  return (
    <>
      {/* ── Words ─────────────────────────────────────────────────── */}
      <Section title="Words">
        <textarea
          value={wordsText}
          aria-label="Caption words"
          rows={2}
          onChange={(e) =>
            update(clip.id, {
              words: editCaptionWords(clip.words, e.target.value),
            })
          }
          className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </Section>

      {/* ── Style ─────────────────────────────────────────────────── */}
      <Section title="Style">
        <SliderRow
          label="Size"
          value={clip.style.fontSize}
          min={48}
          max={128}
          step={2}
          display={`${clip.style.fontSize}px`}
          onChange={(v) =>
            update(clip.id, { style: { ...clip.style, fontSize: v } })
          }
        />
        <ColorRow
          label="Fill"
          value={clip.style.color}
          onChange={(v) =>
            update(clip.id, { style: { ...clip.style, color: v } })
          }
        />
        <ColorRow
          label="Active word"
          value={clip.style.activeColor}
          onChange={(v) =>
            update(clip.id, { style: { ...clip.style, activeColor: v } })
          }
        />
        <SliderRow
          label="Stroke"
          value={clip.style.strokeWidth}
          min={0}
          max={16}
          step={0.5}
          display={`${clip.style.strokeWidth}px`}
          onChange={(v) =>
            update(clip.id, { style: { ...clip.style, strokeWidth: v } })
          }
        />
      </Section>

      {/* ── Position ──────────────────────────────────────────────── */}
      <Section title="Position">
        <SliderRow
          label="Y"
          value={clip.position.y}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            update(clip.id, { position: { ...clip.position, y: v } })
          }
        />
      </Section>

      {/* ── Timing (read-only) ────────────────────────────────────── */}
      <section className="space-y-2 border-b border-border px-4 py-4">
        <h3 className="label-mono text-muted-foreground">Timing</h3>
        <div className="flex items-baseline justify-between">
          <span className="label-mono text-muted-foreground">In</span>
          <span className="label-mono tabular-nums text-foreground/70">
            {inFrame}f
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="label-mono text-muted-foreground">Out</span>
          <span className="label-mono tabular-nums text-foreground/70">
            {outFrame}f
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="label-mono text-muted-foreground">Duration</span>
          <span className="label-mono tabular-nums text-foreground/70">
            {durationSec}s
          </span>
        </div>
      </section>
    </>
  );
}

const GRAPHIC_ANIMATIONS = ["none", "fade-in", "slide-up", "pop"] as const;

function GraphicInspector({ clip }: { clip: GraphicClip }) {
  const update = useTimelineStore((s) => s.updateClip);
  const g = clip.graphic;
  const patch = (params: Partial<GraphicClip["graphic"]>) =>
    update(clip.id, {
      graphic: { ...g, ...params } as GraphicClip["graphic"],
    });

  return (
    <>
      <Section title={g.preset.replace("-", " ")}>
        {g.preset === "overlay" && (
          <>
            <ColorRow
              label="Color"
              value={g.color}
              onChange={(v) => patch({ color: v })}
            />
            <Select
              value={g.colorB ? "gradient" : "solid"}
              onValueChange={(v) =>
                patch({ colorB: v === "gradient" ? "#FFFFFF" : null })
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">solid</SelectItem>
                <SelectItem value="gradient">gradient</SelectItem>
              </SelectContent>
            </Select>
            {g.colorB && (
              <>
                <ColorRow
                  label="Color B"
                  value={g.colorB}
                  onChange={(v) => patch({ colorB: v })}
                />
                <SliderRow
                  label="Angle"
                  value={g.angleDeg}
                  min={0}
                  max={360}
                  step={5}
                  display={`${g.angleDeg}°`}
                  onChange={(v) => patch({ angleDeg: v })}
                />
              </>
            )}
          </>
        )}

        {g.preset === "shape" && (
          <>
            <Select
              value={g.shape}
              onValueChange={(v) => patch({ shape: v as typeof g.shape })}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["rect", "circle", "line"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ColorRow
              label="Color"
              value={g.color}
              onChange={(v) => patch({ color: v })}
            />
            <SliderRow
              label="X"
              value={g.position.x}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => patch({ position: { ...g.position, x: v } })}
            />
            <SliderRow
              label="Y"
              value={g.position.y}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => patch({ position: { ...g.position, y: v } })}
            />
            <SliderRow
              label="Width"
              value={g.size.w}
              min={0.01}
              max={1}
              step={0.01}
              onChange={(v) => patch({ size: { ...g.size, w: v } })}
            />
            <SliderRow
              label="Height"
              value={g.size.h}
              min={0.005}
              max={1}
              step={0.005}
              onChange={(v) => patch({ size: { ...g.size, h: v } })}
            />
          </>
        )}

        {g.preset === "progress-bar" && (
          <>
            <ColorRow
              label="Color"
              value={g.color}
              onChange={(v) => patch({ color: v })}
            />
            <SliderRow
              label="Thickness"
              value={g.thickness}
              min={2}
              max={120}
              step={1}
              display={`${g.thickness}px`}
              onChange={(v) => patch({ thickness: v })}
            />
            <Select
              value={g.edge}
              onValueChange={(v) => patch({ edge: v as typeof g.edge })}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">top</SelectItem>
                <SelectItem value="bottom">bottom</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}

        {g.preset === "lower-third" && (
          <>
            <ColorRow
              label="Band"
              value={g.color}
              onChange={(v) => patch({ color: v })}
            />
            <ColorRow
              label="Accent"
              value={g.accentColor}
              onChange={(v) => patch({ accentColor: v })}
            />
            <SliderRow
              label="Height"
              value={g.height}
              min={0.02}
              max={0.3}
              step={0.005}
              onChange={(v) => patch({ height: v })}
            />
            <SliderRow
              label="Y"
              value={g.y}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => patch({ y: v })}
            />
          </>
        )}

        {g.preset === "badge" && (
          <>
            <Input
              value={g.label}
              onChange={(e) => patch({ label: e.target.value })}
            />
            <ColorRow
              label="Pill"
              value={g.color}
              onChange={(v) => patch({ color: v })}
            />
            <ColorRow
              label="Text"
              value={g.textColor}
              onChange={(v) => patch({ textColor: v })}
            />
            <SliderRow
              label="Size"
              value={g.fontSize}
              min={16}
              max={120}
              step={2}
              display={`${g.fontSize}px`}
              onChange={(v) => patch({ fontSize: v })}
            />
            <SliderRow
              label="X"
              value={g.position.x}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => patch({ position: { ...g.position, x: v } })}
            />
            <SliderRow
              label="Y"
              value={g.position.y}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => patch({ position: { ...g.position, y: v } })}
            />
          </>
        )}
      </Section>

      <Section title="Appearance">
        <SliderRow
          label="Opacity"
          value={clip.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update(clip.id, { opacity: v })}
        />
        {(g.preset === "shape" ||
          g.preset === "lower-third" ||
          g.preset === "badge") && (
          <AnimationControls
            animation={g.animation}
            presets={GRAPHIC_ANIMATIONS}
            onChange={(animation) => patch({ animation })}
          />
        )}
      </Section>
    </>
  );
}

export function Inspector() {
  const clip = useTimelineStore(selectSelectedClip);
  const update = useTimelineStore((s) => s.updateClip);

  if (!clip) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
          <span className="label-mono text-muted-foreground">Inspector</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
          <SlidersHorizontal
            className="size-5 text-muted-foreground/60"
            strokeWidth={1.5}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Select a clip on the timeline to edit trim, gain and color.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="label-mono text-muted-foreground">Inspector</span>
        <span className="label-mono text-foreground/60">{clip.kind}</span>
      </div>
      {clip.kind === "video" && <VideoInspector clip={clip} />}
      {clip.kind === "text" && <TextInspector clip={clip} />}
      {clip.kind === "graphic" && <GraphicInspector clip={clip} />}
      {clip.kind === "caption" && <CaptionInspector clip={clip} />}
      {clip.kind === "audio" && (
        <Section title="Audio">
          <SliderRow
            label="Gain"
            value={clip.gain}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => update(clip.id, { gain: v })}
          />
        </Section>
      )}
    </div>
  );
}
