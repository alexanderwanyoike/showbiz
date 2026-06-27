const GENERATED_VARIANT_NAME_MAX = 50;

export function buildGeneratedVariantName(prompt: string): string {
  const compact = prompt.trim().replace(/\s+/g, " ");
  if (!compact) return "Generated variant";
  return compact.slice(0, GENERATED_VARIANT_NAME_MAX);
}

export interface VariantGenerationSource {
  prompt: string | null;
  model_id: string | null;
}

export function getVariantGenerationFields(
  variant: VariantGenerationSource,
  currentModelId: string
): { prompt: string; modelId: string } {
  return {
    prompt: variant.prompt ?? "",
    modelId: variant.model_id ?? currentModelId,
  };
}

export interface VariantMediaSource {
  id: string;
  media_url: string | null;
}

export function chooseVariantSource<T extends VariantMediaSource>(
  selectedVariant: T | null,
  primaryVariant: T | null
): T | null {
  if (selectedVariant?.media_url) return selectedVariant;
  return primaryVariant?.media_url ? primaryVariant : null;
}

export function extensionForDataUrl(dataUrl: string): "jpg" | "png" | "webp" | "gif" {
  const match = dataUrl.match(/^data:image\/([^;]+);base64,/);
  const subtype = match?.[1]?.toLowerCase();
  if (subtype === "jpeg" || subtype === "jpg") return "jpg";
  if (subtype === "webp") return "webp";
  if (subtype === "gif") return "gif";
  return "png";
}

function safeFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "variant";
}

export interface VariantExportSource {
  name: string | null;
  source_kind: string;
  created_at: string;
}

export function buildVariantExportFilename(
  assetName: string,
  variant: VariantExportSource,
  dataUrl: string
): string {
  const assetPart = safeFilenamePart(assetName);
  const variantPart = safeFilenamePart(variant.name ?? variant.source_kind ?? variant.created_at);
  return `${assetPart}_${variantPart}.${extensionForDataUrl(dataUrl)}`;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface VariantChoiceSource {
  id: string;
  is_primary: boolean;
  status: string;
}

export function findDefaultVariant<T extends VariantChoiceSource>(variants: T[]): T | null {
  return (
    variants.find((variant) => variant.is_primary) ??
    variants.find((variant) => variant.status === "approved") ??
    variants[0] ??
    null
  );
}

export function resolveSelectedVariantId<T extends VariantChoiceSource>(
  selectedVariantId: string | null | undefined,
  variants: T[]
): string | null {
  if (selectedVariantId && variants.some((variant) => variant.id === selectedVariantId)) {
    return selectedVariantId;
  }
  return findDefaultVariant(variants)?.id ?? null;
}

export interface ShotVideoSourceInput {
  imageUrl: string | null;
  prompt: string | null;
}

export function hasUsableShotVideoSource(input: ShotVideoSourceInput): boolean {
  return !!input.imageUrl || !!input.prompt?.trim();
}
