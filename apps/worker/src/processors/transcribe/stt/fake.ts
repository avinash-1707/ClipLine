import type { SttAdapter } from "./index";

/**
 * Deterministic STT for local development and end-to-end runs without a key or
 * network. Emits evenly-spaced words so the caption pipeline can be exercised
 * (set STT_ENGINE=fake).
 */
export const fakeAdapter: SttAdapter = {
  async transcribe() {
    const tokens =
      "this is a fake transcription used for local testing of the subtitle pipeline".split(
        " ",
      );
    const step = 0.4;
    return tokens.map((text, i) => ({
      text,
      startSec: i * step,
      endSec: (i + 1) * step,
    }));
  },
};
