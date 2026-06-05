import type { Transition, VideoClip, VideoTrack } from "@clipline/timeline";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
} from "remotion";
import { gradeFilter } from "./props";

const FPS = 30;

function clipDuration(clip: VideoClip): number {
  return clip.sourceOutFrame - clip.sourceInFrame;
}

/**
 * Wraps an incoming clip during a transition window. Frame 0 of the wrapped
 * sequence is the cut; progress mirrors the canvas preview exactly.
 */
function TransitionIn({
  transition,
  children,
}: {
  transition: Transition;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const progress = Math.min((frame + 1) / transition.durationInFrames, 1);

  if (transition.preset === "fade") {
    return <AbsoluteFill style={{ opacity: progress }}>{children}</AbsoluteFill>;
  }
  if (transition.preset === "wipe") {
    const p = progress * 100;
    const inset =
      transition.direction === "left" ? `inset(0 0 0 ${100 - p}%)`
      : transition.direction === "right" ? `inset(0 ${100 - p}% 0 0)`
      : transition.direction === "up" ? `inset(${100 - p}% 0 0 0)`
      : `inset(0 0 ${100 - p}% 0)`;
    return (
      <AbsoluteFill style={{ clipPath: progress >= 1 ? undefined : inset }}>
        {children}
      </AbsoluteFill>
    );
  }
  // slide
  const remaining = (1 - progress) * 100;
  const translate =
    transition.direction === "left" ? `translateX(${remaining}%)`
    : transition.direction === "right" ? `translateX(${-remaining}%)`
    : transition.direction === "up" ? `translateY(${remaining}%)`
    : `translateY(${-remaining}%)`;
  return (
    <AbsoluteFill style={{ transform: progress >= 1 ? undefined : translate }}>
      {children}
    </AbsoluteFill>
  );
}

function VideoClipContent({
  clip,
  src,
  extraTailFrames,
}: {
  clip: VideoClip;
  src: string;
  extraTailFrames: number;
}) {
  const ownFrames = clipDuration(clip);
  return (
    <AbsoluteFill style={{ filter: gradeFilter(clip.colorGrade) }}>
      <OffthreadVideo
        src={src}
        startFrom={clip.sourceInFrame}
        endAt={clip.sourceOutFrame + extraTailFrames}
        // the extended tail is visual only — mute it so audio doesn't double
        volume={(f) => (f >= ownFrames ? 0 : clip.gain)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
}

/**
 * One video track. Each clip is a Sequence; a clip with `transitionToNext`
 * gets its tail extended by the window length (playing under the incoming
 * clip), and the incoming clip is wrapped in the matching TransitionIn.
 * The extended tail is muted so audio doesn't double up.
 */
export function VideoTrackLayer({
  track,
  assetUrls,
}: {
  track: VideoTrack;
  assetUrls: Record<string, string>;
}) {
  return (
    <AbsoluteFill>
      {track.clips.map((clip, i) => {
        const src = assetUrls[clip.assetId];
        if (!src) return null;

        const prev = i > 0 ? track.clips[i - 1] : null;
        const incomingTransition =
          prev &&
          prev.transitionToNext &&
          prev.startFrame + clipDuration(prev) === clip.startFrame
            ? prev.transitionToNext
            : null;

        // tail under the NEXT clip's window
        const next = track.clips[i + 1];
        const tailFrames =
          clip.transitionToNext &&
          next &&
          clip.startFrame + clipDuration(clip) === next.startFrame
            ? clip.transitionToNext.durationInFrames
            : 0;

        const content = (
          <VideoClipContent
            clip={clip}
            src={src}
            extraTailFrames={tailFrames}
          />
        );

        return (
          <Sequence
            key={clip.id}
            from={clip.startFrame}
            durationInFrames={clipDuration(clip) + tailFrames}
            premountFor={FPS}
          >
            {incomingTransition ? (
              <TransitionIn transition={incomingTransition}>
                {content}
              </TransitionIn>
            ) : (
              content
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
