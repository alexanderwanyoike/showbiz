import "../bible-workspace.css";
import "../bible-asset-workspace.css";
import {
  BibleAssetEntry,
  type BibleDetailFocusTargets,
} from "./BibleAssetEntry";
import { modelProviderName } from "../lib/model-provider";
import { ConfirmDeletion } from "./ConfirmDeletion";
import type { Result } from "../../shared/result";
import { GenerationCost } from "./GenerationCost";
import { useAgentChanges } from "../hooks/useAgentChanges";
import { useUnsavedWork } from "../hooks/useApplicationWork";
import { withApplicationWork } from "../lib/application-work";
import { composeBibleImage, editBibleImage } from "../lib/bible-generation";
import { frameAssetInput, frameName, frameRules } from "../../shared/bible-frame";
import {
  addPrimaryBibleTake,
  prepareBibleImageDataUrl,
} from "../lib/bible-takes";
import {
  IMAGE_GENERATION_REQUEST,
  imageCostRequest,
  imageGenerationKind,
} from "../../shared/generation-cost";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Upload, Sparkles, Plus, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BiblePicturePreview } from "./BiblePicturePreview";
import { BiblePictureTile } from "./BiblePictureTile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createBibleAsset,
  createBibleAssetVariant,
  deleteBibleAsset,
  deleteBibleAssetVariant,
  getBibleAssetVariants,
  getBibleAssets,
  getBibleVariantImageBase64,
  getBibles,
  updateBibleAsset,
  updateBibleAssetVariantStatus,
  type BibleAsset,
  type BibleAssetVariant,
} from "../lib/backend-api";
import {
  generateImageAction,
} from "../actions/generation-actions";
import {
  assetBasePrompt,
  assetReferences,
  builtFromLabel,
  parseRecipe,
  primaryPicture,
  recipeVariantIds,
  type FrameRecipe,
} from "../lib/bible-compose";
import {
  getAvailableImageModels,
  getImageModel,
  type ImageModelId,
} from "../lib/models";

type BibleGenerationContext = { modelId: string; projectId: string };

type ImageCapabilities = { editing: boolean; composition: boolean };
type BibleDeletion =
  | { kind: "asset"; asset: BibleAsset }
  | { kind: "picture"; variant: BibleAssetVariant };


function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Failed to read file"));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function pickImageFile(onFile: (file: File) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) onFile(file);
  };
  input.click();
}

type Tab = "characters" | "locations" | "frames";

interface ProjectBibleViewProps {
  projectId: string;
  initialTab?: Tab;
  generationModel: {
    value: ImageModelId;
    onChange: (model: ImageModelId) => void;
  };
}

export default function ProjectBibleView({
  projectId,
  initialTab = "characters",
  generationModel,
}: ProjectBibleViewProps) {
  const [composerOpen, setComposerOpen] = useState(true);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const newAction = useRef<HTMLButtonElement>(null);
  const deletionOrigin = useRef<HTMLElement | null>(null);
  const currentPicture = useRef<HTMLButtonElement>(null);
  const detailBack = useRef<HTMLButtonElement>(null);
  const detailFocus = { picture: currentPicture, back: detailBack };
  const [bibleId, setBibleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRequest = useRef(0);
  const [assets, setAssets] = useState<BibleAsset[]>([]);
  const [variants, setVariants] = useState<Record<string, BibleAssetVariant[]>>(
    {},
  );
  const [tab, setTab] = useState<Tab>(initialTab);
  const imageModel = generationModel.value;
  const setImageModel = generationModel.onChange;
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generatingAssetId, setGeneratingAssetId] = useState<string | null>(
    null,
  );
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<BibleDeletion | null>(null);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const pendingAssets = useRef(new Map<string, BibleAsset>());
  useAgentChanges(load);
  useEffect(() => {
    setTab(initialTab);
    setActiveAssetId(null);
  }, [initialTab, projectId]);

  const imageModels = getAvailableImageModels();
  const generationContext = { modelId: imageModel, projectId };
  const selectedModel = getImageModel(imageModel);
  const imageCapabilities = {
    editing: !!selectedModel.editImage,
    composition: !!selectedModel.composeImage,
  };

  useEffect(() => {
    void load();
    return () => {
      loadRequest.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function load() {
    const request = ++loadRequest.current;
    setLoading(true);
    setError(null);
    try {
      const bibles = await getBibles(projectId);
      const id = bibles[0]?.id ?? null;
      const list = id ? await getBibleAssets(id) : [];
      const entries = await Promise.all(
        list.map(
          async (asset) =>
            [asset.id, await getBibleAssetVariants(asset.id)] as const,
        ),
      );
      if (request !== loadRequest.current) return;
      setBibleId(id);
      setAssets(list);
      setVariants(Object.fromEntries(entries));
    } catch (cause) {
      if (request === loadRequest.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }

  async function refreshAsset(assetId: string) {
    setVariants((prev) => ({ ...prev }));
    const v = await getBibleAssetVariants(assetId);
    if (v.length) {
      for (const [key, pending] of pendingAssets.current) {
        if (pending.id === assetId) pendingAssets.current.delete(key);
      }
    }
    setVariants((prev) => ({ ...prev, [assetId]: v }));
  }

  const characters = assets.filter((a) => a.asset_type === "character");
  const locations = assets.filter((a) => a.asset_type === "location");
  // Frames are stored as "reference"-type bible assets: that value is allowed on
  // every database, whereas "scene" only exists in the newer schema.
  const frames = assets.filter((a) => a.asset_type === "reference");

  async function imageFromPrompt(
    prompt: string,
    subjectId: string,
  ): Promise<string> {
    const raw = await generateImageAction(prompt, imageModel, {
      project_id: projectId,
      subject_id: subjectId,
    });
    return prepareBibleImageDataUrl(raw);
  }

  async function addVariant(
    assetId: string,
    dataUrl: string,
    meta: {
      name: string;
      source: "generated" | "uploaded";
      prompt?: string | null;
    },
  ) {
    const image_base64 = await prepareBibleImageDataUrl(dataUrl);
    const isFirst = (variants[assetId] ?? []).length === 0;
    await createBibleAssetVariant(assetId, {
      name: meta.name,
      image_base64,
      source_kind: meta.source,
      status: "approved",
      prompt: meta.prompt ?? null,
      model_id: meta.source === "generated" ? imageModel : null,
      is_primary: isFirst,
    });
    await refreshAsset(assetId);
  }

  // Create a new character/location from a first picture.
  async function handleNewAsset(
    type: "character" | "location",
    name: string,
    prompt: string,
    file: File | null,
  ): Promise<Result<void>> {
    if (!bibleId || !name.trim())
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Enter a name before creating a Bible entry.",
        },
      };
    setError(null);
    setBusyId(`new-${type}`);
    try {
      await withApplicationWork(
        !file && prompt.trim() ? "generation" : "saving",
        async () => {
          const draftKey = `${type}:creation`;
          const pending = pendingAssets.current.get(draftKey);
          let asset = assets.find((entry) => entry.id === pending?.id);
          if (!asset || variants[asset.id]?.length) {
            asset = await createBibleAsset(bibleId, {
              asset_type: type,
              name: name.trim(),
              summary: null,
              description: null,
              tags_json: null,
              rules_json: null,
              consent_confirmed: false,
            });
            const created = asset;
            setAssets((prev) => [created, ...prev]);
            setVariants((prev) => ({ ...prev, [created.id]: [] }));
            pendingAssets.current.set(draftKey, asset);
          } else if (asset.name !== name.trim()) {
            asset = await updateBibleAsset(asset.id, {
              ...asset,
              name: name.trim(),
            });
            pendingAssets.current.set(draftKey, asset);
            const updated = asset;
            setAssets((previous) =>
              previous.map((entry) =>
                entry.id === updated.id ? updated : entry,
              ),
            );
          }
          if (!file && prompt.trim()) setGeneratingAssetId(asset.id);
          if (file) {
            await addVariant(asset.id, await fileToDataUrl(file), {
              name: file.name,
              source: "uploaded",
            });
          } else if (prompt.trim()) {
            await addVariant(
              asset.id,
              await imageFromPrompt(prompt, asset.id),
              { name: name.trim(), source: "generated", prompt },
            );
          }
          pendingAssets.current.delete(draftKey);
        },
      );
      return { ok: true, value: undefined };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false, error: { code: "IO_ERROR", message } };
    } finally {
      setGeneratingAssetId(null);
      setBusyId(null);
    }
  }

  async function handleAddPictureFromFile(asset: BibleAsset, file: File) {
    setError(null);
    setBusyId(asset.id);
    try {
      await withApplicationWork("saving", async () => {
        await addVariant(asset.id, await fileToDataUrl(file), {
          name: file.name,
          source: "uploaded",
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSetPrimary(variant: BibleAssetVariant) {
    setBusyId(variant.asset_id);
    setError(null);
    try {
      await withApplicationWork("saving", async () => {
        await updateBibleAssetVariantStatus(variant.id, "approved", true);
        await refreshAsset(variant.asset_id);
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The current take could not be changed. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function handleDeletePicture(variant: BibleAssetVariant) {
    deletionOrigin.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDeletion({ kind: "picture", variant });
    setDeletionOpen(true);
  }

  function handleDeleteAsset(asset: BibleAsset) {
    deletionOrigin.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDeletion({ kind: "asset", asset });
    setDeletionOpen(true);
  }

  async function confirmDeletion(): Promise<Result<null>> {
    if (!deletion)
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Choose a Bible entry or picture to delete.",
        },
      };
    const target = deletion;
    try {
      return await withApplicationWork("saving", async () => {
        const removed =
          target.kind === "asset"
            ? await deleteBibleAsset(target.asset.id)
            : await deleteBibleAssetVariant(target.variant.id);
        if (!removed)
          return {
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: "The item could not be deleted. Refresh and try again.",
            },
          };
        if (target.kind === "asset") {
          setAssets((prev) =>
            prev.filter((asset) => asset.id !== target.asset.id),
          );
          setVariants((prev) =>
            Object.fromEntries(
              Object.entries(prev).filter(([id]) => id !== target.asset.id),
            ),
          );
        } else {
          setVariants((prev) => ({
            ...prev,
            [target.variant.asset_id]: (
              prev[target.variant.asset_id] ?? []
            ).filter((variant) => variant.id !== target.variant.id),
          }));
          void refreshAsset(target.variant.asset_id).catch(() =>
            setError(
              "The picture was deleted, but its list could not be refreshed.",
            ),
          );
        }
        return { ok: true, value: null };
      });
    } catch (cause) {
      return {
        ok: false,
        error: {
          code: "IO_ERROR",
          message:
            cause instanceof Error
              ? cause.message
              : "Could not delete the Bible item.",
        },
      };
    }
  }

  function composeFromVariantIds(
    variantIds: string[],
    prompt: string,
    subjectId: string,
  ): Promise<string> {
    return composeBibleImage(variantIds, prompt, imageModel, {
      project_id: projectId,
      subject_id: subjectId,
    });
  }

  // Add a generated take to an asset and make it the new primary.
  async function addPrimaryTake(
    assetId: string,
    preparedDataUrl: string,
    prompt: string | null,
  ) {
    await addPrimaryBibleTake(assetId, preparedDataUrl, prompt, imageModel);
    await refreshAsset(assetId);
  }

  async function handleMakeFrame(recipe: FrameRecipe): Promise<Result<void>> {
    if (!bibleId || !recipe.prompt.trim())
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Describe the frame before generating it.",
        },
      };
    setError(null);
    setBusyId("make-frame");
    try {
      await withApplicationWork("generation", async () => {
        const draftKey = "frame:creation";
        const pending = pendingAssets.current.get(draftKey);
        let asset = assets.find((entry) => entry.id === pending?.id);
        if (!asset || variants[asset.id]?.length) {
          asset = await createBibleAsset(bibleId, frameAssetInput(recipe));
          const created = asset;
          setAssets((prev) => [created, ...prev]);
          setVariants((prev) => ({ ...prev, [created.id]: [] }));
          pendingAssets.current.set(draftKey, asset);
        } else if (asset.rules_json !== frameRules(recipe)) {
          asset = await updateBibleAsset(asset.id, {
            ...asset,
            name: frameName(recipe),
            rules_json: frameRules(recipe),
          });
          pendingAssets.current.set(draftKey, asset);
          const updated = asset;
          setAssets((previous) =>
            previous.map((entry) =>
              entry.id === updated.id ? updated : entry,
            ),
          );
        }
        setGeneratingAssetId(asset.id);
        const dataUrl = await composeFromVariantIds(
          recipeVariantIds(recipe, variants),
          recipe.prompt,
          asset.id,
        );
        await createBibleAssetVariant(asset.id, {
          name: recipe.prompt.slice(0, 40),
          image_base64: dataUrl,
          source_kind: "generated",
          status: "approved",
          prompt: recipe.prompt,
          model_id: imageModel,
          is_primary: true,
        });
        await refreshAsset(asset.id);
        pendingAssets.current.delete(draftKey);
      });
      return { ok: true, value: undefined };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false, error: { code: "IO_ERROR", message } };
    } finally {
      setGeneratingAssetId(null);
      setBusyId(null);
    }
  }

  // Retake any asset (re-roll), or vary it with a tweaked prompt. Stays on-model
  // by composing from the asset's references. The new take becomes the primary.
  async function handleRetake(
    asset: BibleAsset,
    promptOverride?: string,
  ): Promise<Result<void>> {
    setError(null);
    setBusyId(asset.id);
    try {
      const result = await withApplicationWork(
        "generation",
        async (): Promise<Result<void>> => {
          const prompt = (
            promptOverride ?? assetBasePrompt(asset, variants)
          ).trim();
          if (!prompt) {
            return {
              ok: false,
              error: { code: "INVALID_INPUT", message: "Add a prompt first." },
            };
          }
          const dataUrl = await composeFromVariantIds(
            assetReferences(asset, variants),
            prompt,
            asset.id,
          );
          await addPrimaryTake(asset.id, dataUrl, prompt);
          return { ok: true, value: undefined };
        },
      );
      if (!result.ok) setError(result.error.message);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false, error: { code: "IO_ERROR", message } };
    } finally {
      setBusyId(null);
    }
  }

  // Edit a specific picture with an instruction; the result becomes the primary.
  async function handleEdit(
    asset: BibleAsset,
    variant: BibleAssetVariant,
    instruction: string,
  ): Promise<Result<void>> {
    if (!instruction.trim())
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Describe the picture edit before generating it.",
        },
      };
    setError(null);
    setBusyId(asset.id);
    try {
      const result = await withApplicationWork(
        "generation",
        async (): Promise<Result<void>> => {
          const edited = await editBibleImage(
            variant.id,
            instruction,
            imageModel,
            { project_id: projectId, subject_id: asset.id },
          );
          if (!edited.ok) return edited;
          await addPrimaryTake(asset.id, edited.value, instruction);
          return { ok: true, value: undefined };
        },
      );
      if (!result.ok) setError(result.error.message);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false, error: { code: "IO_ERROR", message } };
    } finally {
      setBusyId(null);
    }
  }

  if (!bibleId) {
    return (
      <div className="space-y-3 p-6 text-sm text-muted-foreground">
        <p role={error ? "alert" : "status"}>
          {error ??
            (loading
              ? "Loading Bible…"
              : "This project's Bible is unavailable.")}
        </p>
        {!loading && (
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const selectedAssetId = assets.some((asset) => asset.id === activeAssetId)
    ? activeAssetId
    : null;
  const modelControl = (scope: string) => (
    <div className="bible-model-control">
      <div>
        <label
          htmlFor={`bible-generation-model-${scope}`}
          className="font-medium text-foreground"
        >
          Generation model
        </label>
        <p className="text-[10px]">
          Used for new pictures and retakes in this Bible view.
        </p>
      </div>
      <Select
        value={imageModel}
        onValueChange={(v) => setImageModel(v as ImageModelId)}
      >
        <SelectTrigger
          id={`bible-generation-model-${scope}`}
          aria-label="Bible generation model"
          disabled={!!busyId}
          className="h-8 w-full text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {imageModels.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              {m.name}
              {modelProviderName(m) ? ` · ${modelProviderName(m)}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const closeComposer = () => {
    setComposerOpen(false);
    newAction.current?.focus();
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as Tab);
        setActiveAssetId(null);
      }}
      className="gap-0"
      asChild
    >
      <section
        role="region"
        aria-label="Project bible"
        className="bible-workspace flex h-full flex-col"
      >
        {/* Tabs + model */}
        <div className="bible-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
          <TabsList aria-label="Bible sections">
            {(["characters", "locations", "frames"] as Tab[]).map((t) => (
              <TabsTrigger key={t} value={t} className="text-xs capitalize">
                {t[0].toUpperCase() + t.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>
          {!selectedAssetId && (
            <Button
              ref={newAction}
              size="sm"
              className="bible-new-action"
              aria-expanded={composerOpen}
              onClick={() => setComposerOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> New{" "}
              {tab === "characters"
                ? "character"
                : tab === "locations"
                  ? "location"
                  : "frame"}
            </Button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mx-4 mt-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        <div className="bible-sections">
          {(["characters", "locations"] as const).map((assetTab) => (
            <TabsContent
              key={assetTab}
              value={assetTab}
              forceMount
              hidden={tab !== assetTab}
              className={tab === assetTab ? "bible-active-section" : "hidden"}
            >
              <AssetTab
                composerOpen={composerOpen}
                onCloseComposer={closeComposer}
                modelControl={modelControl(assetTab)}
                detailFocus={detailFocus}
                detailModelControl={modelControl(`${assetTab}-detail`)}
                activeAssetId={selectedAssetId}
                onOpenAsset={setActiveAssetId}
                onBack={() => setActiveAssetId(null)}
                type={assetTab === "characters" ? "character" : "location"}
                label={assetTab === "characters" ? "character" : "location"}
                assets={assetTab === "characters" ? characters : locations}
                variants={variants}
                busyId={busyId}
                generatingAssetId={generatingAssetId}
                onNew={handleNewAsset}
                onClearDraft={() => {
                  for (const key of pendingAssets.current.keys())
                    if (
                      key.startsWith(
                        `${assetTab === "characters" ? "character" : "location"}:`,
                      )
                    )
                      pendingAssets.current.delete(key);
                }}
                onRetake={handleRetake}
                onEdit={handleEdit}
                imageCapabilities={imageCapabilities}
                generationContext={generationContext}
                onUpload={handleAddPictureFromFile}
                onSetPrimary={handleSetPrimary}
                onDeleteTake={handleDeletePicture}
                onDeleteAsset={handleDeleteAsset}
                onExpand={setLightbox}
              />
            </TabsContent>
          ))}

          <TabsContent
            value="frames"
            forceMount
            hidden={tab !== "frames"}
            className={tab === "frames" ? "bible-active-section" : "hidden"}
          >
            <FramesTab
              composerOpen={composerOpen}
              onCloseComposer={closeComposer}
              modelControl={modelControl("frames")}
              detailFocus={detailFocus}
              detailModelControl={modelControl("frames-detail")}
              activeAssetId={selectedAssetId}
              onOpenAsset={setActiveAssetId}
              onBack={() => setActiveAssetId(null)}
              characters={characters}
              locations={locations}
              frames={frames}
              variants={variants}
              busyId={busyId}
              generatingAssetId={generatingAssetId}
              onMakeFrame={handleMakeFrame}
              onClearDraft={() => {
                for (const key of pendingAssets.current.keys())
                  if (key.startsWith("frame:"))
                    pendingAssets.current.delete(key);
              }}
              onRetake={handleRetake}
              onEdit={handleEdit}
              imageCapabilities={imageCapabilities}
              generationContext={generationContext}
              onSetPrimary={handleSetPrimary}
              onDeleteTake={handleDeletePicture}
              onDeleteFrame={handleDeleteAsset}
              onExpand={setLightbox}
            />
          </TabsContent>
        </div>

        {lightbox && (
          <BiblePicturePreview
            url={lightbox}
            onClose={() => setLightbox(null)}
          />
        )}
        <ConfirmDeletion
          restoreFocus={() => {
            if (deletionOrigin.current?.isConnected)
              deletionOrigin.current.focus();
            else
              (currentPicture.current && !currentPicture.current.disabled
                ? currentPicture.current
                : (detailBack.current ?? newAction.current)
              )?.focus();
          }}
          open={deletionOpen}
          onOpenChange={setDeletionOpen}
          title={
            deletion?.kind === "asset" ? "Delete Bible entry" : "Delete picture"
          }
          description={
            deletion?.kind === "asset"
              ? `Delete “${deletion.asset.name}” and all its pictures? This cannot be undone.`
              : "Delete this picture from the Bible? This cannot be undone."
          }
          actionLabel={
            deletion?.kind === "asset" ? "Delete entry" : "Delete picture"
          }
          onConfirm={confirmDeletion}
        />
      </section>
    </Tabs>
  );
}

// Characters / Locations: a "New" form, then a card per asset.
function AssetTab({
  composerOpen,
  onCloseComposer,
  modelControl,
  detailModelControl,
  detailFocus,
  activeAssetId,
  onOpenAsset,
  onBack,
  type,
  label,
  assets,
  variants,
  busyId,
  generatingAssetId,
  onNew,
  onClearDraft,
  onRetake,
  onEdit,
  imageCapabilities,
  generationContext,
  onUpload,
  onSetPrimary,
  onDeleteTake,
  onDeleteAsset,
  onExpand,
}: {
  composerOpen: boolean;
  onCloseComposer: () => void;
  modelControl: ReactNode;
  detailModelControl: ReactNode;
  detailFocus: BibleDetailFocusTargets;
  activeAssetId: string | null;
  onOpenAsset: (id: string) => void;
  onBack: () => void;
  type: "character" | "location";
  label: string;
  assets: BibleAsset[];
  variants: Record<string, BibleAssetVariant[]>;
  busyId: string | null;
  generatingAssetId: string | null;
  onNew: (
    type: "character" | "location",
    name: string,
    prompt: string,
    file: File | null,
  ) => Promise<Result<void>>;
  onClearDraft: () => void;
  onRetake: (
    asset: BibleAsset,
    promptOverride?: string,
  ) => Promise<Result<void>>;
  imageCapabilities: ImageCapabilities;
  generationContext: BibleGenerationContext;
  onEdit: (
    asset: BibleAsset,
    variant: BibleAssetVariant,
    instruction: string,
  ) => Promise<Result<void>>;
  onUpload: (asset: BibleAsset, file: File) => void;
  onSetPrimary: (variant: BibleAssetVariant) => void;
  onDeleteTake: (variant: BibleAssetVariant) => void;
  onDeleteAsset: (asset: BibleAsset) => void;
  onExpand: (url: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  useUnsavedWork("draft", !!newName || !!newPrompt, `${newName}\0${newPrompt}`);
  const creating = busyId === `new-${type}`;

  return (
    <div
      className="bible-section-layout"
      data-composer-open={composerOpen && !activeAssetId}
      data-detail-open={!!activeAssetId}
    >
      {/* New */}
      <aside
        className="bible-composer"
        aria-label={`New ${label}`}
        hidden={!composerOpen || !!activeAssetId}
      >
        <div className="bible-panel-heading">
          <h3>New {label}</h3>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close creation panel"
            onClick={onCloseComposer}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="bible-composer-body">
          {modelControl}
          <div className="bible-create-fields">
            <label className="grid gap-1 text-[11px] text-muted-foreground">
              <span>Name</span>
              <Input
                disabled={busyId !== null}
                className="h-8 text-xs"
                aria-label={`${type === "character" ? "Character" : "Location"} name`}
                placeholder={`${label} name`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label className="grid flex-1 gap-1 text-[11px] text-muted-foreground">
              <span>Prompt for generation</span>
              <Textarea
                disabled={busyId !== null}
                className="bible-prompt text-xs resize-none"
                aria-label={`${type === "character" ? "Character" : "Location"} prompt`}
                placeholder="Describe it (or just upload a picture)..."
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="bible-composer-footer">
          <div className="bible-cost">
            <GenerationCost
              modelId={generationContext.modelId}
              request={IMAGE_GENERATION_REQUEST}
              subject={{ project_id: generationContext.projectId }}
            />
          </div>
          <div className="bible-create-actions">
            <Button
              size="sm"
              className="text-xs"
              disabled={busyId !== null || !newName.trim() || !newPrompt.trim()}
              onClick={async () => {
                const result = await onNew(type, newName, newPrompt, null);
                if (result.ok) {
                  setNewName("");
                  setNewPrompt("");
                }
              }}
            >
              {creating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Generate {label}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              aria-label={`Upload ${label} picture`}
              disabled={busyId !== null || !newName.trim()}
              onClick={() =>
                pickImageFile(async (file) => {
                  const result = await onNew(type, newName, "", file);
                  if (result.ok) {
                    setNewName("");
                    setNewPrompt("");
                  }
                })
              }
            >
              <Upload className="h-3 w-3 mr-1" />
              Upload picture
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              aria-label={`Clear ${label} draft`}
              disabled={busyId !== null || (!newName && !newPrompt)}
              onClick={() => {
                setNewName("");
                setNewPrompt("");
                onClearDraft();
              }}
            >
              Clear draft
            </Button>
          </div>
        </div>
      </aside>

      <section
        className="bible-library"
        aria-label={
          type === "character" ? "Characters library" : "Locations library"
        }
      >
        <div className="bible-library-heading" hidden={!!activeAssetId}>
          <span>
            {assets.length} {assets.length === 1 ? label : `${label}s`}
          </span>
          <span>Reference library</span>
        </div>
        {assets.length === 0 ? (
          <div className="bible-empty-library">
            <ImageIcon />
            <h3>
              {label === "character" ? "No characters yet" : "No locations yet"}
            </h3>
            <p>Create or upload a picture in the New {label} panel.</p>
          </div>
        ) : (
          <div
            className={activeAssetId ? "bible-detail-host" : "bible-media-grid"}
          >
            {assets.map((asset) => {
              const takes = (variants[asset.id] ?? []).filter(
                (v) => v.media_url,
              );
              return (
                <BibleAssetEntry
                  key={asset.id}
                  asset={asset}
                  active={activeAssetId === asset.id}
                  hidden={!!activeAssetId && activeAssetId !== asset.id}
                  onOpen={() => onOpenAsset(asset.id)}
                  onBack={onBack}
                  detailFocus={detailFocus}
                  modelControl={detailModelControl}
                  takes={takes}
                  busy={busyId !== null}
                  generating={generatingAssetId === asset.id}
                  builtFrom={null}
                  usesReferenceImages={
                    assetReferences(asset, variants).length > 0
                  }
                  basePrompt={primaryPicture(takes)?.prompt ?? ""}
                  onRetake={onRetake}
                  onEdit={onEdit}
                  imageCapabilities={imageCapabilities}
                  generationContext={generationContext}
                  onSetPrimary={onSetPrimary}
                  onDeleteTake={onDeleteTake}
                  onDeleteAsset={onDeleteAsset}
                  onUpload={() =>
                    pickImageFile((file) => onUpload(asset, file))
                  }
                  onExpand={onExpand}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// Frames: compose from characters + a location + a prompt, then manage takes.
function FramesTab({
  composerOpen,
  onCloseComposer,
  modelControl,
  detailModelControl,
  detailFocus,
  activeAssetId,
  onOpenAsset,
  onBack,
  characters,
  locations,
  frames,
  variants,
  busyId,
  generatingAssetId,
  onMakeFrame,
  onClearDraft,
  onRetake,
  onEdit,
  imageCapabilities,
  generationContext,
  onSetPrimary,
  onDeleteTake,
  onDeleteFrame,
  onExpand,
}: {
  composerOpen: boolean;
  onCloseComposer: () => void;
  modelControl: ReactNode;
  detailModelControl: ReactNode;
  detailFocus: BibleDetailFocusTargets;
  activeAssetId: string | null;
  onOpenAsset: (id: string) => void;
  onBack: () => void;
  characters: BibleAsset[];
  locations: BibleAsset[];
  frames: BibleAsset[];
  variants: Record<string, BibleAssetVariant[]>;
  busyId: string | null;
  generatingAssetId: string | null;
  onMakeFrame: (recipe: FrameRecipe) => Promise<Result<void>>;
  onClearDraft: () => void;
  onRetake: (
    frame: BibleAsset,
    promptOverride?: string,
  ) => Promise<Result<void>>;
  imageCapabilities: ImageCapabilities;
  generationContext: BibleGenerationContext;
  onEdit: (
    asset: BibleAsset,
    variant: BibleAssetVariant,
    instruction: string,
  ) => Promise<Result<void>>;
  onSetPrimary: (variant: BibleAssetVariant) => void;
  onDeleteTake: (variant: BibleAssetVariant) => void;
  onDeleteFrame: (asset: BibleAsset) => void;
  onExpand: (url: string) => void;
}) {
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationVariantId, setLocationVariantId] = useState<string | null>(
    null,
  );
  const [prompt, setPrompt] = useState("");
  useUnsavedWork(
    "draft",
    !!prompt || selectedChars.size > 0 || !!locationId,
    JSON.stringify({
      prompt,
      characters: [...selectedChars],
      locationId,
      locationVariantId,
    }),
  );
  const making = busyId === "make-frame";
  useEffect(() => {
    setSelectedChars((previous) => {
      const next = new Set(
        [...previous].filter(
          (id) =>
            characters.some((character) => character.id === id) &&
            !!primaryPicture(variants[id] ?? [])?.media_url,
        ),
      );
      return next.size === previous.size ? previous : next;
    });
    if (
      locationId &&
      (!locations.some((location) => location.id === locationId) ||
        !primaryPicture(variants[locationId] ?? [])?.media_url)
    ) {
      setLocationId(null);
      setLocationVariantId(null);
    } else if (
      locationId &&
      !(variants[locationId] ?? []).some(
        (variant) => variant.id === locationVariantId && variant.media_url,
      )
    ) {
      setLocationVariantId(
        primaryPicture(variants[locationId] ?? [])?.id ?? null,
      );
    }
  }, [characters, locations, locationId, locationVariantId, variants]);

  function toggleChar(id: string) {
    setSelectedChars((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pickLocation(id: string) {
    if (locationId === id) {
      setLocationId(null);
      setLocationVariantId(null);
    } else {
      setLocationId(id);
      setLocationVariantId(primaryPicture(variants[id] ?? [])?.id ?? null);
    }
  }

  const locationViews = locationId
    ? (variants[locationId] ?? []).filter((v) => v.media_url)
    : [];

  async function makeFrame() {
    const result = await onMakeFrame({
      characters: [...selectedChars],
      location: locationId,
      locationVariantId,
      prompt,
    });
    if (result.ok) {
      setPrompt("");
      setSelectedChars(new Set());
      setLocationId(null);
      setLocationVariantId(null);
    }
  }

  return (
    <div
      className="bible-section-layout"
      data-composer-open={composerOpen && !activeAssetId}
      data-detail-open={!!activeAssetId}
    >
      <aside
        className="bible-composer"
        aria-label="New frame"
        hidden={!composerOpen || !!activeAssetId}
      >
        <div className="bible-panel-heading">
          <h3>New frame</h3>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close creation panel"
            onClick={onCloseComposer}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="bible-composer-body">
          {modelControl}
          <div className="bible-reference-heading">
            <span>References</span>
            <span>
              {selectedChars.size}{" "}
              {selectedChars.size === 1
                ? "character selected"
                : "characters selected"}
              {locationId ? " · 1 location" : ""}
            </span>
          </div>
          <div className="bible-reference-groups">
            <div className="bible-reference-group">
              <p className="bible-field-label">Characters (optional)</p>
              <div className="bible-reference-list">
                {characters.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No characters yet. You can generate a frame from a prompt.
                  </span>
                )}
                {characters.map((c) => {
                  const url =
                    primaryPicture(variants[c.id] ?? [])?.media_url ?? null;
                  return (
                    <BiblePictureTile
                      key={c.id}
                      url={url}
                      label={c.name}
                      hint={!url ? "Add a picture first" : undefined}
                      disabled={busyId !== null || !url}
                      active={selectedChars.has(c.id)}
                      onClick={() => toggleChar(c.id)}
                      onExpand={() => url && onExpand(url)}
                    />
                  );
                })}
              </div>
            </div>
            <div className="bible-reference-group">
              <p className="bible-field-label">Location (optional)</p>
              <div className="bible-reference-list">
                {locations.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Optional
                  </span>
                )}
                {locations.map((l) => {
                  const url =
                    primaryPicture(variants[l.id] ?? [])?.media_url ?? null;
                  return (
                    <BiblePictureTile
                      key={l.id}
                      url={url}
                      label={l.name}
                      hint={!url ? "Add a picture first" : undefined}
                      disabled={busyId !== null || !url}
                      active={locationId === l.id}
                      onClick={() => pickLocation(l.id)}
                      onExpand={() => url && onExpand(url)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          {locationViews.length > 1 && (
            <div className="mb-3">
              <p className="mb-1 text-[10px] text-muted-foreground">View</p>
              <div className="flex flex-wrap gap-2">
                {locationViews.map((v, i) => (
                  <BiblePictureTile
                    key={v.id}
                    url={v.media_url}
                    label={`View ${i + 1}`}
                    disabled={busyId !== null}
                    active={locationVariantId === v.id}
                    onClick={() => setLocationVariantId(v.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <label className="bible-prompt-label">
            <span>Scene description</span>
            <Textarea
              disabled={busyId !== null}
              className="bible-prompt text-xs resize-none"
              aria-label="Frame prompt"
              placeholder="What's happening (and the look, e.g. 90s anime)..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
        </div>
        <div className="bible-composer-footer">
          <div className="bible-cost">
            <GenerationCost
              modelId={generationContext.modelId}
              request={imageCostRequest(
                imageGenerationKind({
                  edit: false,
                  composes: selectedChars.size > 0 || !!locationId,
                }),
              )}
              subject={{ project_id: generationContext.projectId }}
            />
          </div>
          <div className="bible-create-actions">
            <Button
              size="sm"
              className="text-xs"
              disabled={
                busyId !== null ||
                !prompt.trim() ||
                (!imageCapabilities.composition &&
                  (selectedChars.size > 0 || !!locationId))
              }
              onClick={makeFrame}
            >
              {making ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Generate frame
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2 text-xs"
              aria-label="Clear frame draft"
              disabled={
                busyId !== null ||
                (!prompt && !selectedChars.size && !locationId)
              }
              onClick={() => {
                setPrompt("");
                setSelectedChars(new Set());
                setLocationId(null);
                setLocationVariantId(null);
                onClearDraft();
              }}
            >
              Clear draft
            </Button>
          </div>
          {!imageCapabilities.composition &&
            (selectedChars.size > 0 || !!locationId) && (
              <p className="mt-2 text-xs text-muted-foreground">
                Choose a model that accepts reference images to include these
                characters or locations.
              </p>
            )}
        </div>
      </aside>
      <section className="bible-library" aria-label="Frames library">
        <div className="bible-library-heading" hidden={!!activeAssetId}>
          <span>
            {frames.length} {frames.length === 1 ? "frame" : "frames"}
          </span>
          <span>Storyboard pictures</span>
        </div>
        {frames.length === 0 ? (
          <div className="bible-empty-library">
            <ImageIcon />
            <h3>No frames yet</h3>
            <p>
              Create a frame with a scene description and optional references.
              <br />
              Use it as a shot’s start or end frame.
            </p>
          </div>
        ) : (
          <div
            className={activeAssetId ? "bible-detail-host" : "bible-media-grid"}
          >
            {frames.map((f) => (
              <BibleAssetEntry
                key={f.id}
                asset={f}
                active={activeAssetId === f.id}
                hidden={!!activeAssetId && activeAssetId !== f.id}
                onOpen={() => onOpenAsset(f.id)}
                onBack={onBack}
                detailFocus={detailFocus}
                modelControl={detailModelControl}
                takes={(variants[f.id] ?? []).filter((v) => v.media_url)}
                busy={busyId !== null}
                generating={generatingAssetId === f.id}
                builtFrom={builtFromLabel(f, characters, locations)}
                usesReferenceImages={assetReferences(f, variants).length > 0}
                basePrompt={
                  parseRecipe(f.rules_json).prompt ||
                  primaryPicture(variants[f.id] ?? [])?.prompt ||
                  ""
                }
                onRetake={onRetake}
                onEdit={onEdit}
                imageCapabilities={imageCapabilities}
                generationContext={generationContext}
                onSetPrimary={onSetPrimary}
                onDeleteTake={onDeleteTake}
                onDeleteAsset={onDeleteFrame}
                onExpand={onExpand}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
