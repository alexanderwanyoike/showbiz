export interface ShotModelOverrides {
  image_model: string | null;
  video_model: string | null;
}
export type ShotModelsResult =
  | { ok: true; value: ShotModelOverrides }
  | {
      ok: false;
      error: { code: "INVALID_INPUT" | "NOT_FOUND"; message: string };
    };
