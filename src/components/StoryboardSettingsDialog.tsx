import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getGroupedImageModels, getGroupedVideoModels } from "../lib/models";
import { GenerationModelField, type StoryboardModelDefaults } from "./GenerationModelField";

export function StoryboardSettingsDialog({ open, onOpenChange, name, editedName, onNameChange, onRename, defaults, onDefaultsChange, disabled, error }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  editedName: string;
  onNameChange: (name: string) => void;
  onRename: () => void;
  defaults: StoryboardModelDefaults;
  onDefaultsChange: (models: StoryboardModelDefaults) => void;
  disabled: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Storyboard settings</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); onRename(); }}>
          <label htmlFor="storyboard-name" className="text-xs font-medium">Storyboard name</label>
          <div className="flex gap-2">
            <Input id="storyboard-name" value={editedName} onChange={(event) => onNameChange(event.target.value)} disabled={disabled} />
            <Button variant="outline" type="submit" disabled={disabled || !editedName.trim() || editedName.trim() === name}>Rename</Button>
          </div>
        </form>
        <section aria-label="Storyboard model defaults" className="space-y-3 border-t border-border pt-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Model defaults</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">Used by new shots and shots set to use the storyboard default. Shot overrides stay unchanged.</p>
          </div>
          {(["image_model", "video_model"] as const).map((kind) => <GenerationModelField key={kind} label={kind === "image_model" ? "Image model" : "Video model"} accessibleName={`Storyboard ${kind === "image_model" ? "image" : "video"} default`} value={defaults[kind]} groups={kind === "image_model" ? getGroupedImageModels() : getGroupedVideoModels()} disabled={disabled} onSelect={(value) => onDefaultsChange({ ...defaults, [kind]: value })} />)}
          <p className="text-[11px] text-muted-foreground">Model changes save automatically.</p>
        </section>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={disabled}>Done</Button></div>
      </DialogContent>
    </Dialog>
  );
}
