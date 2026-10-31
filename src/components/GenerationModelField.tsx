import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "./ModelPicker";
import { modelProviderName, type ModelProviderIdentity } from "../lib/model-provider";
import type { ModelGroup } from "../lib/models/registry";

export type GenerationModelGroups = ModelGroup<ModelProviderIdentity & {
  id: string;
  name: string;
  provider?: string;
}>[];
export type StoryboardModelDefaults = {
  image_model: string;
  video_model: string;
};
export const INHERIT_STORYBOARD_MODEL = "__storyboard_default__";

export function GenerationModelField({
  label,
  accessibleName,
  value,
  defaultValue,
  groups,
  disabled,
  onSelect,
}: {
  label: string;
  accessibleName: string;
  value: string;
  defaultValue?: string;
  groups: GenerationModelGroups;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const available = groups.flatMap((group) => group.models);
  const inherited = value === INHERIT_STORYBOARD_MODEL;
  const selected = available.find(
    (model) => model.id === (inherited ? defaultValue : value),
  );
  const defaultName =
    available.find((model) => model.id === defaultValue)?.name ?? defaultValue;
  const options = defaultValue
    ? [
        {
          family: "inherit",
          displayName: "Storyboard",
          models: [
            {
              id: INHERIT_STORYBOARD_MODEL,
              name: `Use storyboard default: ${defaultName}`,
            },
          ],
        },
        ...groups,
      ]
    : groups;
  const providerName = modelProviderName(selected);
  const name = selected?.name ?? (inherited ? defaultValue : value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{label}</span>
        {defaultValue && (
          <span>{inherited ? "Uses storyboard default" : "Shot override"}</span>
        )}
      </div>
      <ModelPicker
        groups={options}
        value={value}
        onSelect={onSelect}
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="w-full min-w-0 h-auto min-h-9 justify-between gap-2 py-1.5"
            title={providerName ? `${name} · ${providerName}` : name}
            aria-label={accessibleName}
          >
            <span className="min-w-0 text-left">
              <span className="block truncate">{name}</span>
              {providerName && (
                <span className="block truncate text-[10px] font-normal text-muted-foreground">
                  {providerName}
                </span>
              )}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </Button>
        }
      />
    </div>
  );
}
