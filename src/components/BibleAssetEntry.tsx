import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Ellipsis, ImageIcon, Loader2, Maximize2, RefreshCw, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GenerationCost } from "./GenerationCost";
import { BiblePictureTile } from "./BiblePictureTile";
import { useUnsavedWork } from "../hooks/useApplicationWork";
import { primaryPicture } from "../lib/bible-compose";
import { getAvailableImageModels } from "../lib/models";
import type { BibleAsset, BibleAssetVariant } from "../lib/backend-api";
import type { Result } from "../../shared/result";

export function BibleAssetEntry({ asset, takes, busy, builtFrom, basePrompt,
  onRetake, onEdit, imageCapabilities, generationContext, onSetPrimary, onDeleteTake,
  onDeleteAsset, onUpload, onExpand, active, hidden, onOpen, onBack, modelControl,
}: {
  asset: BibleAsset; takes: BibleAssetVariant[]; busy: boolean; builtFrom: string | null;
  basePrompt: string; active: boolean; hidden: boolean; onOpen: () => void; onBack: () => void;
  modelControl: ReactNode;
  onRetake: (asset: BibleAsset, promptOverride?: string) => Promise<Result<void>>;
  onEdit: (asset: BibleAsset, variant: BibleAssetVariant, instruction: string) => Promise<Result<void>>;
  imageCapabilities: { editing: boolean; composition: boolean };
  generationContext: { modelId: string; projectId: string };
  onSetPrimary: (variant: BibleAssetVariant) => void;
  onDeleteTake: (variant: BibleAssetVariant) => void;
  onDeleteAsset: (asset: BibleAsset) => void;
  onUpload?: () => void; onExpand: (url: string) => void;
}) {
  const primary = primaryPicture(takes);
  const pictureModel = getAvailableImageModels().find((model) => model.id === primary?.model_id);
  const [mode, setMode] = useState<"variation" | "edit" | null>(null);
  const [pending, setPending] = useState<"retake" | "variation" | "edit" | null>(null);
  const [variation, setVariation] = useState(basePrompt);
  const [variationEdited, setVariationEdited] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(false);
  useEffect(() => {
    if (active) back.current?.focus();
    else if (wasActive.current) opener.current?.focus();
    wasActive.current = active;
  }, [active]);
  useUnsavedWork("draft", variationEdited, variation);
  useUnsavedWork("draft", !!editInstruction, editInstruction);
  async function run(action: "retake" | "variation" | "edit", fn: () => Promise<unknown>) {
    setPending(action);
    try { await fn(); } finally { setPending(null); }
  }
  if (hidden) return null;
  if (!active) return <article className="bible-entry">
    <button ref={opener} type="button" className="bible-asset-open" aria-label={`Open ${asset.name} details`} onClick={onOpen}>
      {primary?.media_url ? <img src={primary.media_url} alt="" loading="lazy" /> : <ImageIcon />}
    </button>
    <div className="bible-entry-info bible-asset-card-caption">
      <div><strong>{asset.name}</strong><span>{takes.length} {takes.length === 1 ? 'take' : 'takes'}</span></div>
      <Button variant="ghost" size="icon" className="bible-more-action" aria-label={`Picture actions for ${asset.name}`} onClick={onOpen}><Ellipsis size={16} />{(variationEdited || editInstruction) && <span className="bible-draft-dot" aria-label="Unsaved draft" />}</Button>
    </div>
  </article>;
  return <section role="region" aria-label={`${asset.name} details`} className="bible-asset-workspace">
    <header className="bible-asset-heading">
      <Button ref={back} variant="ghost" size="sm" aria-label="Back to library" onClick={onBack}><ArrowLeft size={15} />Back to library</Button>
      <h2>{asset.name}</h2><span>{asset.asset_type === 'reference' ? 'Frame' : asset.asset_type === 'character' ? 'Character' : 'Location'}</span>
    </header>
    <div className="bible-asset-body">
      <div className="bible-asset-media">
        <button type="button" className="bible-asset-preview" data-current-picture aria-label={`View ${asset.name} picture`} disabled={!primary?.media_url} onClick={() => primary?.media_url && onExpand(primary.media_url)}>
          {primary?.media_url ? <><img src={primary.media_url} alt={`${asset.name} current take`} /><span><Maximize2 size={14} />View full image</span></> : <span>No picture yet</span>}
        </button>
        <section className="bible-asset-takes" aria-label={`Takes for ${asset.name}`}>
          <div className="bible-asset-takes-heading"><h3>Takes</h3><span>{takes.length} · Select a take to use it</span></div>
          <div className="bible-asset-take-list">{takes.map((take, index) => <BiblePictureTile key={take.id} url={take.media_url} label={`take ${index + 1} for ${asset.name}`} actionLabel={`Use take ${index + 1} for ${asset.name}`} disabled={busy} active={take.is_primary} onClick={() => onSetPrimary(take)} onDelete={() => onDeleteTake(take)} onExpand={() => take.media_url && onExpand(take.media_url)} />)}</div>
        </section>
      </div>
      <div className="bible-asset-controls">
        <section className="bible-asset-metadata"><h3>Current picture</h3>
          {primary?.prompt ? <p className="bible-asset-prompt">{primary.prompt}</p> : <p className="bible-asset-empty-prompt">No generation prompt recorded.</p>}
          <dl><dt>Model</dt><dd>{pictureModel?.name ?? primary?.model_id ?? 'Not recorded'}</dd><dt>Source</dt><dd>{primary ? { uploaded: 'Uploaded picture', generated: 'Generated picture', edited: 'Edited picture', imported: 'Imported picture' }[primary.source_kind] ?? 'Not recorded' : 'Not recorded'}</dd></dl>
          {asset.summary && <p>{asset.summary}</p>}{asset.description && <p>{asset.description}</p>}
          {builtFrom && <p>Built from: {builtFrom}</p>}
        </section>
        <section className="bible-asset-generation" aria-label={`Picture generation for ${asset.name}`}>
          <h3>Picture actions</h3>{modelControl}
          <div className="bible-cost bible-asset-next-cost"><p>Estimate for the next generation</p><GenerationCost modelId={generationContext.modelId} request={{kind: mode === "edit" ? "image_edit" : primary || builtFrom ? "image_compose" : "image"}} subject={{project_id: generationContext.projectId, subject_id: asset.id}} /></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="text-xs" disabled={busy || (!!primary && !imageCapabilities.composition)} title={!imageCapabilities.composition && primary ? "Choose a model that accepts reference images." : undefined} onClick={() => run("retake", () => onRetake(asset))}>
              {pending === "retake" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Retake
            </Button>
            <Button
              size="sm"
              variant={mode === "variation" ? "default" : "outline"}
              className="text-xs"
              disabled={busy || (!!primary && !imageCapabilities.composition && !variationEdited && mode !== "variation")}
              aria-label="Variation…"
              aria-expanded={mode === "variation"}
              aria-controls={`variation-${asset.id}`}
              title={!imageCapabilities.composition && primary ? "Choose a model that accepts reference images." : undefined}
              onClick={() => { if (!variationEdited) setVariation(basePrompt); setMode((m) => (m === "variation" ? null : "variation")); }}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Variation…{variationEdited && <span className="text-[10px] text-muted-foreground">Draft</span>}
            </Button>
            <Button
              size="sm"
              variant={mode === "edit" ? "default" : "outline"}
              className="text-xs"
              disabled={busy || !primary || (!imageCapabilities.editing && !editInstruction && mode !== "edit")}
              aria-label="Edit…"
              aria-expanded={mode === "edit"}
              aria-controls={`edit-${asset.id}`}
              title={!imageCapabilities.editing ? "Choose a model that supports image editing." : undefined}
              onClick={() => setMode((m) => (m === "edit" ? null : "edit"))}
            >
              <Wand2 className="h-3 w-3 mr-1" />
              Edit…{editInstruction && <span className="text-[10px] text-muted-foreground">Draft</span>}
            </Button>
            {onUpload && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={busy}
                onClick={() => onUpload()}
              >
                <Upload className="h-3 w-3 mr-1" />
                Upload
              </Button>
            )}
          </div>

          {mode === "variation" && (
            <div id={`variation-${asset.id}`} className="flex flex-wrap items-end gap-2">
              <Textarea
                autoFocus
                className="min-h-[40px] flex-1 text-xs resize-none"
                disabled={busy}
                aria-label={`Variation prompt for ${asset.name}`}
                placeholder="Tweak the prompt for a variation..."
                value={variation}
                onChange={(e) => { setVariation(e.target.value); setVariationEdited(e.target.value !== basePrompt); }}
              />
              <Button
                size="sm"
                className="text-xs"
                disabled={busy || !variation.trim() || (!!primary && !imageCapabilities.composition)}
                onClick={() => run("variation", async () => {
                  const result = await onRetake(asset, variation);
                  if (result.ok) { setVariationEdited(false); setMode(null); }
                })}
              >
                {pending === "variation" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Generate variation
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Cancel variation for ${asset.name}`} onClick={() => { setVariation(basePrompt); setVariationEdited(false); setMode(null); }}>Cancel</Button>
            </div>
          )}

          {mode === "edit" && primary && (
            <div id={`edit-${asset.id}`} className="flex flex-wrap items-end gap-2">
              <Textarea
                autoFocus
                className="min-h-[40px] flex-1 text-xs resize-none"
                disabled={busy}
                aria-label={`Edit instruction for ${asset.name}`}
                placeholder="Edit the current picture (e.g. make it night, add rain)..."
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
              />
              <Button
                size="sm"
                className="text-xs"
                disabled={busy || !editInstruction.trim() || !imageCapabilities.editing}
                onClick={() => run("edit", async () => {
                  const result = await onEdit(asset, primary, editInstruction);
                  if (result.ok) { setEditInstruction(""); setMode(null); }
                })}
              >
                {pending === "edit" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                Generate edit
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Cancel edit for ${asset.name}`} onClick={() => { setEditInstruction(""); setMode(null); }}>Cancel</Button>
            </div>
          )}

          <Button size="sm" variant="ghost" className="bible-delete-entry" disabled={busy} onClick={() => onDeleteAsset(asset)} aria-label={`Delete ${asset.name}`}><Trash2 size={14} />Delete entry</Button>
        </section>
      </div>
    </div>
  </section>;
}
