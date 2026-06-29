import type { z } from "zod";
import type {
  audioClipSchema,
  badgeGraphicSchema,
  lowerThirdGraphicSchema,
  audioTrackSchema,
  clipSchema,
  colorGradeSchema,
  framingSchema,
  graphicClipSchema,
  graphicParamsSchema,
  graphicShapeSchema,
  graphicTrackSchema,
  overlayGraphicSchema,
  progressBarGraphicSchema,
  shapeGraphicSchema,
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
export type Framing = z.infer<typeof framingSchema>;
export type TransitionPreset = z.infer<typeof transitionPresetSchema>;
export type TransitionDirection = z.infer<typeof transitionDirectionSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type TextAnimationPreset = z.infer<typeof textAnimationPresetSchema>;
export type TextAnimation = z.infer<typeof textAnimationSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type TextClip = z.infer<typeof textClipSchema>;
export type GraphicClip = z.infer<typeof graphicClipSchema>;
export type GraphicParams = z.infer<typeof graphicParamsSchema>;
export type GraphicShape = z.infer<typeof graphicShapeSchema>;
export type OverlayGraphic = z.infer<typeof overlayGraphicSchema>;
export type ShapeGraphic = z.infer<typeof shapeGraphicSchema>;
export type ProgressBarGraphic = z.infer<typeof progressBarGraphicSchema>;
export type LowerThirdGraphic = z.infer<typeof lowerThirdGraphicSchema>;
export type BadgeGraphic = z.infer<typeof badgeGraphicSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type VideoTrack = z.infer<typeof videoTrackSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type TextTrack = z.infer<typeof textTrackSchema>;
export type GraphicTrack = z.infer<typeof graphicTrackSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
