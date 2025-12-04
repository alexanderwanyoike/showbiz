"use server";

import { getApiKey } from "../lib/data/settings";
import { getImageModel, getVideoModel, ImageModelId, VideoModelId } from "../lib/models";

/**
 * Generate an image using the specified model
 */
export async function generateImageAction(
  prompt: string,
  modelId: ImageModelId = "imagen4"
): Promise<string> {
  const model = getImageModel(modelId);
  const apiKey = getApiKey(model.apiKeyProvider);

  if (!apiKey) {
    throw new Error(
      `${model.apiKeyProvider.toUpperCase()} API key is not configured. Please add it in Settings.`
    );
  }

  try {
    return await model.generateImage(prompt, apiKey);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${model.name} Generation Error:`, errorMessage);
    throw new Error(`Image generation failed: ${errorMessage}`);
  }
}

/**
 * Generate a video using the specified model
 */
export async function generateVideoAction(
  prompt: string,
  imageBase64: string | null,
  modelId: VideoModelId = "veo3"
): Promise<string> {
  const model = getVideoModel(modelId);
  const apiKey = getApiKey(model.apiKeyProvider);

  if (!apiKey) {
    throw new Error(
      `${model.apiKeyProvider.toUpperCase()} API key is not configured. Please add it in Settings.`
    );
  }

  try {
    return await model.generateVideo(prompt, imageBase64, apiKey);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${model.name} Generation Error:`, errorMessage);
    throw new Error(errorMessage);
  }
}

// Re-export for backwards compatibility - these use default models
export { generateImageAction as generateImageWithImagen };
export { generateVideoAction as generateVideoWithVeo };
