import { editImageAction, generateImageAction } from "../actions/generation-actions";
import {
  createGenerationVersion,
  createRemixVersion,
  getVersionImageBase64,
  saveShotEndFrame,
} from "./backend-api";
import type {
  AgentAccounting,
  GenerationSubject,
} from "./model-generation-accounting";
import type { ShotFrameRole } from "../../shared/shot-frames";
import { FRAME_ASPECT_RATIO } from "../../shared/model-config";

const frameShape = { aspectRatio: FRAME_ASPECT_RATIO };

/** Generates a start frame from a prompt as a new take after the shot's current one. */
export async function generateShotStartFrame(
  shotId: string,
  prompt: string,
  modelId: string,
  subject: GenerationSubject,
  parentVersionId: string | null,
  agent?: AgentAccounting,
) {
  const image = await generateImageAction(prompt, modelId, subject, agent, frameShape);
  return createGenerationVersion(shotId, prompt, image, parentVersionId);
}

/** Edits a start frame take into a new remix take. */
export async function editShotStartFrame(
  shotId: string,
  sourceVersionId: string,
  instruction: string,
  modelId: string,
  subject: GenerationSubject,
  agent?: AgentAccounting,
) {
  const source = await getVersionImageBase64(sourceVersionId);
  if (!source) throw new Error("Failed to load source image");
  const edited = await editImageAction(source, instruction, modelId, subject, agent, frameShape);
  return createRemixVersion(shotId, sourceVersionId, instruction, edited);
}

/** Puts a picture into a shot's start frame (a new take) or its single end frame slot. */
export async function saveShotFrame(
  shotId: string,
  role: ShotFrameRole,
  dataUrl: string,
  parentVersionId: string | null,
) {
  if (role === "start")
    await createGenerationVersion(shotId, "Uploaded frame", dataUrl, parentVersionId);
  else await saveShotEndFrame(shotId, dataUrl);
}
