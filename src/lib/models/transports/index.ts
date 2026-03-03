import type { VideoTransport, ImageTransport } from "./types";
import { kieVideoTransport } from "./kie-video";
import { kieImageTransport } from "./kie-image";
import { googleVideoTransport } from "./google-video";
import { googleImageTransport } from "./google-image";
import { ltxTransport } from "./ltx";

// Placeholder transport — replaced with real implementations after provider agents merge
const notImplemented = (name: string) => {
  const handler = () => {
    throw new Error(`Transport "${name}" is not yet implemented`);
  };
  return handler;
};

const falVideoPlaceholder: VideoTransport = {
  generateVideo: notImplemented("fal-video") as VideoTransport["generateVideo"],
};
const falImagePlaceholder: ImageTransport = {
  generateImage: notImplemented("fal-image") as ImageTransport["generateImage"],
};
const replicateVideoPlaceholder: VideoTransport = {
  generateVideo: notImplemented("replicate-video") as VideoTransport["generateVideo"],
};
const replicateImagePlaceholder: ImageTransport = {
  generateImage: notImplemented("replicate-image") as ImageTransport["generateImage"],
};

const videoTransports: Record<string, VideoTransport> = {
  "kie-video": kieVideoTransport,
  "google-video": googleVideoTransport,
  "ltx": ltxTransport,
  "fal-video": falVideoPlaceholder,
  "replicate-video": replicateVideoPlaceholder,
};

const imageTransports: Record<string, ImageTransport> = {
  "kie-image": kieImageTransport,
  "google-image": googleImageTransport,
  "fal-image": falImagePlaceholder,
  "replicate-image": replicateImagePlaceholder,
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
