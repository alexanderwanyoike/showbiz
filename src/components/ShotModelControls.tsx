import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "./ModelPicker";
import { getGroupedImageModels, getGroupedVideoModels } from "../lib/models";
import type { ModelGroup } from "../lib/models/registry";
import type { ShotModelOverrides } from "../../shared/shot-models";

type Defaults = { image_model: string; video_model: string };
interface Props {
  shot: (ShotModelOverrides & { id: string; order: number }) | null;
  defaults: Defaults;
  onShotChange: (id: string, models: Partial<ShotModelOverrides>) => void;
  onDefaultsChange: (models: Defaults) => void;
  disabled: boolean;
  error: string | null;
}
const inherit = "__storyboard_default__";
export function ShotModelControls({
  shot,
  defaults,
  onShotChange,
  onDefaultsChange,
  disabled,
  error,
}: Props) {
  const groups: Record<
    keyof ShotModelOverrides,
    ModelGroup<{ id: string; name: string; provider?: string }>[]
  > = {
    image_model: getGroupedImageModels(),
    video_model: getGroupedVideoModels(),
  };
  function picker(kind: "image_model" | "video_model", isDefault: boolean) {
    const label = kind === "image_model" ? "Image" : "Video";
    const defaultName =
      groups[kind]
        .flatMap((group) => group.models)
        .find((model) => model.id === defaults[kind])?.name ?? defaults[kind];
    const value = isDefault ? defaults[kind] : (shot?.[kind] ?? inherit);
    const name =
      value === inherit
        ? defaultName
        : (groups[kind]
            .flatMap((group) => group.models)
            .find((model) => model.id === value)?.name ?? value);
    const selectedModel = groups[kind].flatMap(group => group.models).find(model => model.id === (value === inherit ? defaults[kind] : value));
    const provider = selectedModel?.provider;
    const options = isDefault
      ? groups[kind]
      : [
          {
            family: "inherit",
            displayName: "Storyboard",
            models: [
              { id: inherit, name: `Use storyboard default: ${defaultName}` },
            ],
          },
          ...groups[kind],
        ];
    return (
      <div className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2" key={kind}>
        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          <span>{label}</span>
          {!isDefault && (
            <span className="text-[9px]">{value === inherit ? "Default" : "Shot"}</span>
          )}
        </div>
        <ModelPicker
          groups={options}
          value={value}
          onSelect={(model) => {
            if (isDefault) onDefaultsChange({ ...defaults, [kind]: model });
            else if (shot)
              onShotChange(shot.id, {
                [kind]: model === inherit ? null : model,
              });
          }}
          trigger={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="w-full min-w-0 h-auto min-h-9 justify-between gap-2 py-1.5"
              title={provider ? `${name} · ${provider}` : name}
              aria-label={
                isDefault
                  ? `Storyboard ${label.toLowerCase()} default`
                  : `${label} model for shot ${shot?.order}`
              }
            >
              <span className="min-w-0 text-left"><span className="block truncate">{name}</span>{provider && <span className="block truncate text-[10px] font-normal text-muted-foreground">{provider}</span>}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </Button>
          }
        />
      </div>
    );
  }
  const defaultPickers = (
    <div className="space-y-3 pt-2">
      {picker("image_model", true)}
      {picker("video_model", true)}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Used by new shots and any shot without an override.
      </p>
    </div>
  );
  return (
    <section
      aria-label="Shot model controls"
      className="border-b border-border/60 px-3 py-2 space-y-2"
    >
      <h3 className="text-xs font-medium">
        {shot ? "Models" : "Storyboard defaults"}
      </h3>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {shot ? (
        <>
          <div className="space-y-2">
            {picker("image_model", false)}
            {picker("video_model", false)}
          </div>
          <details className="border-t border-border/60 pt-2">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              Storyboard defaults
            </summary>
            {defaultPickers}
          </details>
        </>
      ) : (
        defaultPickers
      )}
    </section>
  );
}
