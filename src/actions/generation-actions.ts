import { resolveGenerationKey } from "../lib/generation-key";
import { DEFAULT_BIBLE_IMAGE_MODEL } from "../lib/bible-assets";
import {
  accountModelGeneration,
  type AgentAccounting,
  type GenerationSubject,
} from "../lib/model-generation-accounting";
import {
  getShotImageBase64,
  getShotEndFrameBase64,
  createVideoGenerationVersion,
  getCurrentVideoVersion,
} from "../lib/backend-api";
import {
  getImageModel,
  getVideoModel,
  ImageModelId,
  VideoModelId,
} from "../lib/models";
import { generateText } from "../lib/models/gemini-text";
import type { VideoGenerationRequest } from "../lib/generation/types";
import { videoCostRequest } from "../lib/shot-video";
import {
  IMAGE_GENERATION_REQUEST,
  imageCostRequest,
} from "../../shared/generation-cost";
import type { ImageRequestOptions } from "../../shared/model-config";

/** Refuses before any key is read or provider called, so a model never silently returns another shape. */
function requireShape(model: { name: string; aspectRatios: string[] }, options?: ImageRequestOptions) {
  const ratio = options?.aspectRatio;
  if (ratio && !model.aspectRatios.includes(ratio))
    throw new Error(
      `${model.name} cannot make ${ratio} pictures, which frames and shots need. Choose another image model.`,
    );
}

export async function generateImageAction(
  prompt: string,
  modelId: ImageModelId = "imagen4",
  subject?: GenerationSubject,
  agent?: AgentAccounting,
  options?: ImageRequestOptions,
): Promise<string> {
  const model = getImageModel(modelId);
  requireShape(model, options);
  const credential = await resolveGenerationKey(model.apiKeyProvider);
  if (!credential.ok) throw new Error(credential.error.message);
  const apiKey = credential.value;
  try {
    const result = await accountModelGeneration(
      modelId,
      IMAGE_GENERATION_REQUEST,
      subject,
      (observer) => model.generateImage(prompt, apiKey, observer, options),
      agent,
    );
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Image generation failed: ${errorMessage}`);
  }
}

export async function generateAndSaveVideoRequestAction(
  shotId: string,
  modelId: VideoModelId,
  request: VideoGenerationRequest,
  agent?: AgentAccounting,
): Promise<{ success: boolean; videoUrl: string | null; versionId?: string; error?: string }> {
  const model = getVideoModel(modelId);
  const credential = await resolveGenerationKey(model.apiKeyProvider);
  if (!credential.ok)
    return { success: false, videoUrl: null, error: credential.error.message };
  const apiKey = credential.value;
  try {
    let effectiveRequest = request;
    if (request.mode === "image-to-video") {
      effectiveRequest = {
        ...request,
        // Only frames the caller left undecided are loaded; null means the request does without.
        startImage:
          request.startImage === undefined ? await getShotImageBase64(shotId) : request.startImage,
        endImage:
          request.endImage === undefined ? await getShotEndFrameBase64(shotId) : request.endImage,
      };
    }
    const operation = await accountModelGeneration(
      modelId,
      videoCostRequest(
        request.settings,
        effectiveRequest.mode,
        !!effectiveRequest.endImage,
      ),
      { subject_id: shotId },
      async (observer) => {
        const videoBlob = model.generateVideoFromRequest
          ? await model.generateVideoFromRequest(
              effectiveRequest,
              apiKey,
              observer,
            )
          : await model.generateVideoBlob!(
              effectiveRequest.prompt,
              effectiveRequest.startImage ?? null,
              apiKey,
              effectiveRequest.settings,
              observer,
            );

        const arrayBuffer = await videoBlob.arrayBuffer();
        const videoData = Array.from(new Uint8Array(arrayBuffer));
        const mimeType = videoBlob.type || "video/mp4";
        const currentVersion = await getCurrentVideoVersion(shotId);
        const settingsJson = JSON.stringify({
          ...effectiveRequest.settings,
          generationMode: effectiveRequest.mode,
        });
        const result = await createVideoGenerationVersion(
          shotId,
          videoData,
          mimeType,
          effectiveRequest.prompt,
          settingsJson,
          modelId,
          currentVersion?.id ?? null,
        );
        return { success: true, videoUrl: result.video_url, versionId: result.id };
      },
      agent,
    );
    return operation.ok
      ? operation.value
      : { success: false, videoUrl: null, error: operation.error.message };
  } catch (error) {
    return {
      success: false,
      videoUrl: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function editImageAction(
  sourceImageBase64: string,
  editPrompt: string,
  modelId: ImageModelId = DEFAULT_BIBLE_IMAGE_MODEL,
  subject?: GenerationSubject,
  agent?: AgentAccounting,
  options?: ImageRequestOptions,
): Promise<string> {
  const model = getImageModel(modelId);
  requireShape(model, options);
  const credential = await resolveGenerationKey(model.apiKeyProvider);
  if (!credential.ok) throw new Error(credential.error.message);
  const apiKey = credential.value;
  if (!model.supportsImageEditing || !model.editImage)
    throw new Error(`${model.name} does not support image editing.`);
  try {
    const result = await accountModelGeneration(
      modelId,
      imageCostRequest("image_edit"),
      subject,
      (observer) =>
        model.editImage!(editPrompt, sourceImageBase64, apiKey, observer, options),
      agent,
    );
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Image edit failed: ${errorMessage}`);
  }
}

// Compose a single frame from a prompt plus one or more reference images
// (e.g. a Bible character + a location + a style). Used by the frame composer.
export async function composeFrameAction(
  prompt: string,
  referenceImages: string[],
  modelId: ImageModelId = DEFAULT_BIBLE_IMAGE_MODEL,
  subject?: GenerationSubject,
  agent?: AgentAccounting,
  options?: ImageRequestOptions,
): Promise<string> {
  const model = getImageModel(modelId);
  requireShape(model, options);
  const credential = await resolveGenerationKey(model.apiKeyProvider);
  if (!credential.ok) throw new Error(credential.error.message);
  const apiKey = credential.value;
  if (!model.composeImage)
    throw new Error(
      `${model.name} does not support multi-reference composition.`,
    );
  if (referenceImages.length === 0)
    throw new Error("Select at least one reference to compose a frame.");
  try {
    const result = await accountModelGeneration(
      modelId,
      imageCostRequest("image_compose"),
      subject,
      (observer) =>
        model.composeImage!(prompt, referenceImages, apiKey, observer, options),
      agent,
    );
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Frame composition failed: ${errorMessage}`);
  }
}

export async function generateVideoPromptFromImage(
  imageBase64: string,
): Promise<string> {
  const credential = await resolveGenerationKey("gemini");
  if (!credential.ok) throw new Error(credential.error.message);
  const apiKey = credential.value;
  const prompt = `You are a video prompt expert. Analyze this image and generate a compelling video prompt that:
1. Describes the scene in detail
2. Suggests natural camera movement or motion
3. Adds atmospheric details (lighting, mood)
4. Keeps it concise (2-3 sentences max)

Output ONLY the video prompt, nothing else.`;
  return generateText({ prompt, imageBase64, apiKey });
}

export async function enhanceVideoPrompt(
  existingPrompt: string,
): Promise<string> {
  const credential = await resolveGenerationKey("gemini");
  if (!credential.ok) throw new Error(credential.error.message);
  const apiKey = credential.value;
  const prompt = `You are a video prompt expert. Enhance this video prompt to be more effective for AI video generation:

Original prompt: "${existingPrompt}"

Make it:
1. More descriptive and specific
2. Include camera movement suggestions if missing
3. Add atmospheric/lighting details
4. Keep it concise (2-3 sentences max)

Output ONLY the enhanced prompt, nothing else.`;
  return generateText({ prompt, apiKey });
}
