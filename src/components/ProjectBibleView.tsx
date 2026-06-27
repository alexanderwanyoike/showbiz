import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, ImageIcon, Loader2, Plus, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createBible,
  createBibleAsset,
  createBibleAssetVariant,
  deleteBibleAssetVariant,
  getBibleAssetVariants,
  getBibleAssets,
  getBibleVariantImageBase64,
  getBibles,
  updateBibleAsset,
  updateBibleAssetVariantStatus,
  saveAssembledVideo,
  type Bible,
  type BibleAsset,
  type BibleAssetType,
  type BibleAssetVariant,
} from "../lib/tauri-api";
import { composeFrameAction, editImageAction, generateImageAction } from "../actions/generation-actions";
import { getAvailableImageModels, type ImageModelId } from "../lib/models";
import {
  buildGeneratedVariantName,
  buildVariantExportFilename,
  chooseVariantSource,
  dataUrlToBytes,
  extensionForDataUrl,
  getVariantGenerationFields,
} from "../lib/bible-assets";

const assetTypes: BibleAssetType[] = ["character", "location", "prop", "style", "reference", "note", "scene"];

// Asset types whose primary image can seed a composed scene frame.
const COMPOSABLE_REF_TYPES: BibleAssetType[] = ["character", "location", "prop", "style", "reference"];
const MAX_BIBLE_IMAGE_SIDE = 1600;
const BIBLE_IMAGE_QUALITY = 0.9;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Failed to read file"));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function downscaleImageDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_BIBLE_IMAGE_SIDE / Math.max(image.width, image.height));
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
    image.onerror = () => reject(new Error("Unsupported image format. Try PNG, JPEG, or WebP."));
    image.src = dataUrl;
  });
}

async function prepareBibleImageDataUrl(dataUrl: string): Promise<string> {
  return downscaleImageDataUrl(dataUrl);
}

interface ProjectBibleViewProps {
  projectId: string;
}

export default function ProjectBibleView({ projectId }: ProjectBibleViewProps) {
  const [bibles, setBibles] = useState<Bible[]>([]);
  const [selectedBibleId, setSelectedBibleId] = useState<string | null>(null);
  const [assets, setAssets] = useState<BibleAsset[]>([]);
  const [variants, setVariants] = useState<Record<string, BibleAssetVariant[]>>({});
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<BibleAssetType | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newBibleName, setNewBibleName] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState<BibleAssetType>("character");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetRules, setAssetRules] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [variantPrompt, setVariantPrompt] = useState("");
  const [sceneRefAssetIds, setSceneRefAssetIds] = useState<Set<string>>(new Set());
  const [imageModel, setImageModel] = useState<ImageModelId>("nano-banana");
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [spotlightVariantId, setSpotlightVariantId] = useState<string | null>(null);

  const imageModels = getAvailableImageModels();
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedVariants = selectedAsset ? variants[selectedAsset.id] ?? [] : [];
  const selectedPrimaryVariant = selectedVariants.find((variant) => variant.is_primary) ?? selectedVariants[0] ?? null;
  const selectedVariant = selectedVariants.find((variant) => variant.id === selectedVariantId) ?? null;
  const spotlightVariant = selectedVariants.find((variant) => variant.id === spotlightVariantId) ?? selectedPrimaryVariant;
  const spotlightIndex = spotlightVariant ? selectedVariants.findIndex((variant) => variant.id === spotlightVariant.id) : -1;

  const filteredAssets = useMemo(
    () => assets.filter((asset) => typeFilter === "all" || asset.asset_type === typeFilter),
    [assets, typeFilter]
  );

  const isScene = assetType === "scene";

  // Assets usable as references when composing a scene frame (those with a usable image).
  const sceneReferenceAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          COMPOSABLE_REF_TYPES.includes(asset.asset_type) &&
          (variants[asset.id] ?? []).some((variant) => variant.media_url)
      ),
    [assets, variants]
  );

  function toggleSceneRef(assetId: string) {
    setSceneRefAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  useEffect(() => {
    loadBibles();
  }, [projectId]);

  useEffect(() => {
    if (selectedBibleId) loadAssets(selectedBibleId);
  }, [selectedBibleId]);

  useEffect(() => {
    if (!selectedAsset) {
      setAssetName("");
      setAssetType("character");
      setAssetDescription("");
      setAssetRules("");
      setConsentConfirmed(false);
      return;
    }
    setAssetName(selectedAsset.name);
    setAssetType(selectedAsset.asset_type);
    setAssetDescription(selectedAsset.description ?? "");
    setAssetRules(selectedAsset.rules_json ?? "");
    setConsentConfirmed(selectedAsset.consent_confirmed);
  }, [selectedAssetId, assets]);

  useEffect(() => {
    if (!selectedAsset) {
      setSelectedVariantId(null);
      return;
    }
    setSelectedVariantId((prev) =>
      prev && selectedVariants.some((variant) => variant.id === prev)
        ? prev
        : selectedPrimaryVariant?.id ?? null
    );
    setSpotlightVariantId((prev) =>
      prev && selectedVariants.some((variant) => variant.id === prev)
        ? prev
        : selectedPrimaryVariant?.id ?? null
    );
  }, [selectedAssetId, selectedVariants, selectedPrimaryVariant]);

  useEffect(() => {
    setSceneRefAssetIds(new Set());
  }, [selectedAssetId]);

  async function loadBibles() {
    setIsLoading(true);
    try {
      const data = await getBibles(projectId);
      setBibles(data);
      setSelectedBibleId((prev) => prev ?? data[0]?.id ?? null);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAssets(bibleId: string) {
    const data = await getBibleAssets(bibleId);
    setAssets(data);
    setSelectedAssetId((prev) => prev && data.some((asset) => asset.id === prev) ? prev : data[0]?.id ?? null);
    const entries = await Promise.all(
      data.map(async (asset) => [asset.id, await getBibleAssetVariants(asset.id)] as const)
    );
    setVariants(Object.fromEntries(entries));
  }

  async function handleCreateBible() {
    if (!newBibleName.trim()) return;
    const bible = await createBible(projectId, newBibleName.trim(), null);
    setBibles((prev) => [bible, ...prev]);
    setSelectedBibleId(bible.id);
    setNewBibleName("");
  }

  function buildAssetInput() {
    return {
      asset_type: assetType,
      name: assetName.trim(),
      description: assetDescription.trim() || null,
      summary: null,
      tags_json: null,
      rules_json: assetRules.trim() || null,
      consent_confirmed: consentConfirmed,
    };
  }

  async function saveAssetDetails() {
    if (!selectedBibleId || !assetName.trim()) return null;
    const input = buildAssetInput();
    if (selectedAsset) {
      const updated = await updateBibleAsset(selectedAsset.id, input);
      setAssets((prev) => prev.map((asset) => asset.id === updated.id ? updated : asset));
      return updated;
    }
    const asset = await createBibleAsset(selectedBibleId, input);
    setAssets((prev) => [asset, ...prev]);
    setSelectedAssetId(asset.id);
    return asset;
  }

  function handleNewAsset() {
    setSelectedAssetId(null);
    setAssetName("");
    setAssetType("character");
    setAssetDescription("");
    setAssetRules("");
    setConsentConfirmed(false);
    setVariantPrompt("");
    setSelectedVariantId(null);
    setSpotlightVariantId(null);
  }

  function handleSelectVariant(variant: BibleAssetVariant) {
    setSelectedVariantId(variant.id);
    setSpotlightVariantId(variant.id);
    const fields = getVariantGenerationFields(variant, imageModel);
    setVariantPrompt(fields.prompt);
    if (imageModels.some((model) => model.id === fields.modelId)) {
      setImageModel(fields.modelId as ImageModelId);
    }
  }

  async function handleSaveAsset() {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const asset = await saveAssetDetails();
      if (!asset) setErrorMessage("Enter an asset name before saving.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Asset save failed: ${message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImportImage(file: File) {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const rawImageBase64 = await fileToDataUrl(file);
      const imageBase64 = await prepareBibleImageDataUrl(rawImageBase64);
      const asset = await saveAssetDetails();
      if (!asset) {
        setErrorMessage("Enter an asset name before importing an image.");
        return;
      }
      const variant = await createBibleAssetVariant(asset.id, {
        name: file.name,
        image_base64: imageBase64,
        source_kind: "uploaded",
        status: "approved",
        is_primary: (variants[asset.id] ?? []).length === 0,
      });
      setVariants((prev) => ({ ...prev, [asset.id]: [variant, ...(prev[asset.id] ?? [])] }));
      setSelectedVariantId(variant.id);
      setSpotlightVariantId(variant.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Image import failed: ${message}`);
    } finally {
      setIsBusy(false);
    }
  }

  // Fetch the primary image of each asset selected as a scene reference.
  async function collectSceneReferenceImages(): Promise<string[]> {
    const images: string[] = [];
    for (const refAssetId of sceneRefAssetIds) {
      const refVariants = variants[refAssetId] ?? [];
      const primary =
        refVariants.find((variant) => variant.is_primary && variant.media_url) ??
        refVariants.find((variant) => variant.media_url) ??
        null;
      if (primary) {
        const base64 = await getBibleVariantImageBase64(primary.id);
        if (base64) images.push(base64);
      }
    }
    return images;
  }

  async function handleGenerateVariant() {
    if (!variantPrompt.trim()) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const asset = await saveAssetDetails();
      if (!asset) {
        setErrorMessage("Enter an asset name before generating a variant.");
        return;
      }

      let generatedBase64: string;
      let sourceVariantId: string | null = null;
      let sourceKind: "generated" | "edited" = "generated";

      if (asset.asset_type === "scene") {
        const referenceImages = await collectSceneReferenceImages();
        if (referenceImages.length === 0) {
          setErrorMessage("Select at least one reference (character, location, ...) to compose a scene frame.");
          return;
        }
        generatedBase64 = await composeFrameAction(variantPrompt, referenceImages, imageModel);
      } else {
        const currentPrimary = (variants[asset.id] ?? []).find((variant) => variant.is_primary && variant.media_url) ?? null;
        const sourceVariant = chooseVariantSource(selectedVariant, currentPrimary);
        const sourceBase64 = sourceVariant ? await getBibleVariantImageBase64(sourceVariant.id) : null;
        generatedBase64 = sourceBase64
          ? await editImageAction(sourceBase64, variantPrompt, imageModel)
          : await generateImageAction(variantPrompt, imageModel);
        sourceVariantId = sourceVariant?.id ?? null;
        sourceKind = sourceVariant ? "edited" : "generated";
      }

      const imageBase64 = await prepareBibleImageDataUrl(generatedBase64);
      const variant = await createBibleAssetVariant(asset.id, {
        parent_variant_id: sourceVariantId,
        name: buildGeneratedVariantName(variantPrompt),
        image_base64: imageBase64,
        source_kind: sourceKind,
        prompt: variantPrompt,
        model_id: imageModel,
        status: "candidate",
        is_primary: (variants[asset.id] ?? []).length === 0,
      });
      setVariants((prev) => ({ ...prev, [asset.id]: [variant, ...(prev[asset.id] ?? [])] }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Variant generation failed: ${message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApproveVariant(variant: BibleAssetVariant) {
    const updated = await updateBibleAssetVariantStatus(variant.id, "approved", true);
    setVariants((prev) => ({
      ...prev,
      [updated.asset_id]: (prev[updated.asset_id] ?? []).map((item) =>
        item.id === updated.id ? updated : { ...item, is_primary: false }
      ),
    }));
  }

  async function handleDeleteVariant(variant: BibleAssetVariant) {
    if (!window.confirm("Delete this variant?")) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const deleted = await deleteBibleAssetVariant(variant.id);
      if (!deleted) return;
      const refreshed = await getBibleAssetVariants(variant.asset_id);
      setVariants((prev) => ({ ...prev, [variant.asset_id]: refreshed }));
      const fallbackId = refreshed.find((item) => item.is_primary)?.id ?? refreshed[0]?.id ?? null;
      setSelectedVariantId((prev) => prev === variant.id ? fallbackId : prev);
      setSpotlightVariantId((prev) => prev === variant.id ? fallbackId : prev);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Variant delete failed: ${message}`);
    } finally {
      setIsBusy(false);
    }
  }

  function moveSpotlight(delta: number) {
    if (selectedVariants.length === 0) return;
    const currentIndex = spotlightIndex >= 0 ? spotlightIndex : 0;
    const nextIndex = (currentIndex + delta + selectedVariants.length) % selectedVariants.length;
    setSpotlightVariantId(selectedVariants[nextIndex].id);
  }

  async function handleExportVariant(variant: BibleAssetVariant) {
    if (!selectedAsset) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const dataUrl = await getBibleVariantImageBase64(variant.id);
      if (!dataUrl) {
        setErrorMessage("This variant has no image to export.");
        return;
      }
      const extension = extensionForDataUrl(dataUrl);
      const savePath = await save({
        defaultPath: buildVariantExportFilename(selectedAsset.name, variant, dataUrl),
        filters: [{ name: "Image", extensions: [extension] }],
      });
      if (!savePath) return;
      await saveAssembledVideo(Array.from(dataUrlToBytes(dataUrl)), savePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Variant export failed: ${message}`);
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading) {
    return <div className="py-16 text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading Bible...</div>;
  }

  return (
    <div className="grid grid-cols-[220px_1fr_340px] gap-6 min-h-[calc(100vh-180px)]">
      <aside className="border-r border-border pr-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Bible</label>
          <Select value={selectedBibleId ?? ""} onValueChange={setSelectedBibleId}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="Select Bible" />
            </SelectTrigger>
            <SelectContent>
              {bibles.map((bible) => (
                <SelectItem key={bible.id} value={bible.id}>{bible.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Input className="h-8" placeholder="New Bible" value={newBibleName} onChange={(e) => setNewBibleName(e.target.value)} />
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleCreateBible}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1">
          {(["all", ...assetTypes] as const).map((type) => (
            <button
              key={type}
              className={`w-full text-left px-2 py-1.5 text-sm rounded ${typeFilter === type ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
              onClick={() => setTypeFilter(type)}
            >
              {type === "all" ? "All" : type[0].toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-5">
        {selectedAsset && (
          <div className="border border-border rounded bg-card overflow-hidden">
            <div className="bg-muted flex items-center justify-center overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
              {spotlightVariant?.media_url ? (
                <img
                  src={spotlightVariant.media_url}
                  alt={selectedAsset.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
              )}
            </div>
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedAsset.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedAsset.asset_type} · {selectedVariants.length} variants</p>
                </div>
              <div className="flex items-center gap-2">
                {spotlightVariant && (
                  <Badge variant={spotlightVariant.is_primary ? "default" : "secondary"}>
                    {spotlightVariant.is_primary ? "Primary" : `${spotlightIndex + 1}/${selectedVariants.length}`}
                  </Badge>
                )}
              </div>
              </div>
              {selectedVariants.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => moveSpotlight(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0 flex-1 text-center">
                    <p className="text-xs font-medium truncate">{spotlightVariant?.name ?? spotlightVariant?.source_kind ?? "Variant"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {spotlightVariant?.status} · {spotlightVariant?.source_kind}
                    </p>
                  </div>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => moveSpotlight(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {spotlightVariant?.media_url && (
                    <Button size="icon" variant="outline" className="h-8 w-8" disabled={isBusy} onClick={() => handleExportVariant(spotlightVariant)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
              {selectedAsset.description && <p className="text-xs text-muted-foreground">{selectedAsset.description}</p>}
              {selectedAsset.rules_json && <p className="text-xs text-muted-foreground">Rules: {selectedAsset.rules_json}</p>}
              {spotlightVariant?.prompt && (
                <div className="rounded border border-border bg-background p-2">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {spotlightVariant.is_primary ? "Primary variant prompt" : "Variant prompt"}
                  </p>
                  <p className="mt-1 text-xs whitespace-pre-wrap">{spotlightVariant.prompt}</p>
                </div>
              )}
            </div>
          </div>
        )}
        {filteredAssets.length === 0 ? (
          <div className="h-full min-h-80 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded">
            <ImageIcon className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Create or import Bible assets</p>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {filteredAssets.map((asset) => {
              const primary = (variants[asset.id] ?? []).find((variant) => variant.is_primary) ?? variants[asset.id]?.[0];
              return (
                <button
                  key={asset.id}
                  className={`text-left border rounded overflow-hidden bg-card hover:border-primary ${selectedAssetId === asset.id ? "border-primary" : "border-border"}`}
                  onClick={() => setSelectedAssetId(asset.id)}
                >
                  <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                    {primary?.media_url ? <img src={primary.media_url} alt={asset.name} className="w-full h-full object-cover" /> : <ImageIcon className="h-8 w-8 text-muted-foreground/50" />}
                  </div>
                  <div className="p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{asset.name}</p>
                      <Badge variant="secondary" className="text-[10px]">{asset.asset_type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{variants[asset.id]?.length ?? 0} variants</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="border-l border-border pl-4 space-y-4">
        {errorMessage && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {errorMessage}
          </div>
        )}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={isBusy} onClick={handleNewAsset}>
              <Plus className="h-4 w-4 mr-2" />New Asset
            </Button>
            <Button variant="outline" className="flex-1" disabled={isBusy || !assetName.trim()} onClick={handleSaveAsset}>
              <Save className="h-4 w-4 mr-2" />Save
            </Button>
          </div>
          <Input placeholder="Asset name" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
          <Select value={assetType} onValueChange={(value) => setAssetType(value as BibleAssetType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {assetTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea placeholder="Description / stable traits" value={assetDescription} onChange={(e) => setAssetDescription(e.target.value)} />
          <Textarea placeholder="Rules, e.g. never change hairstyle" value={assetRules} onChange={(e) => setAssetRules(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} />
            Real-person likeness consent confirmed
          </label>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={isBusy}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = (event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (file) handleImportImage(file);
              };
              input.click();
            }}
          >
            <Upload className="h-4 w-4 mr-2" />Import
          </Button>
        </div>

        <div className="space-y-2">
          <Select value={imageModel} onValueChange={(value) => setImageModel(value as ImageModelId)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {imageModels.map((model) => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {isScene && (
            <div className="space-y-1.5 rounded border border-border/60 p-2">
              <p className="text-xs font-medium text-muted-foreground">References (consistent characters, locations, props, style)</p>
              {sceneReferenceAssets.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Create and approve a character, location, prop or style first, then compose a frame from them.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sceneReferenceAssets.map((asset) => {
                    const primary =
                      (variants[asset.id] ?? []).find((v) => v.is_primary && v.media_url) ??
                      (variants[asset.id] ?? []).find((v) => v.media_url) ??
                      null;
                    const active = sceneRefAssetIds.has(asset.id);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => toggleSceneRef(asset.id)}
                        className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11px] transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                        title={`${asset.name} (${asset.asset_type})`}
                      >
                        <span className="h-7 w-7 shrink-0 overflow-hidden rounded bg-muted">
                          {primary?.media_url ? (
                            <img src={primary.media_url} alt={asset.name} className="h-full w-full object-cover" />
                          ) : null}
                        </span>
                        <span className="max-w-24 truncate">{asset.name}</span>
                        {active && <Check className="h-3 w-3 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <Textarea
            className="field-sizing-fixed min-h-40 resize-y overflow-auto leading-5"
            placeholder={isScene ? "Describe the moment to compose (the references keep characters consistent)..." : "Generate or transform variant..."}
            value={variantPrompt}
            onChange={(e) => setVariantPrompt(e.target.value)}
          />
          <Button
            className="w-full"
            disabled={isBusy || !variantPrompt.trim() || (isScene && sceneRefAssetIds.size === 0)}
            onClick={handleGenerateVariant}
          >
            {isBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {isScene ? "Compose Frame" : "Generate Variant"}
          </Button>
        </div>

        {selectedAsset && (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">{selectedAsset.name} Variants</p>
              {selectedVariant && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedVariant.name ?? selectedVariant.source_kind}
                </p>
              )}
            </div>
            {selectedVariant && (
              <div className="rounded border border-border bg-card p-2 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{selectedVariant.name ?? selectedVariant.source_kind}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {selectedVariant.status} · {selectedVariant.source_kind}
                      {selectedVariant.model_id ? ` · ${selectedVariant.model_id}` : ""}
                    </p>
                  </div>
                  {selectedVariant.is_primary && <Badge className="text-[10px] px-1 py-0">Primary</Badge>}
                </div>
                {selectedVariant.prompt && (
                  <div className="rounded bg-muted/60 p-2">
                    <p className="text-[10px] font-medium text-muted-foreground">Prompt</p>
                    <p className="mt-1 text-xs whitespace-pre-wrap break-words">{selectedVariant.prompt}</p>
                  </div>
                )}
                {selectedVariant.negative_prompt && (
                  <div className="rounded bg-muted/60 p-2">
                    <p className="text-[10px] font-medium text-muted-foreground">Negative prompt</p>
                    <p className="mt-1 text-xs whitespace-pre-wrap break-words">{selectedVariant.negative_prompt}</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={selectedVariant.is_primary || isBusy}
                    onClick={() => handleApproveVariant(selectedVariant)}
                  >
                    <Check className="h-3 w-3 mr-1" />Primary
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!selectedVariant.media_url || isBusy}
                    onClick={() => handleExportVariant(selectedVariant)}
                  >
                    <Download className="h-3 w-3 mr-1" />Export
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    disabled={isBusy}
                    onClick={() => handleDeleteVariant(selectedVariant)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />Delete
                  </Button>
                </div>
              </div>
            )}
            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-1">
              {selectedVariants.map((variant) => (
                <div
                  key={variant.id}
                  className={`flex items-center gap-2 border rounded bg-card p-1.5 text-left cursor-pointer ${selectedVariantId === variant.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/60"}`}
                  onClick={() => handleSelectVariant(variant)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") handleSelectVariant(variant);
                  }}
                >
                  <div className="h-12 w-16 shrink-0 rounded bg-muted overflow-hidden">
                    {variant.media_url ? (
                      <img src={variant.media_url} alt={variant.name ?? selectedAsset.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-medium truncate">{variant.name ?? variant.source_kind}</p>
                      {variant.is_primary && <Badge className="text-[10px] px-1 py-0">Primary</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {variant.status} · {variant.source_kind}
                    </p>
                    {variant.prompt && <p className="text-[10px] text-muted-foreground truncate">{variant.prompt}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
