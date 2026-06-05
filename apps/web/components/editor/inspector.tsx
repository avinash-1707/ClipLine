"use client";

import {
  FPS,
  type GraphicClip,
  type TextAnimation,
  type TextClip,
  type Transition,
  type VideoClip,
} from "@clipline/timeline";
import { SlidersHorizontal } from "lucide-react";
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
const TEXT_ANIMATIONS = [
  "none",
  "fade-in",
  "slide-up",
  "pop",
  "typewriter",
] as const;

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

  return (
    <>
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
  return (
    <>
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
      </Section>

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

      <Section title="Animation">
        <Select
          value={clip.animation.preset}
          onValueChange={(v) =>
            update(clip.id, {
              animation: {
                ...clip.animation,
                preset: v as TextClip["animation"]["preset"],
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
                {a}
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
      </Section>
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
