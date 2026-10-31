import type {
  GenerationOutput,
  GenerationObserver,
} from "../../../../shared/generation-output";
import { generateOpenRouterImage } from "../openrouter-image";
import { generateOpenRouterVideo } from "../openrouter-video";
import type { ImageTransport, VideoTransport } from "./types";

async function media<T>(
  result: GenerationOutput<T>,
  observer?: GenerationObserver,
): Promise<T> {
  const receipt = result.ok ? result.value.receipt : result.receipt;
  if (receipt && observer) await observer.receipt(receipt);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.media;
}
export const openRouterImageTransport: ImageTransport = {
  async generateImage(config, prompt, apiKey, observer) {
    return media(
      await generateOpenRouterImage(
        { model: config.models.generate, prompt },
        apiKey,
      ),
      observer,
    );
  },
  async editImage(config, prompt, source, apiKey, observer) {
    return media(
      await generateOpenRouterImage(
        {
          model: config.models.edit ?? config.models.generate,
          prompt,
          references: [source],
        },
        apiKey,
      ),
      observer,
    );
  },
  async composeImage(config, prompt, references, apiKey, observer) {
    return media(
      await generateOpenRouterImage(
        { model: config.models.generate, prompt, references },
        apiKey,
      ),
      observer,
    );
  },
};
export const openRouterVideoTransport: VideoTransport = {
  async generateVideo(config, prompt, image, apiKey, settings, observer) {
    const model = image
      ? config.models.imageToVideo
      : config.models.textToVideo;
    if (!model)
      throw new Error(
        "This OpenRouter model does not support the requested video mode.",
      );
    return media(
      await generateOpenRouterVideo(
        model,
        {
          mode: image ? "image-to-video" : "text-to-video",
          prompt,
          startImage: image,
          settings,
        },
        apiKey,
      ),
      observer,
    );
  },
  async generateVideoRequest(config, request, apiKey, observer) {
    const model =
      request.mode === "image-to-video"
        ? config.models.imageToVideo
        : config.models.textToVideo;
    if (!model)
      throw new Error(
        "This OpenRouter model does not support the requested video mode.",
      );
    return media(
      await generateOpenRouterVideo(model, request, apiKey),
      observer,
    );
  },
};
