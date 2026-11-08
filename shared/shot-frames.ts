export const SHOT_FRAME_ROLES = ["start", "end"] as const;
export type ShotFrameRole = (typeof SHOT_FRAME_ROLES)[number];
