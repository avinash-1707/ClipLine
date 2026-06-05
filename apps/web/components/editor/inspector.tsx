"use client";

import {
  FPS,
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
