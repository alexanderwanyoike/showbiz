import { addBibleTake } from "../bible-takes";
import {
  addBibleImageRequestSchema,
  agentFailure,
  type AgentResult,
} from "../../../shared/agent-generation";
import { findProjectAsset, openProjectId } from "./project-lookup";

// Checked from the image header before full decoding, so a small file cannot claim an enormous canvas.
const MAX_BIBLE_IMAGE_PIXELS = 40_000_000;

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

async function checkPicture(dataUrl: string): Promise<string | null> {
  const image = await loadImage(dataUrl);
  if (!image) return "The picture could not be read.";
  if (image.naturalWidth * image.naturalHeight > MAX_BIBLE_IMAGE_PIXELS)
    return `The picture has more than ${MAX_BIBLE_IMAGE_PIXELS / 1_000_000} megapixels; send a smaller one.`;
  const decoded = await image.decode().then(
    () => true,
    () => false,
  );
  return decoded ? null : "The picture could not be decoded.";
}

/** Adds a caller's picture to a Bible entry, exactly as uploading a picture in the Bible does. */
export async function addBibleImage(input: unknown): Promise<AgentResult<{ variant_id: string }>> {
  const request = addBibleImageRequestSchema.safeParse(input);
  if (!request.success)
    return agentFailure("INVALID_INPUT", request.error.issues[0]?.message ?? "Invalid picture request.");
  const { bible_asset_id, mime_type, base64, name } = request.data;
  const project = await openProjectId();
  if (!project.ok) return project;
  if (!(await findProjectAsset(project.value, bible_asset_id)))
    return agentFailure("NOT_FOUND", "That Bible entry is not in the open project.");
  const dataUrl = `data:${mime_type};base64,${base64}`;
  const refusal = await checkPicture(dataUrl);
  if (refusal) return agentFailure("INVALID_INPUT", refusal);
  const take = await addBibleTake(bible_asset_id, dataUrl, {
    name: name ?? "Uploaded picture",
    source: "uploaded",
  });
  return { ok: true, value: { variant_id: take.id } };
}
