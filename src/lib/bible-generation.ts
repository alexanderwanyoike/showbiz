import {
  composeFrameAction,
  editImageAction,
  generateImageAction,
} from "../actions/generation-actions";
import { getBibleVariantImageBase64 } from "./backend-api";
import { prepareBibleImageDataUrl } from "./bible-takes";
import type {
  AgentAccounting,
  GenerationSubject,
} from "./model-generation-accounting";
import type { Result } from "../../shared/result";
import type { ImageRequestOptions } from "../../shared/model-config";

/** Composes from reference pictures and a prompt, or generates from the prompt alone without references. */
export async function composeBibleImage(
  variantIds: string[],
  prompt: string,
  modelId: string,
  subject: GenerationSubject,
  agent?: AgentAccounting,
  options?: ImageRequestOptions,
): Promise<string> {
  const images = (
    await Promise.all(variantIds.map((id) => getBibleVariantImageBase64(id)))
  ).filter((image): image is string => !!image);
  // An agent asked for exactly the planned pictures, so it never falls back to fewer.
  if (agent && images.length !== variantIds.length)
    throw new Error("A planned reference picture could not be read. Call generate again with a new request_id.");
  const raw =
    images.length > 0
      ? await composeFrameAction(prompt, images, modelId, subject, agent, options)
      : await generateImageAction(prompt, modelId, subject, agent, options);
  return prepareBibleImageDataUrl(raw);
}

export async function editBibleImage(
  sourceVariantId: string,
  instruction: string,
  modelId: string,
  subject: GenerationSubject,
  agent?: AgentAccounting,
  options?: ImageRequestOptions,
): Promise<Result<string>> {
  const source = await getBibleVariantImageBase64(sourceVariantId);
  if (!source)
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Couldn't read that picture." },
    };
  const raw = await editImageAction(
    source,
    instruction,
    modelId,
    subject,
    agent,
    options,
  );
  return { ok: true, value: await prepareBibleImageDataUrl(raw) };
}
