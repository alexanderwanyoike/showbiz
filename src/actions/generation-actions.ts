import { getApiKey, saveShotImage, saveAndCompleteVideo, getShotImageBase64, getVersionImageBase64, createVideoGenerationVersion, getCurrentVideoVersion } from "../lib/tauri-api";
import { getImageModel, getVideoModel, ImageModelId, VideoModelId } from "../lib/models";
import { generateText } from "../lib/models/gemini-text";
import type { VideoGenerationSettings } from "../lib/models/types";

export async function generateImageAction(prompt: string, modelId: ImageModelId = "imagen4"): Promise<string> {
  const model = getImageModel(modelId);
  const apiKey = await getApiKey(model.apiKeyProvider);
  if (!apiKey) throw new Error(`${model.apiKeyProvider.toUpperCase()} API key is not configured. Please add it in Settings.`);
  try {
    return await model.generateImage(prompt, apiKey);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Image generation failed: ${errorMessage}`);
  }
}

export async function generateAndSaveVideoAction(
  shotId: string,
  prompt: string,
  modelId: VideoModelId = "veo3",
  settings?: VideoGenerationSettings
): Promise<{ success: boolean; videoUrl: string | null; error?: string }> {
  const model = getVideoModel(modelId);
  const apiKey = await getApiKey(model.apiKeyProvider);
  if (!apiKey) {
    return { success: false, videoUrl: null, error: `${model.apiKeyProvider.toUpperCase()} API key is not configured. Please add it in Settings.` };
  }
  try {
    const imageBase64 = await getShotImageBase64(shotId);
    const effectiveSettings = settings ?? model.defaults;
    let videoBlob: Blob;
    if (model.generateVideoBlob) {
      videoBlob = await model.generateVideoBlob(prompt, imageBase64, apiKey, effectiveSettings);
    } else {
      const videoBase64 = await model.generateVideo(prompt, imageBase64, apiKey, effectiveSettings);
      const matches = videoBase64.match(/^data:video\/[^;]+;base64,(.+)$/);
      if (!matches) throw new Error("Invalid video data format");
      const binary = atob(matches[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      videoBlob = new Blob([bytes], { type: "video/mp4" });
    }
    // Convert blob to byte array for Tauri invoke
    const arrayBuffer = await videoBlob.arrayBuffer();
    const videoData = Array.from(new Uint8Array(arrayBuffer));
    const mimeType = videoBlob.type || "video/mp4";

    // Get current video version to use as parent (for regeneration)
    const currentVersion = await getCurrentVideoVersion(shotId);
    const parentVersionId = currentVersion?.id ?? null;

    // Create a new video version instead of overwriting
    const settingsJson = JSON.stringify(effectiveSettings);
    const result = await createVideoGenerationVersion(
      shotId,
      videoData,
      mimeType,
      prompt,
      settingsJson,
      modelId,
      parentVersionId
    );
    return { success: true, videoUrl: result.video_url };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, videoUrl: null, error: errorMessage };
  }
}

export async function editImageAction(sourceImageBase64: string, editPrompt: string, modelId: ImageModelId = "nano-banana"): Promise<string> {
  const model = getImageModel(modelId);
  const apiKey = await getApiKey(model.apiKeyProvider);
  if (!apiKey) throw new Error(`${model.apiKeyProvider.toUpperCase()} API key is not configured. Please add it in Settings.`);
  if (!model.supportsImageEditing || !model.editImage) throw new Error(`${model.name} does not support image editing.`);
  try {
    return await model.editImage(editPrompt, sourceImageBase64, apiKey);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Image edit failed: ${errorMessage}`);
  }
}

export async function generateVideoPromptFromImage(imageBase64: string): Promise<string> {
  const apiKey = await getApiKey("gemini");
  if (!apiKey) throw new Error("Gemini API key is not configured. Please add it in Settings.");
  const prompt = `You are a video prompt expert. Analyze this image and generate a compelling video prompt that:
1. Describes the scene in detail
2. Suggests natural camera movement or motion
3. Adds atmospheric details (lighting, mood)
4. Keeps it concise (2-3 sentences max)

Output ONLY the video prompt, nothing else.`;
  return generateText({ prompt, imageBase64, apiKey });
}

export async function enhanceVideoPrompt(existingPrompt: string): Promise<string> {
  const apiKey = await getApiKey("gemini");
  if (!apiKey) throw new Error("Gemini API key is not configured. Please add it in Settings.");
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
