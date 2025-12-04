import { ImageModelProvider, parseGoogleApiError } from "./types";

const IMAGEN_MODEL = process.env.IMAGEN_MODEL || "imagen-4.0-generate-001";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export const imagenProvider: ImageModelProvider = {
  id: "imagen4",
  name: "Imagen 4",
  description: "Google's high-quality image generation model",
  apiKeyProvider: "gemini",

  async generateImage(prompt: string, apiKey: string): Promise<string> {
    const url = `${BASE_URL}/models/${IMAGEN_MODEL}:predict?key=${apiKey}`;

    console.log(`Calling Imagen API (${IMAGEN_MODEL}) for Image...`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const userMessage = parseGoogleApiError(errorText, response.status);
      throw new Error(userMessage);
    }

    const data = await response.json();
    const base64Image = data.predictions?.[0]?.bytesBase64Encoded;

    if (base64Image) {
      return `data:image/png;base64,${base64Image}`;
    }

    throw new Error("No image data found in Imagen response");
  },
};
