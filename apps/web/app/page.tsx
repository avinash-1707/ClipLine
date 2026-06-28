import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import {
  GlyphCaption,
  GlyphMirror,
  GlyphTimeline,
} from "@/components/landing/glyphs";
import { HeroPreview } from "@/components/landing/hero-preview";
import { Reveal } from "@/components/landing/reveal";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { TimelineArt } from "@/components/landing/timeline-art";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    n: "01",
    title: "Cut on a real timeline",
    body: "Multi-track editing with trim, split and reorder — tuned to stay at 60fps for a full two-minute reel.",
    Glyph: GlyphTimeline,
  },
  {
    n: "02",
    title: "What you see is what ships",
    body: "Preview and export share the same render components. The MP4 you download is the preview you watched.",
    Glyph: GlyphMirror,
  },
  {
    n: "03",
    title: "Captions that move",
    body: "Animated text presets, transitions and per-clip color — all serializable, all reproducible.",
    Glyph: GlyphCaption,
  },
] as const;

const PIPELINE = [
  ["00", "Upload", "Drop a clip. Ingest normalizes it and builds a thumbnail and waveform in seconds."],
  ["01", "Arrange", "Drag onto tracks. Trim edges, split at the playhead, reorder by feel."],
  ["02", "Caption", "Layer animated text, transitions and per-clip color grading."],
  ["03", "Export", "Render server-side with Remotion. Watch progress, download the MP4."],
] as const;

const SPECS = [
  ["Output", "1080 × 1920 · H.264"],
  ["Length", "Up to 120 seconds"],
  ["Render", "Remotion, server-side"],
  ["Storage", "Cloud media library"],
] as const;

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <SmoothScroll />

      {/* Nav — floating capsule */}
      <header
        className="rise sticky top-3 z-50 px-4 pt-3"
        style={{ "--rise": 0 } as React.CSSProperties}
      >
        <nav className="mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-full border border-border bg-background/70 py-1.5 pr-1.5 pl-5 shadow-[0_14px_44px_-18px_rgb(0_0_0/0.55),inset_0_1px_0_0_rgb(255_255_255/0.07)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="size-4.5" />
            <span className="text-[15px] font-medium tracking-tight">
              Clipline
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle className="rounded-full" />
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-3.5"
              nativeButton={false}
              render={<Link href="/projects" />}
            >
              Open editor
            </Button>
          </div>
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-6xl flex-1 px-6">
        {/* Hero */}
        <section className="grain relative grid grid-cols-1 gap-16 border-b border-border pt-16 pb-24 md:grid-cols-[1.2fr_0.8fr] md:gap-12 md:pt-24 md:pb-40">
          {/* faint frame-ruler backdrop — atmosphere, not decoration */}
          <svg
            className="pointer-events-none absolute inset-0 z-0 h-full w-full text-border opacity-60"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id="ticks"
                width="44"
                height="44"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="6" fill="url(#ticks)" />
          </svg>

          <div className="relative z-10 flex flex-col justify-center">
            <p
              className="label-mono rise text-muted-foreground"
              style={{ "--rise": 1 } as React.CSSProperties}
            >
              A vertical video editor
            </p>
            <h1
              className="font-display rise mt-8 text-6xl leading-[1.06] md:text-8xl"
              style={{ "--rise": 2 } as React.CSSProperties}
            >
              Cut clean.
              <br />
              Ship <em>vertical.</em>
            </h1>
            <p
              className="rise mt-9 max-w-md text-base leading-relaxed text-muted-foreground"
              style={{ "--rise": 3 } as React.CSSProperties}
            >
              Clipline is a focused editor for Reels, Shorts and TikTok.
              Arrange, trim, caption and grade on a real timeline — then export
              exactly what you previewed.
            </p>
            <div
              className="rise mt-12 flex items-center gap-4"
              style={{ "--rise": 4 } as React.CSSProperties}
            >
              <Button
                size="lg"
                className="group"
                nativeButton={false}
                render={<Link href="/projects" />}
              >
                Start editing
                <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Button>
              <span className="label-mono text-muted-foreground">
                Free · Local-first
              </span>
            </div>
          </div>

          <div
            className="rise relative z-10 flex items-center justify-center"
            style={{ "--rise": 3 } as React.CSSProperties}
          >
            <HeroPreview />
          </div>
        </section>

        {/* Pipeline — four steps along one track */}
        <section className="py-24 md:py-32">
          <Reveal>
            <span className="label-mono text-muted-foreground">
              From clip to cut
            </span>
            <h2 className="font-display mt-4 max-w-xl text-3xl leading-tight md:text-4xl">
              Four moves, one continuous timeline.
            </h2>
          </Reveal>

          <div className="relative mt-16 grid grid-cols-1 gap-12 md:grid-cols-4 md:gap-6">
            {/* connecting track behind the nodes (md+) */}
            <div className="absolute left-0 right-0 top-[7px] hidden h-px bg-border md:block" />
            {PIPELINE.map(([tc, title, body], i) => (
              <Reveal key={tc} delay={i * 0.08} className="relative">
                <span className="block size-3.5 rounded-full border border-border bg-background ring-4 ring-background" />
                <span className="label-mono mt-5 block text-muted-foreground">
                  {tc} · {title}
                </span>
                <p className="mt-3 max-w-[26ch] text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="grid grid-cols-1 border-t border-border md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal
              key={f.n}
              delay={i * 0.08}
              className="border-b border-border px-1 py-16 last:border-b-0 md:border-b-0 md:border-r md:px-10 md:first:pl-1 md:last:border-r-0"
            >
              <f.Glyph className="size-9 text-foreground/70" />
              <span className="label-mono mt-6 block text-muted-foreground">
                {f.n}
              </span>
              <h3 className="mt-3 text-lg font-medium tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </Reveal>
          ))}
        </section>

        {/* Signature timeline art */}
        <section className="py-24 md:py-32">
          <Reveal>
            <span className="label-mono text-muted-foreground">
              One project, every layer
            </span>
            <h2 className="font-display mt-4 max-w-2xl text-3xl leading-tight md:text-4xl">
              Video, text and audio on the same ruler — non-destructive, every
              edit just a spec.
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-12">
            <TimelineArt />
          </Reveal>
        </section>

        {/* Spec strip */}
        <Reveal className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
          {SPECS.map(([k, v]) => (
            <div key={k} className="bg-background px-6 py-6">
              <dt className="label-mono text-muted-foreground">{k}</dt>
              <dd className="mt-1.5 text-sm font-medium">{v}</dd>
            </div>
          ))}
        </Reveal>

        {/* Closer */}
        <section className="border-y border-border py-28 text-center md:py-40">
          <Reveal>
            <h2 className="font-display mx-auto max-w-3xl text-5xl leading-[1.08] md:text-7xl">
              Open the editor.
              <br />
              <em>Ship the cut.</em>
            </h2>
            <div className="mt-12 flex items-center justify-center gap-4">
              <Button
                size="lg"
                className="group"
                nativeButton={false}
                render={<Link href="/projects" />}
              >
                Start editing
                <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Button>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl px-6">
        <div className="flex items-center justify-between py-10">
          <span className="label-mono text-muted-foreground">
            Clipline · 2026
          </span>
          <Link
            href="/projects"
            className="label-mono text-muted-foreground transition-colors hover:text-foreground"
          >
            Open editor →
          </Link>
        </div>
      </footer>
    </div>
  );
}
