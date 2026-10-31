import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Result } from "../../shared/result";
import { createStoryboard, type Storyboard } from "../lib/backend-api";
import { withApplicationWork } from "../lib/application-work";
import { useUnsavedWork } from "../hooks/useApplicationWork";

export function NewStoryboardDialog({ open, onOpenChange, projectId, projectName, opener, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  projectName: string;
  opener: RefObject<HTMLButtonElement | null>;
  onCreated: (storyboard: Storyboard) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [newStoryboardName, setNewStoryboardName] = useState("");
  const creating = useRef(false);
  useUnsavedWork("draft", open && !!newStoryboardName, newStoryboardName);
  useEffect(() => {
    const discard = () => { setNewStoryboardName(""); onOpenChange(false); setCreationError(null); };
    window.addEventListener("showbiz:discard-workspace-drafts", discard);
    return () => window.removeEventListener("showbiz:discard-workspace-drafts", discard);
  }, [onOpenChange]);
  function changeOpen(next: boolean) {
    if (creating.current) return;
    setNewStoryboardName("");
    setCreationError(null);
    onOpenChange(next);
  }
  async function createDraft(name: string): Promise<Result<Storyboard>> {
    if (!projectId) return { ok: false, error: { code: "NOT_FOUND", message: "Open a project before creating a storyboard." } };
    try {
      return { ok: true, value: await withApplicationWork("saving", () => createStoryboard(projectId, name)) };
    } catch (cause) {
      return { ok: false, error: { code: "IO_ERROR", message: cause instanceof Error ? cause.message : "Could not create the storyboard." } };
    }
  }
  async function handleCreateStoryboard(event: FormEvent) {
    event.preventDefault();
    const name = newStoryboardName.trim();
    if (!name || creating.current) return;
    creating.current = true;
    setIsCreating(true);
    setCreationError(null);
    const result = await createDraft(name);
    if (result.ok) {
      setNewStoryboardName("");
      onOpenChange(false);
      onCreated(result.value);
    } else setCreationError(result.error.message);
    creating.current = false;
    setIsCreating(false);
  }
  return (
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="storyboards-create-dialog" showCloseButton={!isCreating} onEscapeKeyDown={(event) => { if (creating.current) event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
          <DialogHeader><DialogTitle>New storyboard</DialogTitle><DialogDescription>Create a storyboard in {projectName}. It will open ready for its first shot.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void handleCreateStoryboard(event)}>
            <label htmlFor="new-storyboard-name">Storyboard name</label>
            <Input id="new-storyboard-name" placeholder="Storyboard name..." value={newStoryboardName} onChange={(event) => setNewStoryboardName(event.target.value)} disabled={isCreating} autoFocus />
            {creationError && <p role="alert" className="storyboards-creation-error">{creationError}</p>}
            <DialogFooter><Button variant="outline" disabled={isCreating} onClick={() => changeOpen(false)}>Cancel</Button><Button type="submit" disabled={isCreating || !newStoryboardName.trim()}>{isCreating && <Loader2 size={14} className="animate-spin" />}Create storyboard</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
}
