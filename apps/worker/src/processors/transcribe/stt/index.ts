import type { TranscribeWord } from "@clipline/jobs";
import { env } from "../../../lib/env";
import { deepgramAdapter } from "./deepgram";
import { fakeAdapter } from "./fake";

/**
 * Speech-to-text seam. The processor talks only to this interface, so the
 * engine is a swappable env choice (default Deepgram; "fake" for local/E2E).
 * A future local-Whisper adapter drops in here with no caller changes.
 */
export interface SttAdapter {
  /** Transcribe a local audio file to word-timed tokens (seconds). */
  transcribe(
    audioPath: string,
    opts: { language: string },
  ): Promise<TranscribeWord[]>;
}

export function getSttAdapter(): SttAdapter {
  return env.STT_ENGINE === "fake" ? fakeAdapter : deepgramAdapter;
}
