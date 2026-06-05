import {
  FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  timelineDurationInFrames,
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
    const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = gradeToFilter(layer.clip);
    ctx.drawImage(video, (cw - dw) / 2 + dx, (ch - dh) / 2 + dy, dw, dh);
    ctx.restore();
  }

  /** Draw a text clip with its entrance animation. */
  private drawText({ clip, localFrame }: ActiveText) {
    const { ctx } = this;
    const { alpha, offsetY, scale, progress } = entranceState(
      clip.animation,
      localFrame,
    );
    const text =
      clip.animation.preset === "typewriter"
        ? clip.text.slice(0, Math.ceil(clip.text.length * progress))
        : clip.text;

    const x = clip.position.x * this.canvas.width;
    const y = clip.position.y * this.canvas.height + offsetY;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.font = `600 ${clip.fontSize}px ${this.fontFamily}`;
    ctx.fillStyle = clip.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // multi-line: split on newlines, 1.2 line height
    const lines = text.split("\n");
    const lineHeight = clip.fontSize * 1.2;
    const firstY = -((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, firstY + i * lineHeight);
    });
    ctx.restore();
  }

  private drawBlack() {
    this.ctx.filter = "none";
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
