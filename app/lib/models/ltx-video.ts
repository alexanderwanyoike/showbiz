import { VideoModelProvider, blobToBase64 } from "./types";

const BASE_URL = "https://api.ltx.video/v1";

export const ltxVideoProvider: VideoModelProvider = {
  id: "ltx-video",
  name: "LTX Video",
  description: "Fast, high-quality open-source video generation",
  apiKeyProvider: "ltx",
  supportsImageToVideo: true,
  supportsTextToVideo: true,

  async generateVideo(
    prompt: string,
    imageBase64: string | null,
    apiKey: string
  ): Promise<string> {
    // Choose endpoint based on whether we have an image
    const endpoint = imageBase64 ? "image-to-video" : "text-to-video";
    const url = `${BASE_URL}/${endpoint}`;

    console.log(`Calling LTX Video API (${endpoint}) for video...`, prompt);

    interface LtxRequestBody {
      prompt: string;
      model: string;
      duration: number;
      resolution: string;
      image_uri?: string;
    }

    const body: LtxRequestBody = {
      prompt,
      model: "ltx-2-pro",
      duration: 8,
      resolution: "1920x1080",
    };

    // If we have an image, we need to provide it as a data URI
    if (imageBase64) {
      // LTX expects image_uri - for base64 data, we pass it directly
      body.image_uri = imageBase64.startsWith("data:")
        ? imageBase64
        : `data:image/png;base64,${imageBase64}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorText;
      } catch {
        errorMessage = errorText;
      }

      if (response.status === 401) {
        throw new Error("LTX API key is invalid or expired");
      }
      if (response.status === 429) {
        throw new Error("LTX API rate limit exceeded. Please try again later.");
      }
      if (response.status === 402) {
        throw new Error("LTX API credits exhausted. Please add more credits.");
      }

      throw new Error(`LTX Video generation failed: ${errorMessage}`);
    }

    // LTX returns the video directly as MP4
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("video/mp4")) {
      // Response is direct video data
      const videoBlob = await response.blob();
      return blobToBase64(videoBlob);
    }

    // If response is JSON, it might be an async operation
    const data = await response.json();

    if (data.video_url) {
      // Download the video from the URL
      const videoResponse = await fetch(data.video_url);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status}`);
      }
      const videoBlob = await videoResponse.blob();
      return blobToBase64(videoBlob);
    }

    if (data.video_base64) {
      return `data:video/mp4;base64,${data.video_base64}`;
    }

    throw new Error("Unexpected response format from LTX Video API");
  },
};
