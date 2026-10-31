import { getGroupedImageModels, getGroupedVideoModels } from "../lib/models";
import { GenerationModelField, INHERIT_STORYBOARD_MODEL, type StoryboardModelDefaults } from "./GenerationModelField";
import type { ShotModelOverrides } from "../../shared/shot-models";

interface Props {
  shot: (ShotModelOverrides & { id: string; order: number }) | null;
  defaults: StoryboardModelDefaults;
  onShotChange: (id: string, models: Partial<ShotModelOverrides>) => void;
  disabled: boolean;
  error: string | null;
}
export function ShotModelControls({ shot, defaults, onShotChange, disabled, error }: Props) {
  if (!shot) return null;
  return (
    <section aria-label="Shot model controls" className="border-b border-border/60 px-3 py-3 space-y-3">
      <h3 className="text-xs font-medium">Models for this shot</h3>
      <p className="text-[11px] leading-relaxed text-muted-foreground">Used for new takes. Existing media stays unchanged.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {(["image_model", "video_model"] as const).map((kind) => {
        const label = kind === "image_model" ? "Image" : "Video";
        return <GenerationModelField key={kind} label={label} accessibleName={`${label} model for shot ${shot.order}`} value={shot[kind] ?? INHERIT_STORYBOARD_MODEL} defaultValue={defaults[kind]} groups={kind === "image_model" ? getGroupedImageModels() : getGroupedVideoModels()} disabled={disabled} onSelect={(model) => onShotChange(shot.id, { [kind]: model === INHERIT_STORYBOARD_MODEL ? null : model })} />;
      })}
    </section>
  );
}
