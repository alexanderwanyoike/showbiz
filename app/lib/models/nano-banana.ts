import { ImageModelProvider, parseGoogleApiError } from "./types";

const MODEL_NAME = "gemini-2.5-flash-image";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export const nanoBananaProvider: ImageModelProvider = {
  id: "nano-banana",
  name: "Nano Banana",
  description: "Fast image generation via Gemini 2.5 Flash",
  apiKeyProvider: "gemini",

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

    // Extract image from response
    // Response format: candidates[0].content.parts[].inlineData.data
    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data found in Nano Banana response");
  },
};
