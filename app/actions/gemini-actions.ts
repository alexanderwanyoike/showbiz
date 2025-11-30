"use server";

// Configuration - can be overridden via environment variables
const IMAGEN_MODEL = process.env.IMAGEN_MODEL || "imagen-4.0-generate-001";
const VEO_MODEL = process.env.VEO_MODEL || "veo-3.0-generate-001";
const API_KEY = process.env.GEMINI_API_KEY;

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Parse Google API errors and return user-friendly messages
 */
function parseGoogleApiError(errorText: string, statusCode?: number): string {
  // Try to parse as JSON
  try {
    const errorJson = JSON.parse(errorText);
    const message = errorJson.error?.message || "";
    const status = errorJson.error?.status || "";

    // Rate limit / quota exceeded
    if (statusCode === 429 || status === "RESOURCE_EXHAUSTED") {
      return "You've exceeded your API quota. Please check your Google AI billing and rate limits.";
    }

    // Content policy violations
    if (message.includes("celebrity") || message.includes("real people")) {
      return "Content blocked: Google doesn't allow generating videos with real people's names or likenesses. Please remove any celebrity references.";
    }

    if (message.includes("safety") || message.includes("blocked")) {
      return "Content blocked: Your prompt was flagged by Google's safety filters. Please try a different prompt.";
    }

    // Return the actual message if we have one
    if (message) {
      return message;
    }
  } catch {
    // Not JSON, continue with string matching
  }

  // String-based matching for non-JSON errors
  if (errorText.includes("quota") || errorText.includes("429")) {
    return "You've exceeded your API quota. Please check your Google AI billing and rate limits.";
  }

  if (errorText.includes("celebrity") || errorText.includes("real people")) {
    return "Content blocked: Google doesn't allow generating videos with real people's names or likenesses.";
  }

  return errorText;
}

/**
 * Parse RAI (Responsible AI) filter reasons from Veo response
 */
function parseRaiFilterReasons(pollData: Record<string, unknown>): string | null {
  const response = pollData.response as Record<string, unknown> | undefined;
  const generateVideoResponse = response?.generateVideoResponse as Record<string, unknown> | undefined;
  const reasons = generateVideoResponse?.raiMediaFilteredReasons as string[] | undefined;

  if (reasons && reasons.length > 0) {
    return reasons[0];
  }
  return null;
}

export async function generateImageAction(prompt: string): Promise<string> {
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  try {
    const url = `${BASE_URL}/models/${IMAGEN_MODEL}:predict?key=${API_KEY}`;

    console.log(`Calling Imagen API (${IMAGEN_MODEL}) for Image...`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      const userMessage = parseGoogleApiError(errorText, response.status);
      throw new Error(userMessage);
    }

    const data = await response.json();

    // Response structure: predictions[0].bytesBase64Encoded
    const base64Image = data.predictions?.[0]?.bytesBase64Encoded;

    if (base64Image) {
      return `data:image/png;base64,${base64Image}`;
    }

    throw new Error("No image data found in Imagen response");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Imagen Generation Error:", errorMessage);
    throw new Error(`Image generation failed: ${errorMessage}`);
  }
}

export async function generateVideoAction(
  prompt: string,
  imageBase64: string | null
): Promise<string> {
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `${BASE_URL}/models/${VEO_MODEL}:predictLongRunning?key=${API_KEY}`;

  console.log(`Calling Veo API (${VEO_MODEL}) for video...`, prompt);

  try {
    // Build request body - with optional image for image-to-video
    interface VeoInstance {
      prompt: string;
      image?: {
        bytesBase64Encoded: string;
        mimeType: string;
      };
    }

    const instance: VeoInstance = { prompt };

    // If we have an image, add it for image-to-video generation
    if (imageBase64) {
      // Extract base64 data from data URL if needed
      let base64Data = imageBase64;
      let mimeType = "image/png";

      if (imageBase64.startsWith("data:")) {
        const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      instance.image = {
        bytesBase64Encoded: base64Data,
        mimeType
      };
    }

    // 1. Start Generation (Long Running Operation)
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [instance]
      })
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn("Veo model not found (404). Your API key might not have access.");
        throw new Error("Veo model not accessible. Your API key may not have access to Veo 3.");
      }
      const errorText = await response.text();
      const userMessage = parseGoogleApiError(errorText, response.status);
      throw new Error(userMessage);
    }

    const data = await response.json();
    const operationName = data.name;

    if (!operationName) {
      throw new Error("No operation name returned from Veo API");
    }

    console.log("Veo operation started:", operationName);

    // 2. Poll for Completion (5 minute timeout, poll every 10 seconds)
    const operationUrl = `${BASE_URL}/${operationName}?key=${API_KEY}`;
    const maxAttempts = 30; // 30 * 10s = 5 minutes
    const pollInterval = 10000; // 10 seconds

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const pollRes = await fetch(operationUrl);

      if (!pollRes.ok) {
        console.warn(`Poll request failed: ${pollRes.status}`);
        continue;
      }

      const pollData = await pollRes.json();

      console.log(`Polling Veo status (${attempts + 1}/${maxAttempts}):`, pollData.done ? "Done" : "In Progress");

      if (pollData.done) {
        if (pollData.error) {
          throw new Error(`Veo Generation Failed: ${pollData.error.message}`);
        }

        // Extract video URL from response
        // Path: response.generateVideoResponse.generatedSamples[0].video.uri
        const videoUri = pollData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;

        if (videoUri) {
          // The video URI requires authentication to download
          // We need to fetch it and return as a blob URL or proxy it
          console.log("Video generated, downloading from:", videoUri);

          const videoResponse = await fetch(videoUri, {
            headers: { "x-goog-api-key": API_KEY! }
          });

          if (!videoResponse.ok) {
            throw new Error(`Failed to download video: ${videoResponse.status}`);
          }

          const videoBlob = await videoResponse.blob();
          const videoBase64 = await blobToBase64(videoBlob);

          return videoBase64;
        }

        // Check for RAI filter reasons (content policy violations)
        const raiReason = parseRaiFilterReasons(pollData);
        if (raiReason) {
          console.log("Video blocked by RAI filter:", raiReason);
          throw new Error(raiReason);
        }

        // Log full response for debugging if URI not found
        console.log("Full Poll Response:", JSON.stringify(pollData, null, 2));
        throw new Error("Video generation failed. Please try a different prompt.");
      }
    }

    throw new Error("Veo generation timed out after 5 minutes");

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Veo Generation Error:", errorMessage);

    // Re-throw with the clean message (already user-friendly from parseGoogleApiError)
    throw new Error(errorMessage);
  }
}

// Helper to convert blob to base64 data URL
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${blob.type};base64,${base64}`;
}
