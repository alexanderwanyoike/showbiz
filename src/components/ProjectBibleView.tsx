import { useEffect, useState } from "react";
import { Check, ImageIcon, Loader2, Maximize2, Plus, RefreshCw, Trash2, Upload, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  updateBibleAssetVariantStatus,
  type BibleAsset,
  type BibleAssetVariant,
} from "../lib/tauri-api";
import { composeFrameAction, generateImageAction } from "../actions/generation-actions";
import { getAvailableImageModels, type ImageModelId } from "../lib/models";

const MAX_BIBLE_IMAGE_SIDE = 1600;
const BIBLE_IMAGE_QUALITY = 0.9;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Failed to read file")));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function prepareBibleImageDataUrl(dataUrl: string): Promise<string> {
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

function primaryPicture(variants: BibleAssetVariant[]): BibleAssetVariant | null {
  return variants.find((v) => v.is_primary && v.media_url) ?? variants.find((v) => v.media_url) ?? null;
}

// A frame's compose recipe, stored as JSON on the frame asset so it can be retaken.
interface FrameRecipe {
  characters: string[]; // character asset ids (compose uses each one's primary picture)
  location: string | null; // location asset id (for display)
  locationVariantId: string | null; // the chosen location view (compose uses this picture)
  prompt: string;
}

function parseRecipe(rulesJson: string | null): FrameRecipe {
  try {
    const r = JSON.parse(rulesJson || "{}");
    return {
      characters: Array.isArray(r.characters) ? r.characters : [],
      location: r.location ?? null,
      locationVariantId: r.locationVariantId ?? null,
      prompt: typeof r.prompt === "string" ? r.prompt : "",
    };
  } catch {
    return { characters: [], location: null, locationVariantId: null, prompt: "" };
  }
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
}

// A full-screen view of one picture.
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" onClick={onClose}>
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full rounded object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
        title="Close"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

// An image tile used for pictures, characters, locations and frames.
function Tile({
  url,
  label,
  active,
  size = "sm",
  onClick,
  onDelete,
  onExpand,
}: {
  url: string | null;
  label?: string;
  active?: boolean;
  size?: "sm" | "lg";
  onClick?: () => void;
  onDelete?: () => void;
  onExpand?: () => void;
}) {
  const dims = size === "lg" ? "h-44 w-72" : "h-20 w-28";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        title={label}
        className={`relative block ${dims} overflow-hidden rounded border bg-muted text-[10px] transition-colors ${active ? "border-primary ring-2 ring-primary" : "border-border hover:border-foreground/40"}`}
      >
        {url ? (
          <img src={url} alt={label ?? ""} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground/50">
            <ImageIcon className="h-5 w-5" />
          </span>
        )}
        {label && (
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white">{label}</span>
        )}
        {active && (
          <span className="absolute left-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
      </button>
      {onExpand && url && (
        <button
          type="button"
          onClick={onExpand}
          className="absolute bottom-1 right-1 rounded bg-black/60 p-1 text-white hover:bg-black/80"
          title="View full"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-80 hover:opacity-100"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// Generate (prompt) or upload one picture.
function AddPicture({
  busy,
  onGenerate,
  onUpload,
}: {
  busy: boolean;
  onGenerate: (prompt: string) => Promise<void>;
  onUpload: (file: File) => void;
}) {
  const [prompt, setPrompt] = useState("");
  return (
    <div className="flex items-end gap-2">
      <Textarea
        className="min-h-[40px] flex-1 text-xs resize-none"
        placeholder="Describe it, then Add..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <Button
        size="sm"
        className="text-xs"
        disabled={busy || !prompt.trim()}
        onClick={async () => {
          await onGenerate(prompt);
          setPrompt("");
        }}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Add
      </Button>
      <Button size="sm" variant="outline" className="text-xs" disabled={busy} onClick={() => pickImageFile(onUpload)}>
        <Upload className="h-3 w-3" />
      </Button>
    </div>
  );
}

// Shows what made a picture: the model and the prompt (so you can see/reuse it).
function PictureMeta({ variant }: { variant: BibleAssetVariant | null }) {
  if (!variant?.prompt) return null;
  return (
    <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground" title={variant.prompt}>
      {variant.model_id ? <span className="font-medium text-foreground/70">{variant.model_id} · </span> : null}
      {variant.prompt}
    </p>
  );
}

export default function ProjectBibleView({ projectId }: ProjectBibleViewProps) {
  const [bibleId, setBibleId] = useState<string | null>(null);
  const [assets, setAssets] = useState<BibleAsset[]>([]);
  const [variants, setVariants] = useState<Record<string, BibleAssetVariant[]>>({});
  const [tab, setTab] = useState<Tab>("characters");
  const [imageModel, setImageModel] = useState<ImageModelId>("nano-banana");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const imageModels = getAvailableImageModels();

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function load() {
    try {
      const bibles = await getBibles(projectId);
      const id = bibles[0]?.id ?? null;
      setBibleId(id);
      if (!id) return;
      const list = await getBibleAssets(id);
      setAssets(list);
      const entries = await Promise.all(list.map(async (a) => [a.id, await getBibleAssetVariants(a.id)] as const));
      setVariants(Object.fromEntries(entries));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshAsset(assetId: string) {
    setVariants((prev) => ({ ...prev }));
    const v = await getBibleAssetVariants(assetId);
    setVariants((prev) => ({ ...prev, [assetId]: v }));
  }

  const characters = assets.filter((a) => a.asset_type === "character");
  const locations = assets.filter((a) => a.asset_type === "location");
  // Frames are stored as "reference"-type bible assets: that value is allowed on
  // every database, whereas "scene" only exists in the newer schema.
  const frames = assets.filter((a) => a.asset_type === "reference");

  async function imageFromPrompt(prompt: string): Promise<string> {
    const raw = await generateImageAction(prompt, imageModel);
    return prepareBibleImageDataUrl(raw);
  }

  async function addVariant(
    assetId: string,
    dataUrl: string,
    meta: { name: string; source: "generated" | "uploaded"; prompt?: string | null }
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
  async function handleNewAsset(type: "character" | "location", name: string, prompt: string, file: File | null) {
    if (!bibleId || !name.trim()) return;
    setError(null);
    setBusyId(`new-${type}`);
    try {
      const asset = await createBibleAsset(bibleId, {
        asset_type: type,
        name: name.trim(),
        summary: null,
        description: null,
        tags_json: null,
        rules_json: null,
        consent_confirmed: false,
      });
      setAssets((prev) => [asset, ...prev]);
      setVariants((prev) => ({ ...prev, [asset.id]: [] }));
      if (file) {
        await addVariant(asset.id, await fileToDataUrl(file), { name: file.name, source: "uploaded" });
      } else if (prompt.trim()) {
        await addVariant(asset.id, await imageFromPrompt(prompt), { name: name.trim(), source: "generated", prompt });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddPictureFromPrompt(asset: BibleAsset, prompt: string) {
    setError(null);
    setBusyId(asset.id);
    try {
      await addVariant(asset.id, await imageFromPrompt(prompt), { name: prompt.slice(0, 40), source: "generated", prompt });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddPictureFromFile(asset: BibleAsset, file: File) {
    setError(null);
    setBusyId(asset.id);
    try {
      await addVariant(asset.id, await fileToDataUrl(file), { name: file.name, source: "uploaded" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSetPrimary(variant: BibleAssetVariant) {
    await updateBibleAssetVariantStatus(variant.id, "approved", true);
    await refreshAsset(variant.asset_id);
  }

  async function handleDeletePicture(variant: BibleAssetVariant) {
    await deleteBibleAssetVariant(variant.id);
    await refreshAsset(variant.asset_id);
  }

  async function handleDeleteAsset(asset: BibleAsset) {
    if (!window.confirm(`Delete "${asset.name}"?`)) return;
    await deleteBibleAsset(asset.id);
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
  }

  // Compose a frame image from a recipe (character primaries + a location view + prompt).
  async function composeFrameImage(recipe: FrameRecipe, prompt: string): Promise<string> {
    const variantIds: string[] = [];
    for (const cid of recipe.characters) {
      const pic = primaryPicture(variants[cid] ?? []);
      if (pic) variantIds.push(pic.id);
    }
    if (recipe.locationVariantId) variantIds.push(recipe.locationVariantId);
    const images = (
      await Promise.all(variantIds.map((vid) => getBibleVariantImageBase64(vid)))
    ).filter((x): x is string => !!x);
    const raw =
      images.length > 0
        ? await composeFrameAction(prompt, images, imageModel)
        : await generateImageAction(prompt, imageModel);
    return prepareBibleImageDataUrl(raw);
  }

  async function handleMakeFrame(recipe: FrameRecipe) {
    if (!bibleId || !recipe.prompt.trim()) return;
    setError(null);
    setBusyId("make-frame");
    try {
      const dataUrl = await composeFrameImage(recipe, recipe.prompt);
      const asset = await createBibleAsset(bibleId, {
        asset_type: "reference",
        name: recipe.prompt.slice(0, 50) || "Frame",
        summary: null,
        description: null,
        tags_json: null,
        rules_json: JSON.stringify(recipe),
        consent_confirmed: false,
      });
      setAssets((prev) => [asset, ...prev]);
      setVariants((prev) => ({ ...prev, [asset.id]: [] }));
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  // Retake a frame (re-roll its recipe), optionally with a tweaked prompt (a variation).
  // The new take becomes the frame's primary.
  async function handleRetakeFrame(frame: BibleAsset, promptOverride?: string) {
    setError(null);
    setBusyId(frame.id);
    try {
      const recipe = parseRecipe(frame.rules_json);
      const prompt = (promptOverride ?? recipe.prompt).trim();
      if (!prompt) return;
      const dataUrl = await composeFrameImage(recipe, prompt);
      const take = await createBibleAssetVariant(frame.id, {
        name: prompt.slice(0, 40),
        image_base64: dataUrl,
        source_kind: "generated",
        status: "approved",
        prompt,
        model_id: imageModel,
        is_primary: false,
      });
      await updateBibleAssetVariantStatus(take.id, "approved", true);
      await refreshAsset(frame.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (!bibleId) {
    return <div className="p-6 text-sm text-muted-foreground">Loading bible…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tabs + model */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex gap-1">
          {(["characters", "locations", "frames"] as Tab[]).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tab === t ? "default" : "ghost"}
              className="text-xs capitalize"
              onClick={() => setTab(t)}
            >
              {t}
            </Button>
          ))}
        </div>
        <Select value={imageModel} onValueChange={(v) => setImageModel(v as ImageModelId)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {imageModels.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {(tab === "characters" || tab === "locations") && (
          <AssetTab
            type={tab === "characters" ? "character" : "location"}
            label={tab === "characters" ? "character" : "location"}
            assets={tab === "characters" ? characters : locations}
            variants={variants}
            busyId={busyId}
            onNew={handleNewAsset}
            onAddPrompt={handleAddPictureFromPrompt}
            onAddFile={handleAddPictureFromFile}
            onSetPrimary={handleSetPrimary}
            onDeletePicture={handleDeletePicture}
            onDeleteAsset={handleDeleteAsset}
            onExpand={setLightbox}
          />
        )}

        {tab === "frames" && (
          <FramesTab
            characters={characters}
            locations={locations}
            frames={frames}
            variants={variants}
            busyId={busyId}
            onMakeFrame={handleMakeFrame}
            onRetake={handleRetakeFrame}
            onSetPrimary={handleSetPrimary}
            onDeleteTake={handleDeletePicture}
            onDeleteFrame={handleDeleteAsset}
            onExpand={setLightbox}
          />
        )}
      </div>

      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// Characters / Locations: a list of name + pictures, with add/delete.
function AssetTab({
  type,
  label,
  assets,
  variants,
  busyId,
  onNew,
  onAddPrompt,
  onAddFile,
  onSetPrimary,
  onDeletePicture,
  onDeleteAsset,
  onExpand,
}: {
  type: "character" | "location";
  label: string;
  assets: BibleAsset[];
  variants: Record<string, BibleAssetVariant[]>;
  busyId: string | null;
  onNew: (type: "character" | "location", name: string, prompt: string, file: File | null) => Promise<void>;
  onAddPrompt: (asset: BibleAsset, prompt: string) => Promise<void>;
  onAddFile: (asset: BibleAsset, file: File) => void;
  onSetPrimary: (variant: BibleAssetVariant) => void;
  onDeletePicture: (variant: BibleAssetVariant) => void;
  onDeleteAsset: (asset: BibleAsset) => void;
  onExpand: (url: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const creating = busyId === `new-${type}`;

  return (
    <div className="space-y-4">
      {/* New */}
      <div className="rounded border border-border p-3">
        <p className="mb-2 text-xs font-medium capitalize text-muted-foreground">New {label}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input
            className="h-9 text-sm sm:w-44"
            placeholder={`${label} name`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Textarea
            className="min-h-[40px] flex-1 text-xs resize-none"
            placeholder="Describe it (or just upload a picture)..."
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="text-xs"
              disabled={creating || !newName.trim() || !newPrompt.trim()}
              onClick={async () => {
                await onNew(type, newName, newPrompt, null);
                setNewName("");
                setNewPrompt("");
              }}
            >
              {creating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
              Create
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={creating || !newName.trim()}
              onClick={() =>
                pickImageFile(async (file) => {
                  await onNew(type, newName, "", file);
                  setNewName("");
                  setNewPrompt("");
                })
              }
            >
              <Upload className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* List */}
      {assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {label}s yet. Make one above.</p>
      ) : (
        assets.map((asset) => {
          const pics = (variants[asset.id] ?? []).filter((v) => v.media_url);
          const isBusy = busyId === asset.id;
          return (
            <div key={asset.id} className="rounded border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">{asset.name}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDeleteAsset(asset)} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mb-1 flex flex-wrap gap-2">
                {pics.length === 0 && <span className="text-xs text-muted-foreground">No picture yet</span>}
                {pics.map((v) => (
                  <Tile
                    key={v.id}
                    url={v.media_url}
                    active={v.is_primary}
                    size="lg"
                    onClick={() => onSetPrimary(v)}
                    onDelete={() => onDeletePicture(v)}
                    onExpand={() => v.media_url && onExpand(v.media_url)}
                  />
                ))}
              </div>
              <div className="mb-2">
                <PictureMeta variant={primaryPicture(pics)} />
              </div>
              <AddPicture
                busy={isBusy}
                onGenerate={(prompt) => onAddPrompt(asset, prompt)}
                onUpload={(file) => onAddFile(asset, file)}
              />
            </div>
          );
        })
      )}
    </div>
  );
}

// Frames: compose from characters + a location + a prompt, then manage takes.
function FramesTab({
  characters,
  locations,
  frames,
  variants,
  busyId,
  onMakeFrame,
  onRetake,
  onSetPrimary,
  onDeleteTake,
  onDeleteFrame,
  onExpand,
}: {
  characters: BibleAsset[];
  locations: BibleAsset[];
  frames: BibleAsset[];
  variants: Record<string, BibleAssetVariant[]>;
  busyId: string | null;
  onMakeFrame: (recipe: FrameRecipe) => Promise<void>;
  onRetake: (frame: BibleAsset, promptOverride?: string) => Promise<void>;
  onSetPrimary: (variant: BibleAssetVariant) => void;
  onDeleteTake: (variant: BibleAssetVariant) => void;
  onDeleteFrame: (asset: BibleAsset) => void;
  onExpand: (url: string) => void;
}) {
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationVariantId, setLocationVariantId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const making = busyId === "make-frame";

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

  const locationViews = locationId ? (variants[locationId] ?? []).filter((v) => v.media_url) : [];

  async function makeFrame() {
    await onMakeFrame({
      characters: [...selectedChars],
      location: locationId,
      locationVariantId,
      prompt,
    });
    setPrompt("");
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-border p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Make a frame</p>

        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Who?</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {characters.length === 0 && <span className="text-xs text-muted-foreground">Make a character first</span>}
          {characters.map((c) => {
            const url = primaryPicture(variants[c.id] ?? [])?.media_url ?? null;
            return (
              <Tile
                key={c.id}
                url={url}
                label={c.name}
                active={selectedChars.has(c.id)}
                onClick={() => toggleChar(c.id)}
                onExpand={() => url && onExpand(url)}
              />
            );
          })}
        </div>

        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Where?</p>
        <div className="mb-2 flex flex-wrap gap-2">
          {locations.length === 0 && <span className="text-xs text-muted-foreground">Optional</span>}
          {locations.map((l) => {
            const url = primaryPicture(variants[l.id] ?? [])?.media_url ?? null;
            return (
              <Tile
                key={l.id}
                url={url}
                label={l.name}
                active={locationId === l.id}
                onClick={() => pickLocation(l.id)}
                onExpand={() => url && onExpand(url)}
              />
            );
          })}
        </div>
        {locationViews.length > 1 && (
          <div className="mb-3">
            <p className="mb-1 text-[10px] text-muted-foreground">View</p>
            <div className="flex flex-wrap gap-2">
              {locationViews.map((v, i) => (
                <Tile
                  key={v.id}
                  url={v.media_url}
                  label={`View ${i + 1}`}
                  active={locationVariantId === v.id}
                  onClick={() => setLocationVariantId(v.id)}
                />
              ))}
            </div>
          </div>
        )}

        <Textarea
          className="mb-2 min-h-[60px] text-sm resize-y"
          placeholder="What's happening (and the look, e.g. 90s anime)..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button size="sm" className="text-xs" disabled={making || !prompt.trim()} onClick={makeFrame}>
          {making ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
          Make frame
        </Button>
      </div>

      {frames.length === 0 ? (
        <p className="text-sm text-muted-foreground">No frames yet. Compose one above, then use it as a shot's start/end frame.</p>
      ) : (
        <div className="space-y-3">
          {frames.map((f) => (
            <FrameCard
              key={f.id}
              frame={f}
              takes={(variants[f.id] ?? []).filter((v) => v.media_url)}
              characters={characters}
              locations={locations}
              busy={busyId === f.id}
              onRetake={onRetake}
              onSetPrimary={onSetPrimary}
              onDeleteTake={onDeleteTake}
              onDeleteFrame={onDeleteFrame}
              onExpand={onExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A single frame: primary take + meta, its other takes, and retake/variation.
function FrameCard({
  frame,
  takes,
  characters,
  locations,
  busy,
  onRetake,
  onSetPrimary,
  onDeleteTake,
  onDeleteFrame,
  onExpand,
}: {
  frame: BibleAsset;
  takes: BibleAssetVariant[];
  characters: BibleAsset[];
  locations: BibleAsset[];
  busy: boolean;
  onRetake: (frame: BibleAsset, promptOverride?: string) => Promise<void>;
  onSetPrimary: (variant: BibleAssetVariant) => void;
  onDeleteTake: (variant: BibleAssetVariant) => void;
  onDeleteFrame: (asset: BibleAsset) => void;
  onExpand: (url: string) => void;
}) {
  const recipe = parseRecipe(frame.rules_json);
  const primary = primaryPicture(takes);
  const [variation, setVariation] = useState(recipe.prompt);

  const builtFrom = [
    ...recipe.characters.map((id) => characters.find((c) => c.id === id)?.name).filter(Boolean),
    recipe.location ? locations.find((l) => l.id === recipe.location)?.name : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded border border-border p-3">
      <div className="flex gap-3">
        <Tile
          url={primary?.media_url ?? null}
          size="lg"
          onExpand={() => primary?.media_url && onExpand(primary.media_url)}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-medium">{frame.name}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDeleteFrame(frame)} title="Delete frame">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <PictureMeta variant={primary} />
          {builtFrom && <p className="text-[10px] text-muted-foreground">Built from: {builtFrom}</p>}

          {takes.length > 1 && (
            <div>
              <p className="mb-1 text-[10px] text-muted-foreground">Takes (click to use)</p>
              <div className="flex flex-wrap gap-1.5">
                {takes.map((t) => (
                  <Tile
                    key={t.id}
                    url={t.media_url}
                    active={t.is_primary}
                    onClick={() => onSetPrimary(t)}
                    onDelete={() => onDeleteTake(t)}
                    onExpand={() => t.media_url && onExpand(t.media_url)}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <Button size="sm" variant="outline" className="text-xs" disabled={busy} onClick={() => onRetake(frame)}>
              {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Retake
            </Button>
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              className="min-h-[40px] flex-1 text-xs resize-none"
              placeholder="Tweak the prompt for a variation..."
              value={variation}
              onChange={(e) => setVariation(e.target.value)}
            />
            <Button size="sm" className="text-xs" disabled={busy || !variation.trim()} onClick={() => onRetake(frame, variation)}>
              <Sparkles className="h-3 w-3 mr-1" />
              Variation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
