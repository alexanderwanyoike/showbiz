"use server";

import { getApiKey } from "../lib/data/settings";
import { getImageModel, getVideoModel, ImageModelId, VideoModelId } from "../lib/models";
import { generateText } from "../lib/models/gemini-text";

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

/**
 * Edit an image using the specified model (img2img / remix)
 */
export async function editImageAction(
  sourceImageBase64: string,
  editPrompt: string,
  modelId: ImageModelId = "nano-banana"
): Promise<string> {
  const model = getImageModel(modelId);
  const apiKey = getApiKey(model.apiKeyProvider);

  if (!apiKey) {
    throw new Error(
      `${model.apiKeyProvider.toUpperCase()} API key is not configured. Please add it in Settings.`
    );
  }

  if (!model.supportsImageEditing || !model.editImage) {
    throw new Error(`${model.name} does not support image editing.`);
  }

  try {
    return await model.editImage(editPrompt, sourceImageBase64, apiKey);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${model.name} Edit Error:`, errorMessage);
    throw new Error(`Image edit failed: ${errorMessage}`);
  }
}

/**
 * Generate a video prompt by analyzing an image with Gemini Flash vision
 */
export async function generateVideoPromptFromImage(
  imageBase64: string
): Promise<string> {
  const apiKey = getApiKey("gemini");

  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please add it in Settings."
    );
  }

  const prompt = `You are a video prompt expert. Analyze this image and generate a compelling video prompt that:
1. Describes the scene in detail
2. Suggests natural camera movement or motion
3. Adds atmospheric details (lighting, mood)
4. Keeps it concise (2-3 sentences max)

Output ONLY the video prompt, nothing else.`;

  try {
    return await generateText({
      prompt,
      imageBase64,
      apiKey,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Video Prompt Generation Error:", errorMessage);
    throw new Error(`Failed to generate video prompt: ${errorMessage}`);
  }
}

/**
 * Enhance an existing video prompt to be more effective
 */
export async function enhanceVideoPrompt(
  existingPrompt: string
): Promise<string> {
  const apiKey = getApiKey("gemini");

  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please add it in Settings."
    );
  }

  const prompt = `You are a video prompt expert. Enhance this video prompt to be more effective for AI video generation:

Original prompt: "${existingPrompt}"

Make it:
1. More descriptive and specific
2. Include camera movement suggestions if missing
3. Add atmospheric/lighting details
4. Keep it concise (2-3 sentences max)

Output ONLY the enhanced prompt, nothing else.`;

  try {
    return await generateText({
      prompt,
      apiKey,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Video Prompt Enhancement Error:", errorMessage);
    throw new Error(`Failed to enhance video prompt: ${errorMessage}`);
  }
}

// Re-export for backwards compatibility - these use default models
export { generateImageAction as generateImageWithImagen };
export { generateVideoAction as generateVideoWithVeo };
