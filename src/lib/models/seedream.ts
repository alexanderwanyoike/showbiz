import { fetch } from "./http";
import { ImageModelProvider } from "./types";
import { createKieTask, pollKieTask } from "./kie-shared";

async function blobToDataUrl(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

export const seedreamProvider: ImageModelProvider = {
  id: "seedream-4.5",
  name: "Seedream 4.5",
  description: "ByteDance's high-quality text-to-image model via kie.ai",
  apiKeyProvider: "kie",

  async generateImage(prompt: string, apiKey: string): Promise<string> {
    const taskId = await createKieTask(
      "seedream/4.5-text-to-image",
      { prompt },
      apiKey
    );
    const imageUrl = await pollKieTask(taskId, apiKey);
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to download Seedream image: ${imgRes.status}`);
    }
    const blob = await imgRes.blob();
    return blobToDataUrl(blob);
  },
};
