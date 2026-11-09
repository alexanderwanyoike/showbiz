import {
  createBibleAssetVariant,
  getBibleAssetVariants,
  updateBibleAssetVariantStatus,
} from "./backend-api";
import type { BibleAssetVariant } from "./backend-api";

const MAX_BIBLE_IMAGE_SIDE = 1600;
const BIBLE_IMAGE_QUALITY = 0.9;

export function prepareBibleImageDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(
        1,
        MAX_BIBLE_IMAGE_SIDE / Math.max(image.width, image.height),
      );
      if (scale === 1 && dataUrl.length < 4_000_000) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to prepare image canvas"));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", BIBLE_IMAGE_QUALITY));
    };
    image.onerror = () =>
      reject(new Error("Unsupported image format. Try PNG, JPEG, or WebP."));
    image.src = dataUrl;
  });
}

/** Saves a picture to a Bible entry as the Bible does; an entry's first picture becomes its current one. */
export async function addBibleTake(
  assetId: string,
  dataUrl: string,
  meta: {
    name: string;
    source: "generated" | "uploaded";
    prompt?: string | null;
    modelId?: string | null;
  },
): Promise<BibleAssetVariant> {
  const image_base64 = await prepareBibleImageDataUrl(dataUrl);
  const isFirst = (await getBibleAssetVariants(assetId)).length === 0;
  return createBibleAssetVariant(assetId, {
    name: meta.name,
    image_base64,
    source_kind: meta.source,
    status: "approved",
    prompt: meta.prompt ?? null,
    model_id: meta.modelId ?? null,
    is_primary: isFirst,
  });
}

/** Adds a generated take to a Bible entry and makes it the entry's primary picture. */
export async function addPrimaryBibleTake(
  assetId: string,
  preparedDataUrl: string,
  prompt: string | null,
  modelId: string,
): Promise<BibleAssetVariant> {
  const take = await createBibleAssetVariant(assetId, {
    name: (prompt ?? "take").slice(0, 40),
    image_base64: preparedDataUrl,
    source_kind: "generated",
    status: "approved",
    prompt,
    model_id: modelId,
    is_primary: false,
  });
  return updateBibleAssetVariantStatus(take.id, "approved", true);
}
