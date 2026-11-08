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

/** Composes from reference pictures and a prompt, or generates from the prompt alone without references. */
export async function composeBibleImage(
  variantIds: string[],
  prompt: string,
  modelId: string,
  subject: GenerationSubject,
  agent?: AgentAccounting,
): Promise<string> {
  const images = (
    await Promise.all(variantIds.map((id) => getBibleVariantImageBase64(id)))
  ).filter((image): image is string => !!image);
  const accounting = agent ? ([agent] as const) : ([] as const);
  const raw =
    images.length > 0
      ? await composeFrameAction(prompt, images, modelId, subject, ...accounting)
      : await generateImageAction(prompt, modelId, subject, ...accounting);
  return prepareBibleImageDataUrl(raw);
}

export async function editBibleImage(
  sourceVariantId: string,
  instruction: string,
  modelId: string,
  subject: GenerationSubject,
  agent?: AgentAccounting,
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
    ...(agent ? ([agent] as const) : ([] as const)),
  );
  return { ok: true, value: await prepareBibleImageDataUrl(raw) };
}
