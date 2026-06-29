import {
  FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  timelineDurationInFrames,
} from "@clipline/timeline";
import { Composition } from "remotion";
import type { TimelineVideoProps } from "./props";
import { TimelineVideo } from "./timeline-video";

const FALLBACK: TimelineVideoProps = {
  timeline: {
    schemaVersion: 1,
    fps: FPS,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    tracks: [],
  },
  assetUrls: {},
  assetDims: {},
};

export function RemotionRoot() {
  return (
    <Composition
      id="clipline"
      component={TimelineVideo}
      width={OUTPUT_WIDTH}
      height={OUTPUT_HEIGHT}
      fps={FPS}
      durationInFrames={1}
      defaultProps={FALLBACK}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(
          timelineDurationInFrames(props.timeline),
          1,
        ),
        props,
      })}
    />
  );
}
