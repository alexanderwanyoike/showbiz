import { getLocalGenerationConfig } from "../../local-generation-config";
import { generateLocalImage, generateLocalVideo } from "../local-generation";
import type { GenerationOutput, GenerationObserver } from "../../../../shared/generation-output";
import type { ImageTransport, VideoTransport } from "./types";

async function config() {
  const result = await getLocalGenerationConfig();
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
async function media<T>(result: GenerationOutput<T>, observer?: GenerationObserver): Promise<T> {
  if (!result.ok) throw new Error(result.error.message);
  if (observer) await observer.receipt(result.value.receipt);
  return result.value.media;
}
export const localImageTransport: ImageTransport = {
  async generateImage(_config, prompt, key, observer) {
    return media(await generateLocalImage(await config(), prompt, key), observer);
  },
};
export const localVideoTransport: VideoTransport = {
  async generateVideo(_config, prompt, image, key, settings, observer) {
    return media(await generateLocalVideo(await config(), {mode: image ? "image-to-video" : "text-to-video", prompt, startImage: image, settings}, key), observer);
  },
  async generateVideoRequest(_config, request, key, observer) {
    return media(await generateLocalVideo(await config(), request, key), observer);
  },
};
