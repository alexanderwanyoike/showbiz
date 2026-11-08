import {
  getBibleAssetVariants,
  getBibleAssets,
  getBibles,
  getBibleVariantImageBase64,
  getCurrentImageVersion,
} from "../backend-api";
import { saveShotFrame } from "../shot-frames";
import {
  agentFailure,
  setShotFrameRequestSchema,
  type AgentResult,
  type SetShotFrameRequest,
} from "../../../shared/agent-generation";
import { findProjectShot, openProjectId } from "./project-lookup";

async function findBiblePicture(projectId: string, variantId: string) {
  for (const bible of await getBibles(projectId))
    for (const asset of await getBibleAssets(bible.id))
      if ((await getBibleAssetVariants(asset.id)).some((variant) => variant.id === variantId))
        return asset;
  return null;
}

/** Puts a Bible frame take into a shot's start or end frame, as the storyboard's frame picker does. */
export async function setShotFrameFromBible(
  input: unknown,
): Promise<AgentResult<Pick<SetShotFrameRequest, "shot_id" | "role">>> {
  const request = setShotFrameRequestSchema.safeParse(input);
  if (!request.success)
    return agentFailure("INVALID_INPUT", request.error.issues[0]?.message ?? "Invalid frame request.");
  const { shot_id, role, bible_variant_id } = request.data;
  const project = await openProjectId();
  if (!project.ok) return project;
  if (!(await findProjectShot(project.value, shot_id)))
    return agentFailure("NOT_FOUND", "That shot is not in the open project.");
  const asset = await findBiblePicture(project.value, bible_variant_id);
  if (!asset) return agentFailure("NOT_FOUND", "That picture is not in the open project's Bible.");
  if (asset.asset_type !== "reference")
    return agentFailure("INVALID_INPUT", "Shots take frames from the Bible's Frames, not characters or locations.");
  const dataUrl = await getBibleVariantImageBase64(bible_variant_id);
  if (!dataUrl) return agentFailure("NOT_FOUND", "That frame has no picture.");
  const parent = role === "start" ? ((await getCurrentImageVersion(shot_id))?.id ?? null) : null;
  await saveShotFrame(shot_id, role, dataUrl, parent);
  return { ok: true, value: { shot_id, role } };
}
