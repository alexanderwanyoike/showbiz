import { useState, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import type { ModelGroup } from "../lib/models/registry";

interface ModelItem {
  id: string;
  name: string;
  provider?: string;
}

interface ModelPickerProps<T extends ModelItem> {
  groups: ModelGroup<T>[];
  value: string;
  onSelect: (id: string) => void;
  trigger: ReactNode;
}

export function ModelPicker<T extends ModelItem>({
  groups,
  value,
  onSelect,
  trigger,
}: ModelPickerProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No models found.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup
                key={group.family}
                heading={group.models.length > 1 ? group.displayName : undefined}
              >
                {group.models.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    keywords={[model.name, model.provider ?? "", group.displayName]}
                    onSelect={(id) => {
                      onSelect(id);
                      setOpen(false);
                    }}
                  >
                    <CheckIcon
                      className={`h-4 w-4 shrink-0 ${
                        value === model.id ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span className="flex-1 truncate">{model.name}</span>
                    {model.provider && (
                      <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
                        {model.provider}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
