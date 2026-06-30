import {
  clipDurationInFrames,
  FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  resolveTextAnimation,
  resolveTextLayout,
  resolveVideoFraming,
  TEXT_LINE_HEIGHT,
  timelineDurationInFrames,
  wordRevealAlpha,
  type Framing,
  type TextClip,
} from "@clipline/timeline";
import { useTimelineStore } from "@/store/timeline";
import {
  entranceState,
  gradeToFilter,
  resolveAudio,
  resolveGraphics,
  resolveTexts,
  resolveVideoLayers,
  type ActiveGraphic,
  type ActiveText,
  type ActiveVideo,
} from "./resolve";

interface PooledMedia {
  element: HTMLVideoElement | HTMLAudioElement;
  gainNode: GainNode | null;
  url: string;
}

/** How far media may drift from the playhead before a hard seek (seconds). */
const DRIFT_TOLERANCE = 0.12;

/**
 * Imperative preview engine. One instance per mounted stage. Owns:
 * - a media element pool (one element per asset, created once, reused)
 * - a Web Audio graph for per-clip gain
 * - the single rAF loop that advances the playhead during playback and
 *   composites the active video frame onto the canvas with ctx.filter
 *   color grading (same values the Remotion export will receive).
 *
 * It reads the Zustand store imperatively and never causes React renders.
 */
export class PreviewEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pool = new Map<string, PooledMedia>();
  private audioCtx: AudioContext | null = null;
  private raf = 0;
  private playStartWallSec = 0;
  private playStartFrame = 0;
  private unsubscribe: () => void;
  /** Resolved page font stack — canvas can't use next/font CSS variables. */
  private fontFamily = "sans-serif";
  /**
   * Live framing for the clip being dragged on the stage. Lets the interaction
   * preview pan/zoom without committing to the store every pointer move (the
   * store commit — one undo step — happens on pointer up). Cleared after.
   */
  private framingOverride: { clipId: string; framing: Framing } | null = null;
  /**
   * Live position for the text clip being dragged on the stage — same transient
   * pattern as framingOverride. While set, drawText uses it instead of the
   * clip's stored normalized position; the store commit (one undo step) happens
   * on pointer up.
   */
  private textPosOverride: {
    clipId: string;
    position: { x: number; y: number };
  } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    this.ctx = canvas.getContext("2d")!;

    // redraw on any state the composite depends on (paused scrubbing/edits)
    this.unsubscribe = useTimelineStore.subscribe((state, prev) => {
      if (state.isPlaying) return; // the loop owns drawing while playing
      if (
        state.playheadFrame !== prev.playheadFrame ||
        state.timeline !== prev.timeline
      ) {
        this.syncPaused();
      }
      if (state.isPlaying !== prev.isPlaying) return;
    });

    this.fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
    this.drawBlack();
    this.loop = this.loop.bind(this);
  }

  /**
   * Set (or clear) the transient framing for a clip during a stage drag. While
   * set, drawVideoLayer uses it instead of the clip's stored framing. Redraws
   * immediately when paused so the pan/zoom tracks the pointer.
   */
  setFramingOverride(clipId: string, framing: Framing | null) {
    this.framingOverride = framing ? { clipId, framing } : null;
    if (!useTimelineStore.getState().isPlaying) this.drawCurrent();
  }

  /**
   * Set (or clear) the transient normalized position for a text clip during a
   * stage drag. Redraws immediately when paused so the caption tracks the
   * pointer with no React state in the hot path.
   */
  setTextPositionOverride(
    clipId: string,
    position: { x: number; y: number } | null,
  ) {
    this.textPosOverride = position ? { clipId, position } : null;
    if (!useTimelineStore.getState().isPlaying) this.drawCurrent();
  }

  /** Display-space scale: one output px maps to this many CSS px on screen. */
  private displayScale(): number {
    return this.canvas.getBoundingClientRect().width / this.canvas.width || 1;
  }

  /**
   * Topmost active text clip whose box contains the output-space point, or null.
   * Used by the stage to begin a text drag. `grabMarginPx` widens the hit area
   * for small unboxed text. Iterates visual top-down (last-drawn first).
   */
  hitTestText(
    outX: number,
    outY: number,
    grabMarginPx = 8,
  ): string | null {
    const { timeline, playheadFrame } = useTimelineStore.getState();
    if (!timeline) return null;
    const texts = resolveTexts(timeline, playheadFrame);
    for (let i = texts.length - 1; i >= 0; i--) {
      const { clip } = texts[i]!;
      const layout = this.layoutFor(clip, clip.position);
      const m = layout.padding > 0 ? 0 : grabMarginPx;
      const { x, y, w, h } = layout.box;
      if (
        outX >= x - m &&
        outX <= x + w + m &&
        outY >= y - m &&
        outY <= y + h + m
      ) {
        return clip.id;
      }
    }
    return null;
  }

  /** Box rect (output px) of an active text clip, honoring a live drag
   * override. Used by the stage to position the selection outline. */
  getTextBox(
    clipId: string,
  ): { x: number; y: number; w: number; h: number } | null {
    const { timeline, playheadFrame } = useTimelineStore.getState();
    if (!timeline) return null;
    const found = resolveTexts(timeline, playheadFrame).find(
      (t) => t.clip.id === clipId,
    );
    if (!found) return null;
    const position =
      this.textPosOverride && this.textPosOverride.clipId === clipId
        ? this.textPosOverride.position
        : found.clip.position;
    return this.layoutFor(found.clip, position).box;
  }

  /** Canvas font string for a text clip (style + weight + size + family). */
  private textFont(clip: TextClip): string {
    const weight = clip.fontStyle.bold ? 700 : 600;
    const italic = clip.fontStyle.italic ? "italic " : "";
    return `${italic}${weight} ${clip.fontSize}px ${this.fontFamily}`;
  }

  /** Resolve a text clip's box geometry by measuring its lines on the canvas. */
  private layoutFor(clip: TextClip, position: { x: number; y: number }) {
    const { ctx } = this;
    ctx.save();
    ctx.font = this.textFont(clip);
    const lineWidths = clip.text
      .split("\n")
      .map((line) => ctx.measureText(line).width);
    ctx.restore();
    return resolveTextLayout({
      lineWidths,
      fontSize: clip.fontSize,
      lineHeightRatio: TEXT_LINE_HEIGHT,
      align: clip.align,
      box: clip.box,
      position,
      frameW: this.canvas.width,
      frameH: this.canvas.height,
    });
  }

  /** Intrinsic source size of a pooled video, or null if not ready yet. */
  getSourceSize(assetId: string): { w: number; h: number } | null {
    const media = this.pool.get(assetId);
    const v = media?.element as HTMLVideoElement | undefined;
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    return { w: v.videoWidth, h: v.videoHeight };
  }

  /** Register a ready asset's media URL. Safe to call repeatedly. */
  registerAsset(assetId: string, kind: "video" | "audio", url: string) {
    const existing = this.pool.get(assetId);
    if (existing?.url === url) return;
    existing?.element.remove();

    const element =
      kind === "video"
        ? document.createElement("video")
        : document.createElement("audio");
    element.crossOrigin = "anonymous";
    element.preload = "auto";
    element.src = url;
    // mixing happens through Web Audio; element output stays muted until
    // the graph is connected (first play)
    this.pool.set(assetId, { element, gainNode: null, url });

    if (kind === "video") {
      const v = element as HTMLVideoElement;
      v.addEventListener("seeked", () => {
        if (!useTimelineStore.getState().isPlaying) this.drawCurrent();
      });
    }
  }

  play() {
    const store = useTimelineStore.getState();
    if (!store.timeline) return;
    this.ensureAudioGraph();
    this.playStartWallSec = performance.now() / 1000;
    this.playStartFrame = store.playheadFrame;
    store.setPlaying(true);
    this.raf = requestAnimationFrame(this.loop);
  }

  pause() {
    const store = useTimelineStore.getState();
    store.setPlaying(false);
    cancelAnimationFrame(this.raf);
    for (const media of this.pool.values()) media.element.pause();
    this.syncPaused();
  }

  toggle() {
    if (useTimelineStore.getState().isPlaying) this.pause();
    else this.play();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unsubscribe();
    for (const media of this.pool.values()) {
      media.element.pause();
      media.element.remove();
    }
    this.pool.clear();
    this.audioCtx?.close().catch(() => undefined);
  }

  // -------------------------------------------------------------------

  private ensureAudioGraph() {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => undefined);
    }
    for (const media of this.pool.values()) {
      if (!media.gainNode) {
        const source = this.audioCtx.createMediaElementSource(media.element);
        media.gainNode = this.audioCtx.createGain();
        source.connect(media.gainNode).connect(this.audioCtx.destination);
      }
    }
  }

  private loop() {
    const store = useTimelineStore.getState();
    if (!store.isPlaying || !store.timeline) return;

    const elapsed = performance.now() / 1000 - this.playStartWallSec;
    const frame = Math.round(this.playStartFrame + elapsed * FPS);
    const end = timelineDurationInFrames(store.timeline);

    if (frame >= end) {
      store.setPlayhead(end);
      this.pause();
      return;
    }

    store.setPlayhead(frame);
    this.syncMedia(frame, true);
    this.drawCurrent();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Paused: seek media to the playhead and draw one frame. */
  private syncPaused() {
    const { timeline, playheadFrame } = useTimelineStore.getState();
    if (!timeline) return;
    this.syncMedia(playheadFrame, false);
    this.drawCurrent();
  }

  /** Align pooled elements with what should sound/show at `frame`. */
  private syncMedia(frame: number, playing: boolean) {
    const { timeline } = useTimelineStore.getState();
    if (!timeline) return;

    const audible = resolveAudio(timeline, frame);
    const activeIds = new Set<string>();

    for (const { clip, sourceTimeSec } of audible) {
      const media = this.pool.get(clip.assetId);
      if (!media) continue;
      activeIds.add(clip.assetId);
      const el = media.element;

      if (media.gainNode) media.gainNode.gain.value = clip.gain;

      if (Math.abs(el.currentTime - sourceTimeSec) > DRIFT_TOLERANCE) {
        el.currentTime = sourceTimeSec;
      }
      if (playing && el.paused) {
        el.play().catch(() => undefined);
      } else if (!playing && !el.paused) {
        el.pause();
      }
    }

    // stop anything no longer under the playhead
    for (const [assetId, media] of this.pool) {
      if (!activeIds.has(assetId) && !media.element.paused) {
        media.element.pause();
      }
    }
  }

  /** Composite video layers (with transition blend) plus text overlays. */
  private drawCurrent() {
    const { timeline, playheadFrame } = useTimelineStore.getState();
    if (!timeline) {
      this.drawBlack();
      return;
    }
    this.drawBlack();

    const layers = resolveVideoLayers(timeline, playheadFrame);
    if (layers) {
      const { current, outgoing, transition, progress } = layers;
      const sameAsset =
        outgoing != null && outgoing.clip.assetId === current.clip.assetId;

      if (!outgoing || !transition || sameAsset) {
        // one element cannot show two source times — skip the blend
        this.drawVideoLayer(current, 1, 0, 0);
      } else {
        const { ctx } = this;
        const w = this.canvas.width;
        switch (transition.preset) {
          case "fade":
            this.drawVideoLayer(outgoing, 1, 0, 0);
            this.drawVideoLayer(current, progress, 0, 0);
            break;
          case "slide": {
            const dir = transition.direction;
            const dx =
              dir === "left" ? w * (1 - progress)
              : dir === "right" ? -w * (1 - progress)
              : 0;
            const dy =
              dir === "up" ? this.canvas.height * (1 - progress)
              : dir === "down" ? -this.canvas.height * (1 - progress)
              : 0;
            this.drawVideoLayer(outgoing, 1, 0, 0);
            this.drawVideoLayer(current, 1, dx, dy);
            break;
          }
          case "wipe": {
            this.drawVideoLayer(outgoing, 1, 0, 0);
            const ctxSave = ctx;
            ctxSave.save();
            const h = this.canvas.height;
            const dir = transition.direction;
            ctxSave.beginPath();
            if (dir === "left") ctxSave.rect(w * (1 - progress), 0, w * progress, h);
            else if (dir === "right") ctxSave.rect(0, 0, w * progress, h);
            else if (dir === "up") ctxSave.rect(0, h * (1 - progress), w, h * progress);
            else ctxSave.rect(0, 0, w, h * progress);
            ctxSave.clip();
            this.drawVideoLayer(current, 1, 0, 0);
            ctxSave.restore();
            break;
          }
        }
      }
    }

    for (const graphic of resolveGraphics(timeline, playheadFrame)) {
      this.drawGraphic(graphic);
    }

    for (const text of resolveTexts(timeline, playheadFrame)) {
      this.drawText(text);
    }
  }

  /** Draw a graphic clip. Math mirrors the Remotion graphic layer exactly. */
  private drawGraphic({ clip, localFrame }: ActiveGraphic) {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const g = clip.graphic;

    ctx.save();
    ctx.globalAlpha = clip.opacity;

    switch (g.preset) {
      case "overlay": {
        if (g.colorB) {
          // CSS linear-gradient convention: 0deg = to top, clockwise
          const rad = (g.angleDeg * Math.PI) / 180;
          const dirX = Math.sin(rad);
          const dirY = -Math.cos(rad);
          const len = Math.abs(w * dirX) + Math.abs(h * dirY);
          const cx = w / 2;
          const cy = h / 2;
          const grad = ctx.createLinearGradient(
            cx - (dirX * len) / 2,
            cy - (dirY * len) / 2,
            cx + (dirX * len) / 2,
            cy + (dirY * len) / 2,
          );
          grad.addColorStop(0, g.color);
          grad.addColorStop(1, g.colorB);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = g.color;
        }
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case "shape": {
        const e = entranceState(g.animation, localFrame);
        ctx.globalAlpha = clip.opacity * e.alpha;
        const sw = g.size.w * w * e.scale;
        const sh = g.size.h * h * e.scale;
        const x = g.position.x * w;
        const y = g.position.y * h + e.offsetY;
        ctx.fillStyle = g.color;
        if (g.shape === "circle") {
          ctx.beginPath();
          ctx.ellipse(x, y, sw / 2, sh / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (g.shape === "line") {
          ctx.fillRect(x - sw / 2, y - Math.max(sh * 0.06, 2) / 2, sw, Math.max(sh * 0.06, 2));
        } else {
          ctx.fillRect(x - sw / 2, y - sh / 2, sw, sh);
        }
        break;
      }

      case "progress-bar": {
        const duration = clip.durationInFrames;
        const p = duration > 1 ? localFrame / (duration - 1) : 1;
        const y = g.edge === "top" ? 0 : h - g.thickness;
        ctx.fillStyle = g.color;
        ctx.fillRect(0, y, w * p, g.thickness);
        break;
      }

      case "lower-third": {
        const e = entranceState(g.animation, localFrame);
        ctx.globalAlpha = clip.opacity * e.alpha;
        const bandH = g.height * h;
        const y = g.y * h + e.offsetY;
        ctx.fillStyle = g.color;
        ctx.fillRect(0, y, w, bandH);
        // accent edge along the top of the band
        ctx.fillStyle = g.accentColor;
        ctx.fillRect(0, y, w, Math.max(bandH * 0.06, 4));
        break;
      }

      case "badge": {
        const e = entranceState(g.animation, localFrame);
        ctx.globalAlpha = clip.opacity * e.alpha;
        const x = g.position.x * w;
        const y = g.position.y * h + e.offsetY;
        ctx.font = `600 ${g.fontSize}px ${this.fontFamily}`;
        const textW = ctx.measureText(g.label).width;
        const padX = g.fontSize * 0.6;
        const padY = g.fontSize * 0.35;
        const bw = (textW + padX * 2) * e.scale;
        const bh = (g.fontSize + padY * 2) * e.scale;
        const r = bh / 2; // pill
        ctx.fillStyle = g.color;
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, r);
        ctx.fill();
        ctx.fillStyle = g.textColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(e.scale, e.scale);
        ctx.fillText(g.label, 0, 0);
        ctx.restore();
        break;
      }
    }

    ctx.restore();
  }

  /** Draw one video layer cover-fit with its color grade. */
  private drawVideoLayer(
    layer: ActiveVideo,
    alpha: number,
    dx: number,
    dy: number,
  ) {
    const media = this.pool.get(layer.clip.assetId);
    const video = media?.element as HTMLVideoElement | undefined;
    if (!video || video.readyState < 2 || !video.videoWidth) return;

    const { ctx } = this;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    // framing comes from the shared resolver (same one Remotion uses → parity);
    // a live drag override wins over the clip's stored framing.
    const framing =
      this.framingOverride && this.framingOverride.clipId === layer.clip.id
        ? this.framingOverride.framing
        : layer.clip.framing;
    const rect = resolveVideoFraming({
      srcW: video.videoWidth,
      srcH: video.videoHeight,
      frameW: cw,
      frameH: ch,
      framing,
    });

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = gradeToFilter(layer.clip);
    // dx/dy is the transition slide — applied on top of the framing rect.
    ctx.drawImage(video, rect.x + dx, rect.y + dy, rect.w, rect.h);
    ctx.restore();
  }

  /** Draw a text clip: animated box + styled text. Geometry and animation come
   * from the shared timeline helpers the Remotion layer also uses (ADR 0001). */
  private drawText({ clip, localFrame }: ActiveText) {
    const { ctx } = this;
    const position =
      this.textPosOverride && this.textPosOverride.clipId === clip.id
        ? this.textPosOverride.position
        : clip.position;
    const anim = resolveTextAnimation(
      clip.animation,
      localFrame,
      clipDurationInFrames(clip),
    );
    if (anim.alpha <= 0) return;

    const layout = this.layoutFor(clip, position);
    const { center } = layout;
    const { x, y, w, h } = layout.box;
    const { bg, border, cornerRadius } = clip.box;

    ctx.save();
    ctx.globalAlpha = anim.alpha;
    if (anim.blur > 0) ctx.filter = `blur(${anim.blur}px)`;
    // animate around the box center: translate by the entrance/exit offset and
    // scale about the center, so absolute layout coords stay usable below.
    ctx.translate(center.x + anim.offsetX, center.y + anim.offsetY);
    ctx.scale(anim.scale, anim.scale);
    ctx.translate(-center.x, -center.y);

    if (bg.enabled) {
      ctx.save();
      ctx.globalAlpha = anim.alpha * bg.opacity;
      ctx.fillStyle = bg.color;
      this.boxPath(x, y, w, h, cornerRadius);
      ctx.fill();
      ctx.restore();
    }
    if (border.enabled && border.width > 0) {
      const o = border.width / 2;
      ctx.save();
      ctx.strokeStyle = border.color;
      ctx.lineWidth = border.width;
      // stroke fully OUTSIDE the box rect (matches the Remotion `outline`)
      this.boxPath(
        x - o,
        y - o,
        w + border.width,
        h + border.width,
        cornerRadius > 0 ? cornerRadius + o : 0,
      );
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = clip.color;
    ctx.textBaseline = "middle";
    ctx.font = this.textFont(clip);

    if (clip.animation.preset === "word-reveal") {
      this.drawWordReveal(clip, layout, anim.progress, anim.alpha);
    } else {
      const shownText =
        clip.animation.preset === "typewriter"
          ? clip.text.slice(0, Math.ceil(clip.text.length * anim.progress))
          : clip.text;
      const lines = shownText.split("\n");
      ctx.textAlign = clip.align;
      lines.forEach((line, i) => {
        const ln = layout.lines[i];
        if (!ln) return;
        ctx.fillText(line, ln.x, ln.y);
        if (clip.fontStyle.underline && line) {
          this.underline(line, ln.x, ln.y, clip);
        }
      });
    }

    ctx.restore();
  }

  /** Trace a (optionally rounded) rect onto the current path. */
  private boxPath(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    ctx.beginPath();
    if (r > 0) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
    else ctx.rect(x, y, w, h);
  }

  /** Left edge of a line given its width and the clip's alignment. */
  private lineLeft(anchorX: number, lineW: number, clip: TextClip): number {
    return clip.align === "left"
      ? anchorX
      : clip.align === "right"
        ? anchorX - lineW
        : anchorX - lineW / 2;
  }

  /** Underline stroke under one drawn line (baseline-middle text). */
  private underline(line: string, anchorX: number, anchorY: number, clip: TextClip) {
    const { ctx } = this;
    const lineW = ctx.measureText(line).width;
    const left = this.lineLeft(anchorX, lineW, clip);
    const thickness = Math.max(clip.fontSize * 0.06, 2);
    const uy = anchorY + clip.fontSize * 0.42;
    ctx.fillRect(left, uy, lineW, thickness);
  }

  /** Word-reveal entrance: words light up left to right with `progress`. */
  private drawWordReveal(
    clip: TextClip,
    layout: ReturnType<PreviewEngine["layoutFor"]>,
    progress: number,
    baseAlpha: number,
  ) {
    const { ctx } = this;
    const lines = clip.text.split("\n");
    const totalWords = lines.reduce(
      (n, line) => n + line.split(/\s+/).filter(Boolean).length,
      0,
    );
    ctx.textAlign = "left";
    let wordIndex = 0;
    lines.forEach((line, i) => {
      const ln = layout.lines[i];
      if (!ln) return;
      const lineW = ctx.measureText(line).width;
      let cursor = this.lineLeft(ln.x, lineW, clip);
      const spaceW = ctx.measureText(" ").width;
      for (const token of line.split(" ")) {
        if (token === "") {
          cursor += spaceW;
          continue;
        }
        const wordW = ctx.measureText(token).width;
        const a = wordRevealAlpha(progress, wordIndex, totalWords);
        if (a > 0) {
          ctx.save();
          ctx.globalAlpha = baseAlpha * a;
          ctx.fillText(token, cursor, ln.y);
          if (clip.fontStyle.underline) {
            const thickness = Math.max(clip.fontSize * 0.06, 2);
            ctx.fillRect(cursor, ln.y + clip.fontSize * 0.42, wordW, thickness);
          }
          ctx.restore();
        }
        cursor += wordW + spaceW;
        wordIndex++;
      }
    });
  }

  private drawBlack() {
    this.ctx.filter = "none";
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
