import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "./ModelPicker";
import {
  modelProviderName,
  type ModelProviderIdentity,
} from "../lib/model-provider";
import type { ModelGroup } from "../lib/models/registry";

export type GenerationModelGroups = ModelGroup<
  ModelProviderIdentity & {
    id: string;
    name: string;
    provider?: string;
  }
>[];
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
    <div className="generation-model-field">
      <div className="generation-model-label">
        <span>{label}</span>
        {defaultValue && (
          <span className="generation-model-scope"><span aria-hidden="true">{inherited ? "Default" : "Override"}</span><span className="sr-only">{inherited ? "Uses storyboard default" : "Shot override"}</span></span>
        )}
      </div>
      <ModelPicker
        groups={options}
        value={value}
        onSelect={onSelect}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="generation-model-choice"
            title={providerName ? `${name} · ${providerName}` : name}
            aria-label={accessibleName}
          >
            <span className="min-w-0 text-left">
              <span className="block truncate">{name}</span>
              {providerName && (
                <span className="generation-model-provider">
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
