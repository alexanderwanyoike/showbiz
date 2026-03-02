import { fetch } from "./http";
import { parseGoogleApiError } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface VeoConfig {
  modelId: string;
  modelName: string;
  /** Initial poll interval in ms (default: 3000 for fast, 5000 for standard) */
  initialPollInterval?: number;
  /** Max poll interval in ms (default: 10000) */
  maxPollInterval?: number;
}

export function parseRaiFilterReasons(pollData: Record<string, unknown>): string | null {
  const response = pollData.response as Record<string, unknown> | undefined;
  const generateVideoResponse = response?.generateVideoResponse as
    | Record<string, unknown>
    | undefined;
  const reasons = generateVideoResponse?.raiMediaFilteredReasons as
    | string[]
    | undefined;

  if (reasons && reasons.length > 0) {
    return reasons[0];
  }
  return null;
}

/**
 * Shared Veo video generation implementation with adaptive polling.
 * Starts polling quickly and backs off exponentially.
 */
export async function generateVeoVideoBlob(
  prompt: string,
  imageBase64: string | null,
  apiKey: string,
  config: VeoConfig
): Promise<Blob> {
  const {
    modelId,
    modelName,
    initialPollInterval = 5000,
    maxPollInterval = 10000
  } = config;

  const url = `${BASE_URL}/models/${modelId}:predictLongRunning?key=${apiKey}`;

  console.log(`Calling Veo API (${modelId}) for video...`, prompt);

  interface VeoInstance {
    prompt: string;
    image?: {
      bytesBase64Encoded: string;
      mimeType: string;
    };
  }

  const instance: VeoInstance = { prompt };

  if (imageBase64) {
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
      mimeType,
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [instance],
    }),
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.warn(
        `${modelName} not found (404). Your API key might not have access.`
      );
      throw new Error(
        `${modelName} not accessible. Your API key may not have access.`
      );
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

  console.log(`${modelName} operation started:`, operationName);

  // Poll for completion with adaptive backoff
  // 5 minute timeout total
  const operationUrl = `${BASE_URL}/${operationName}?key=${apiKey}`;
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
  const startTime = Date.now();
  let pollInterval = initialPollInterval;
  let attemptCount = 0;

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    attemptCount++;

    const pollRes = await fetch(operationUrl);

    if (!pollRes.ok) {
      console.warn(`Poll request failed: ${pollRes.status}`);
      // Increase interval on failure
      pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
      continue;
    }

    const pollData = await pollRes.json();
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(
      `Polling ${modelName} status (attempt ${attemptCount}, ${elapsed}s elapsed):`,
      pollData.done ? "Done" : "In Progress"
    );

    if (pollData.done) {
      if (pollData.error) {
        throw new Error(`Veo Generation Failed: ${pollData.error.message}`);
      }

      const videoUri =
        pollData.response?.generateVideoResponse?.generatedSamples?.[0]?.video
          ?.uri;

      if (videoUri) {
        console.log("Video generated, downloading from:", videoUri);

        const videoResponse = await fetch(videoUri, {
          headers: { "x-goog-api-key": apiKey },
        });

        if (!videoResponse.ok) {
          throw new Error(
            `Failed to download video: ${videoResponse.status}`
          );
        }

        return await videoResponse.blob();
      }

      const raiReason = parseRaiFilterReasons(pollData);
      if (raiReason) {
        console.log("Video blocked by RAI filter:", raiReason);
        throw new Error(raiReason);
      }

      console.log("Full Poll Response:", JSON.stringify(pollData, null, 2));
      throw new Error(
        "Video generation failed. Please try a different prompt."
      );
    }

    // Exponential backoff: increase poll interval up to max
    pollInterval = Math.min(pollInterval * 1.2, maxPollInterval);
  }

  throw new Error(`${modelName} generation timed out after 5 minutes`);
}
