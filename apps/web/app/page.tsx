import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    n: "01",
    title: "Cut on a real timeline",
    body: "Multi-track editing with trim, split and reorder — tuned to stay at 60fps for a full two-minute reel.",
  },
  {
    n: "02",
    title: "What you see is what ships",
    body: "Preview and export share the same render components. The MP4 you download is the preview you watched.",
  },
  {
    n: "03",
    title: "Captions that move",
    body: "Animated text presets, transitions and per-clip color — all serializable, all reproducible.",
  },
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
      {/* Nav */}
      <header
        className="rise mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8"
        style={{ "--rise": 0 } as React.CSSProperties}
      >
        <div className="flex items-center gap-2.5">
          <Logo className="size-4.5" />
          <span className="text-[15px] font-medium tracking-tight">
            Clipline
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/projects" />}
          >
            Open editor
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative mx-auto w-full max-w-6xl flex-1 px-6">
        <section className="grain relative grid grid-cols-1 gap-16 border-y border-border py-24 md:grid-cols-[1.2fr_0.8fr] md:gap-12 md:py-40">
          <div className="flex flex-col justify-center">
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

          {/* 9:16 stage mock, composed in CSS */}
          <div
            className="rise flex items-center justify-center"
            style={{ "--rise": 3 } as React.CSSProperties}
          >
            <div className="relative aspect-9/16 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-[0_32px_80px_-28px_rgb(0_0_0/0.55)] md:w-72">
              {/* frame content */}
              <div className="absolute inset-0 bg-[linear-gradient(165deg,oklch(0.32_0_0)_0%,oklch(0.2_0_0)_55%,oklch(0.16_0_0)_100%)]" />
              <div className="absolute left-1/2 top-[18%] h-px w-2/3 -translate-x-1/2 bg-white/15" />
              <div className="absolute left-1/2 top-[58%] w-full -translate-x-1/2 -translate-y-1/2 text-center">
                <p className="font-display text-2xl italic leading-tight text-white/90">
                  every frame,
                  <br />
                  exactly placed
                </p>
              </div>
              {/* caption-style chip */}
              <div className="label-mono absolute bottom-[20%] left-1/2 -translate-x-1/2 rounded-md bg-white/10 px-2.5 py-1 text-white/80 backdrop-blur-sm">
                00:00:42:11
              </div>
              {/* mini timeline */}
              <div className="absolute inset-x-3 bottom-3 space-y-1">
                <div className="flex gap-1">
                  <div className="h-2 w-2/5 rounded-xs bg-white/35" />
                  <div className="h-2 w-1/4 rounded-xs bg-white/20" />
                  <div className="h-2 flex-1 rounded-xs bg-white/30" />
                </div>
                <div className="flex gap-1">
                  <div className="h-2 w-1/3 rounded-xs bg-white/15" />
                  <div className="h-2 w-1/2 rounded-xs bg-white/10" />
                </div>
              </div>
              {/* playhead */}
              <div className="absolute bottom-2 top-[72%] left-[38%] w-px bg-white/70" />
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="grid grid-cols-1 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.n}
              className="rise border-b border-border px-1 py-16 last:border-b-0 md:border-b-0 md:border-r md:px-10 md:first:pl-1 md:last:border-r-0"
              style={{ "--rise": 5 + i } as React.CSSProperties}
            >
              <span className="label-mono text-muted-foreground">{f.n}</span>
              <h2 className="mt-4 text-lg font-medium tracking-tight">
                {f.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </section>

        {/* Spec strip */}
        <section
          className="rise mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4"
          style={{ "--rise": 8 } as React.CSSProperties}
        >
          {SPECS.map(([k, v]) => (
            <div key={k} className="bg-background px-6 py-6">
              <dt className="label-mono text-muted-foreground">{k}</dt>
              <dd className="mt-1.5 text-sm font-medium">{v}</dd>
            </div>
          ))}
        </section>
      </main>

      {/* Footer */}
      <footer className="mx-auto mt-36 w-full max-w-6xl px-6">
        <div className="flex items-center justify-between border-t border-border py-10">
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
