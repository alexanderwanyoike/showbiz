"use server";

import { getApiKey } from "../lib/data/settings";
import { getImageModel, getVideoModel, ImageModelId, VideoModelId } from "../lib/models";
import { generateText } from "../lib/models/gemini-text";
import { saveVideoBlob, getMediaUrl, deleteMedia, getImageAsBase64 } from "../lib/media";
import * as shotsDb from "../lib/data/shots";

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
 * Generate a video and save it directly to disk (avoids 10MB body size limit)
 * This is the preferred method for video generation as it never sends large
 * video data through Server Action request/response bodies.
 */
export async function generateAndSaveVideoAction(
  shotId: string,
  prompt: string,
  modelId: VideoModelId = "veo3"
): Promise<{ success: boolean; videoUrl: string | null; error?: string }> {
  const model = getVideoModel(modelId);
  const apiKey = getApiKey(model.apiKeyProvider);

  if (!apiKey) {
    return {
      success: false,
      videoUrl: null,
      error: `${model.apiKeyProvider.toUpperCase()} API key is not configured. Please add it in Settings.`,
    };
  }

  try {
    // Get the shot to check for existing image
    const shot = shotsDb.getShotById(shotId);
    if (!shot) {
      return { success: false, videoUrl: null, error: "Shot not found" };
    }

    // Get image as base64 from disk (already on server)
    const imageBase64 = shot.image_path ? getImageAsBase64(shot.image_path) : null;

    // Generate video using blob method (if available) to avoid unnecessary base64 encoding
    let videoBlob: Blob;
    if (model.generateVideoBlob) {
      videoBlob = await model.generateVideoBlob(prompt, imageBase64, apiKey);
    } else {
      // Fallback to base64 method and convert (shouldn't happen with our providers)
      const videoBase64 = await model.generateVideo(prompt, imageBase64, apiKey);
      const matches = videoBase64.match(/^data:video\/[^;]+;base64,(.+)$/);
      if (!matches) {
        throw new Error("Invalid video data format");
      }
      const binary = Buffer.from(matches[1], "base64");
      videoBlob = new Blob([binary], { type: "video/mp4" });
    }

    // Delete old video if exists
    if (shot.video_path) {
      deleteMedia(shot.video_path);
    }

    // Save video directly to disk
    const videoPath = await saveVideoBlob(shotId, videoBlob);

    // Update database
    shotsDb.updateShot(shotId, {
      video_path: videoPath,
      status: "complete",
    });

    return { success: true, videoUrl: getMediaUrl(videoPath) };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${model.name} Generation Error:`, errorMessage);

    // Update shot status to failed
    shotsDb.updateShot(shotId, {
      status: "failed",
    });

    return { success: false, videoUrl: null, error: errorMessage };
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
