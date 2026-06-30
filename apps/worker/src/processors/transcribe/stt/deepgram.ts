import { readFile } from "node:fs/promises";
import { env } from "../../../lib/env";
import type { SttAdapter } from "./index";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

/** Minimal shape of the Deepgram /v1/listen response we consume. */
interface DeepgramResponse {
  results?: {
    channels?: {
      alternatives?: {
        words?: {
          word: string;
          start: number;
          end: number;
          punctuated_word?: string;
        }[];
      }[];
    }[];
  };
}

/** Strip the API key from any string before it can become a job error. */
function scrubKey(message: string, key: string): string {
  return key ? message.split(key).join("***") : message;
}

/**
 * Deepgram REST adapter. Posts the raw audio bytes (download-then-POST, so no
 * Cloudinary URL is handed to a third party) and maps word timings to seconds.
 * Uses fetch directly rather than the SDK — the endpoint is a single POST and
 * this keeps the key handling and types fully under our control.
 */
export const deepgramAdapter: SttAdapter = {
  async transcribe(audioPath, { language }) {
    const apiKey = env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error(
        "transcription is not configured — set DEEPGRAM_API_KEY in apps/worker/.env",
      );
    }
    const audio = await readFile(audioPath);
    const params = new URLSearchParams({
      model: "nova-2",
      language,
      smart_format: "true",
      punctuate: "true",
    });

    let res: Response;
    try {
      res = await fetch(`${DEEPGRAM_URL}?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/octet-stream",
        },
        body: audio,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        scrubKey(`could not reach the transcription service: ${detail}`, apiKey),
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        scrubKey(
          `transcription service error ${res.status}: ${body.slice(0, 200)}`,
          apiKey,
        ),
      );
    }

    const json = (await res.json()) as DeepgramResponse;
    const words =
      json.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
    return words
      .map((w) => ({
        text: (w.punctuated_word ?? w.word).trim(),
        startSec: w.start,
        endSec: w.end,
      }))
      .filter((w) => w.text.length > 0 && w.endSec > w.startSec);
  },
};
