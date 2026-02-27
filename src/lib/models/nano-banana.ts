import { fetch } from "./http";
import { ImageModelProvider, parseGoogleApiError } from "./types";

const MODEL_NAME = "gemini-2.5-flash-image";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function extractImageFromResponse(data: Record<string, unknown>): string {
  // Extract image from response
  // Response format: candidates[0].content.parts[].inlineData.data
  const candidates = data.candidates as Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> | undefined;
  const parts = candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || "image/png";
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image data found in Nano Banana response");
}

export const nanoBananaProvider: ImageModelProvider = {
  id: "nano-banana",
  name: "Nano Banana",
  description: "Fast image generation via Gemini 2.5 Flash",
  apiKeyProvider: "gemini",
  supportsImageEditing: true,
  supportsInpainting: false,

  async generateImage(prompt: string, apiKey: string): Promise<string> {
    const url = `${BASE_URL}/models/${MODEL_NAME}:generateContent`;

    console.log(`Calling Nano Banana (${MODEL_NAME}) for Image...`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const userMessage = parseGoogleApiError(errorText, response.status);
      throw new Error(userMessage);
    }

    const data = await response.json();
    return extractImageFromResponse(data);
  },

  async editImage(
    prompt: string,
    sourceImageBase64: string,
    apiKey: string
  ): Promise<string> {
    const url = `${BASE_URL}/models/${MODEL_NAME}:generateContent`;

    console.log(`Calling Nano Banana (${MODEL_NAME}) for Image Edit...`);

    // Extract base64 data and mime type from data URL
    const matches = sourceImageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid source image data URL format");
    }
    const mimeType = matches[1];
    const imageData = matches[2];

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageData,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const userMessage = parseGoogleApiError(errorText, response.status);
      throw new Error(userMessage);
    }

    const data = await response.json();
    return extractImageFromResponse(data);
  },
};
