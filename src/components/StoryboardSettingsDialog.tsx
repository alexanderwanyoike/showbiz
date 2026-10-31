import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getGroupedImageModels, getGroupedVideoModels } from "../lib/models";
import { useUnsavedWork } from "../hooks/useApplicationWork";
import { GenerationModelField, type StoryboardModelDefaults } from "./GenerationModelField";
import type { StoryboardSettingsValues } from "../../shared/storyboard-settings";
import type { Result } from "../../shared/result";

export function StoryboardSettingsDialog({ name, defaults, onSave }: {
  name: string;
  defaults: StoryboardModelDefaults;
  onSave: (values: StoryboardSettingsValues) => Promise<Result<null>>;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<StoryboardSettingsValues>({name,...defaults});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) { setValues({name,...defaults}); setError(null); }
    wasOpen.current = open;
  },[open,name,defaults.image_model,defaults.video_model]);
  const dirty = values.name !== name || values.image_model !== defaults.image_model || values.video_model !== defaults.video_model;
  useUnsavedWork("draft",open && dirty,values);
  async function save() {
    setSaving(true); setError(null);
    try {
      const result = await onSave({...values,name:values.name.trim()});
      if (result.ok) setOpen(false);
      else setError(result.error.message);
    } catch {setError("Could not save storyboard settings. Try again.");}
    finally {setSaving(false);}
  }
  return (
    <Dialog open={open} onOpenChange={(next) => {if (!saving) setOpen(next);}}>
      <DialogTrigger asChild><Button variant="outline" size="sm">Storyboard settings</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-4rem)] overflow-y-auto">
        <DialogHeader><DialogTitle>Storyboard settings</DialogTitle><DialogDescription>Name and model defaults for this storyboard.</DialogDescription></DialogHeader>
        <form className="space-y-5" onSubmit={(event) => {event.preventDefault();void save();}}>
          <div className="space-y-2">
            <label htmlFor="storyboard-name" className="text-xs font-medium">Storyboard name</label>
            <Input id="storyboard-name" value={values.name} onChange={(event) => setValues({...values,name:event.target.value})} disabled={saving} />
          </div>
          <section aria-label="Storyboard model defaults" className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1"><h3 className="text-sm font-medium">Model defaults</h3><p className="text-xs leading-relaxed text-muted-foreground">Used for new takes in shots that use the storyboard default. Existing media and shot overrides stay unchanged.</p></div>
            {(["image_model", "video_model"] as const).map((kind) => <GenerationModelField key={kind} label={kind === "image_model" ? "Image model" : "Video model"} accessibleName={`Storyboard ${kind === "image_model" ? "image" : "video"} default`} value={values[kind]} groups={kind === "image_model" ? getGroupedImageModels() : getGroupedVideoModels()} disabled={saving} onSelect={(value) => setValues({...values,[kind]:value})} />)}
          </section>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !dirty || !values.name.trim()}>{saving ? "Saving…" : "Save"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
