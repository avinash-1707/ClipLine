import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FPS } from "@clipline/timeline";
import { jobLog } from "../../lib/log-context";

const execFileAsync = promisify(execFile);

/** Run a media tool; on failure surface the tail of stderr, which is where
 * ffmpeg/ffprobe put the actual reason. */
async function run(cmd: string, args: string[]) {
  try {
    return await execFileAsync(cmd, args);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    const tail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 300);
    // log with the ambient job context (jobId/assetId) before rethrowing —
    // the throw still carries the same message; logging only observes.
    jobLog().error({ step: cmd, stderr: tail }, `${cmd} failed`);
    throw new Error(`${cmd} failed: ${tail || (error as Error).message}`);
  }
}

export interface ProbeResult {
  durationSeconds: number;
  codec: string;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
}

/** Probe media metadata with ffprobe. */
export async function probe(filePath: string): Promise<ProbeResult> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }>;
  };

  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const durationSeconds = Number(data.format?.duration ?? 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("media has no readable duration");
  }

  return {
    durationSeconds,
    codec: video?.codec_name ?? audio?.codec_name ?? "unknown",
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
  };
}

export function durationToFrames(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds * FPS));
}

/**
 * Normalize video to H.264/AAC MP4: fit within 1080x1920 (even dimensions,
 * aspect preserved), faststart for instant playback, ~1 s keyframe interval
 * so timeline seeks land fast (scrub performance budget).
 */
export async function normalizeVideo(input: string, output: string) {
  await run("ffmpeg", [
    "-y",
    "-i", input,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-vf",
    "scale=w=min(1080\\,iw):h=min(1920\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-pix_fmt", "yuv420p",
    "-g", String(FPS),
    "-keyint_min", String(FPS),
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    output,
  ]);
}

/** Normalize audio to AAC in M4A at 48 kHz. */
export async function normalizeAudio(input: string, output: string) {
  await run("ffmpeg", [
    "-y",
    "-i", input,
    "-vn",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-movflags", "+faststart",
    output,
  ]);
}

/** Extract a thumbnail frame (10% in, capped at 3 s) as JPEG, 360 px wide. */
export async function thumbnail(
  input: string,
  output: string,
  durationSeconds: number,
) {
  const at = Math.min(durationSeconds * 0.1, 3);
  await run("ffmpeg", [
    "-y",
    "-ss", at.toFixed(2),
    "-i", input,
    "-frames:v", "1",
    "-vf", "scale=360:-2",
    output,
  ]);
}

/** Render the audio waveform as a white-on-transparent PNG strip. */
export async function waveform(input: string, output: string) {
  await run("ffmpeg", [
    "-y",
    "-i", input,
    "-filter_complex",
    "[0:a]aformat=channel_layouts=mono,showwavespic=s=2000x120:colors=white",
    "-frames:v", "1",
    output,
  ]);
}
