import type { z } from "zod";
import type {
  audioClipSchema,
  audioTrackSchema,
  clipSchema,
  colorGradeSchema,
  textAnimationPresetSchema,
  textAnimationSchema,
  textClipSchema,
  textTrackSchema,
  timelineSchema,
  trackSchema,
  transitionDirectionSchema,
  transitionPresetSchema,
  transitionSchema,
  videoClipSchema,
  videoTrackSchema,
} from "./schema";

export type ColorGrade = z.infer<typeof colorGradeSchema>;
export type TransitionPreset = z.infer<typeof transitionPresetSchema>;
export type TransitionDirection = z.infer<typeof transitionDirectionSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type TextAnimationPreset = z.infer<typeof textAnimationPresetSchema>;
export type TextAnimation = z.infer<typeof textAnimationSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type TextClip = z.infer<typeof textClipSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type VideoTrack = z.infer<typeof videoTrackSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type TextTrack = z.infer<typeof textTrackSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
