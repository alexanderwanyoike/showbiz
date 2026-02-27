import { parseGoogleApiError } from "./types";

const MODEL_NAME = "gemini-2.0-flash";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiTextOptions {
  prompt: string;
  imageBase64?: string; // Optional for vision calls (data URL format)
  apiKey: string;
}

function extractTextFromResponse(data: Record<string, unknown>): string {
  // Extract text from response
  // Response format: candidates[0].content.parts[].text
  const candidates = data.candidates as
    | Array<{ content?: { parts?: Array<{ text?: string }> } }>
    | undefined;
  const parts = candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.text) {
      return part.text.trim();
    }
  }
  throw new Error("No text found in Gemini response");
}

export async function generateText(options: GeminiTextOptions): Promise<string> {
  const { prompt, imageBase64, apiKey } = options;
  const url = `${BASE_URL}/models/${MODEL_NAME}:generateContent`;

  console.log(`Calling Gemini Flash (${MODEL_NAME}) for text generation...`);

  // Build parts array
  const parts: Array<
    { text: string } | { inline_data: { mime_type: string; data: string } }
  > = [{ text: prompt }];

  // Add image if provided (for vision calls)
  if (imageBase64) {
    const matches = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid image data URL format");
    }
    const mimeType = matches[1];
    const imageData = matches[2];

    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: imageData,
      },
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const userMessage = parseGoogleApiError(errorText, response.status);
    throw new Error(userMessage);
  }

  const data = await response.json();
  return extractTextFromResponse(data);
}
