import type { VideoTransport, ImageTransport } from "./types";
import { kieVideoTransport } from "./kie-video";
import { kieImageTransport } from "./kie-image";
import { googleVideoTransport } from "./google-video";
import { googleImageTransport } from "./google-image";
import { ltxTransport } from "./ltx";
import { falVideoTransport } from "./fal-video";
import { falImageTransport } from "./fal-image";
import { replicateVideoTransport } from "./replicate-video";
import { replicateImageTransport } from "./replicate-image";

const videoTransports: Record<string, VideoTransport> = {
  "kie-video": kieVideoTransport,
  "google-video": googleVideoTransport,
  "ltx": ltxTransport,
  "fal-video": falVideoTransport,
  "replicate-video": replicateVideoTransport,
};

const imageTransports: Record<string, ImageTransport> = {
  "kie-image": kieImageTransport,
  "google-image": googleImageTransport,
  "fal-image": falImageTransport,
  "replicate-image": replicateImageTransport,
};

export function getVideoTransport(id: string): VideoTransport {
  const transport = videoTransports[id];
  if (!transport) throw new Error(`Unknown video transport: ${id}`);
  return transport;
}

export function getImageTransport(id: string): ImageTransport {
  const transport = imageTransports[id];
  if (!transport) throw new Error(`Unknown image transport: ${id}`);
  return transport;
}

export const VALID_VIDEO_TRANSPORTS = Object.keys(videoTransports);
export const VALID_IMAGE_TRANSPORTS = Object.keys(imageTransports);
