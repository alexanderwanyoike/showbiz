import { getBibleVariantImageBase64, getVersionImageBase64 } from "../backend-api";
import {
  agentFailure,
  mediaPreviewRequestSchema,
  type AgentResult,
  type MediaPreview,
} from "../../../shared/agent-generation";

const PREVIEW_SIDE = 512;
type Shrink = (
  dataUrl: string,
  maxSide: number,
) => Promise<{ base64: string; width: number; height: number }>;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The picture could not be read."));
    image.src = dataUrl;
  });
}

export const shrinkToJpeg: Shrink = async (dataUrl, maxSide) => {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The preview could not be drawn.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    base64: canvas.toDataURL("image/jpeg", 0.8).replace(/^data:image\/jpeg;base64,/, ""),
    width: canvas.width,
    height: canvas.height,
  };
};

export async function previewMedia(
  input: unknown,
  shrink: Shrink = shrinkToJpeg,
): Promise<AgentResult<MediaPreview>> {
  const request = mediaPreviewRequestSchema.safeParse(input);
  if (!request.success)
    return agentFailure(
      "INVALID_INPUT",
      request.error.issues[0]?.message ?? "Invalid preview request.",
    );
  const { bible_variant_id, image_take_id } = request.data;
  // Read and decode errors can carry file system paths, which agents must never see.
  const unreadable = agentFailure("IO_ERROR", "That picture could not be read.");
  let dataUrl: string | null;
  try {
    dataUrl = bible_variant_id
      ? await getBibleVariantImageBase64(bible_variant_id)
      : await getVersionImageBase64(image_take_id ?? "");
  } catch {
    return unreadable;
  }
  if (!dataUrl)
    return agentFailure("NOT_FOUND", "No picture with that ID is in the open project.");
  let small: Awaited<ReturnType<Shrink>>;
  try {
    small = await shrink(dataUrl, PREVIEW_SIDE);
  } catch {
    return unreadable;
  }
  return {
    ok: true,
    value: { images: [{ mime_type: "image/jpeg", ...small }] },
  };
}
