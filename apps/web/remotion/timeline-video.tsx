import type {
  AudioTrack,
  GraphicTrack,
  TextTrack,
  VideoTrack,
} from "@clipline/timeline";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { GraphicLayer } from "./graphic-layer";
import { TextLayer } from "./text-layer";
import type { TimelineVideoProps } from "./props";
import { VideoTrackLayer } from "./video-track";

/**
 * Root render component. Consumes the same timeline spec as the live
 * preview (invariant 2): video tracks composite bottom-up so the timeline's
 * first video track is topmost, audio clips mix additively, text renders
 * above everything.
 */
export function TimelineVideo({
  timeline,
  assetUrls,
  assetDims = {},
}: TimelineVideoProps) {
  const videoTracks = timeline.tracks.filter(
    (t): t is VideoTrack => t.kind === "video",
  );
  const audioTracks = timeline.tracks.filter(
    (t): t is AudioTrack => t.kind === "audio",
  );
  const textTracks = timeline.tracks.filter(
    (t): t is TextTrack => t.kind === "text",
  );
  const graphicTracks = timeline.tracks.filter(
    (t): t is GraphicTrack => t.kind === "graphic",
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* bottom-up: last video track in the array renders first (lowest) */}
      {[...videoTracks].reverse().map((track) => (
        <VideoTrackLayer
          key={track.id}
          track={track}
          assetUrls={assetUrls}
          assetDims={assetDims}
        />
      ))}

      {audioTracks.map((track) =>
        track.clips.map((clip) => {
          const src = assetUrls[clip.assetId];
          if (!src) return null;
          return (
            <Sequence
              key={clip.id}
              from={clip.startFrame}
              durationInFrames={clip.sourceOutFrame - clip.sourceInFrame}
            >
              <Audio
                src={src}
                startFrom={clip.sourceInFrame}
                endAt={clip.sourceOutFrame}
                volume={clip.gain}
              />
            </Sequence>
          );
        }),
      )}

      {/* graphics sit above video, below text */}
      {graphicTracks.map((track) =>
        track.clips.map((clip) => (
          <Sequence
            key={clip.id}
            from={clip.startFrame}
            durationInFrames={clip.durationInFrames}
          >
            <GraphicLayer clip={clip} />
          </Sequence>
        )),
      )}

      {textTracks.map((track) =>
        track.clips.map((clip) => (
          <Sequence
            key={clip.id}
            from={clip.startFrame}
            durationInFrames={clip.durationInFrames}
          >
            <TextLayer clip={clip} />
          </Sequence>
        )),
      )}
    </AbsoluteFill>
  );
}
