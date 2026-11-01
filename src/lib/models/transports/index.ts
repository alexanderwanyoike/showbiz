import { VALID_VIDEO_TRANSPORTS, VALID_IMAGE_TRANSPORTS } from "../../../../shared/model-transports";
export { VALID_VIDEO_TRANSPORTS, VALID_IMAGE_TRANSPORTS } from "../../../../shared/model-transports";
import { localImageTransport, localVideoTransport } from "./local";
import { openRouterImageTransport, openRouterVideoTransport } from "./openrouter";
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
import { openaiImageTransport } from "./openai-image";
import { googleInteractionsImageTransport } from "./google-interactions-image";

const videoTransports: Record<(typeof VALID_VIDEO_TRANSPORTS)[number], VideoTransport> = {
  "local-video": localVideoTransport,
  "openrouter-video": openRouterVideoTransport,
  "kie-video": kieVideoTransport,
  "google-video": googleVideoTransport,
  "ltx": ltxTransport,
  "fal-video": falVideoTransport,
  "replicate-video": replicateVideoTransport,
};

const imageTransports: Record<(typeof VALID_IMAGE_TRANSPORTS)[number], ImageTransport> = {
  "local-image": localImageTransport,
  "openrouter-image": openRouterImageTransport,
  "kie-image": kieImageTransport,
  "google-image": googleImageTransport,
  "fal-image": falImageTransport,
  "replicate-image": replicateImageTransport,
  "openai-image": openaiImageTransport,
  "google-interactions-image": googleInteractionsImageTransport,
};

export function getVideoTransport(id: string): VideoTransport {
  const transport = Object.hasOwn(videoTransports, id) ? videoTransports[id as keyof typeof videoTransports] : undefined;
  if (!transport) throw new Error(`Unknown video transport: ${id}`);
  return transport;
}

export function getImageTransport(id: string): ImageTransport {
  const transport = Object.hasOwn(imageTransports, id) ? imageTransports[id as keyof typeof imageTransports] : undefined;
  if (!transport) throw new Error(`Unknown image transport: ${id}`);
  return transport;
}

