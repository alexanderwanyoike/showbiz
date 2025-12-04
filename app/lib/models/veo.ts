import { VideoModelProvider, parseGoogleApiError, blobToBase64 } from "./types";

const VEO_MODEL = process.env.VEO_MODEL || "veo-3.0-generate-001";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function parseRaiFilterReasons(pollData: Record<string, unknown>): string | null {
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

// Shared implementation that returns a Blob
async function generateVideoBlobInternal(
  prompt: string,
  imageBase64: string | null,
  apiKey: string
): Promise<Blob> {
  const url = `${BASE_URL}/models/${VEO_MODEL}:predictLongRunning?key=${apiKey}`;

  console.log(`Calling Veo API (${VEO_MODEL}) for video...`, prompt);

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
        "Veo model not found (404). Your API key might not have access."
      );
      throw new Error(
        "Veo model not accessible. Your API key may not have access to Veo 3."
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

  console.log("Veo operation started:", operationName);

  // Poll for completion (5 minute timeout, poll every 10 seconds)
  const operationUrl = `${BASE_URL}/${operationName}?key=${apiKey}`;
  const maxAttempts = 30;
  const pollInterval = 10000;

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const pollRes = await fetch(operationUrl);

    if (!pollRes.ok) {
      console.warn(`Poll request failed: ${pollRes.status}`);
      continue;
    }

    const pollData = await pollRes.json();

    console.log(
      `Polling Veo status (${attempts + 1}/${maxAttempts}):`,
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
  }

  throw new Error("Veo generation timed out after 5 minutes");
}

export const veoProvider: VideoModelProvider = {
  id: "veo3",
  name: "Veo 3",
  description: "Google's high-quality video generation model with audio",
  apiKeyProvider: "gemini",
  supportsImageToVideo: true,
  supportsTextToVideo: true,

  async generateVideo(
    prompt: string,
    imageBase64: string | null,
    apiKey: string
  ): Promise<string> {
    const videoBlob = await generateVideoBlobInternal(prompt, imageBase64, apiKey);
    return blobToBase64(videoBlob);
  },

  async generateVideoBlob(
    prompt: string,
    imageBase64: string | null,
    apiKey: string
  ): Promise<Blob> {
    return generateVideoBlobInternal(prompt, imageBase64, apiKey);
  },
};
