export const VALID_VIDEO_TRANSPORTS = [
  "local-video",
  "openrouter-video",
  "kie-video",
  "google-video",
  "ltx",
  "fal-video",
  "replicate-video",
] as const;
export const VALID_IMAGE_TRANSPORTS = [
  "local-image",
  "openrouter-image",
  "kie-image",
  "google-image",
  "fal-image",
  "replicate-image",
  "openai-image",
  "google-interactions-image",
] as const;
/** Image transports that map a requested aspect ratio onto their provider's parameter. */
export const SHAPED_IMAGE_TRANSPORTS: readonly (typeof VALID_IMAGE_TRANSPORTS)[number][] = [
  "google-image",
  "google-interactions-image",
  "openrouter-image",
  "fal-image",
];
export const FAL_SHAPE_PARAMS: readonly string[] = ["aspect_ratio", "image_size"];
