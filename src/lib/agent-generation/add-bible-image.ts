import { addBibleTake } from "../bible-takes";
import { loadImage } from "../load-image";
import {
  addBibleImageRequestSchema,
  agentFailure,
  MAX_BIBLE_IMAGE_PIXELS,
  type AgentResult,
} from "../../../shared/agent-generation";
import { findProjectAsset, openProjectId } from "./project-lookup";

async function checkPicture(dataUrl: string): Promise<string | null> {
  const image = await loadImage(dataUrl).then(
    (loaded) => loaded,
    (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
  );
  if (typeof image === "string") return image;
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
