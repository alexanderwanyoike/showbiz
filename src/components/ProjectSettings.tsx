import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUnsavedWork } from "../hooks/useApplicationWork";
import { withApplicationWork } from "../lib/application-work";
import { updateProject, type Project } from "../lib/backend-api";
import type { Result } from "../../shared/result";

export function ProjectSettings({
  projectId,
  name,
  onRenamed,
}: {
  projectId: string;
  name: string;
  onRenamed: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useUnsavedWork("draft", open && !saving && draft !== name, draft);
  useEffect(() => {
    const discard = () => {
      setDraft(name);
      setOpen(false);
      setError(null);
    };
    window.addEventListener("showbiz:discard-workspace-drafts", discard);
    return () =>
      window.removeEventListener("showbiz:discard-workspace-drafts", discard);
  }, [name]);

  function changeOpen(next: boolean) {
    if (saving) return;
    setDraft(name);
    setError(null);
    setOpen(next);
  }
  async function rename(): Promise<Result<Project>> {
    try {
      return {
        ok: true,
        value: await withApplicationWork("saving", () =>
          updateProject(projectId, draft.trim()),
        ),
      };
    } catch (cause) {
      return {
        ok: false,
        error: {
          code: "IO_ERROR",
          message:
            cause instanceof Error
              ? cause.message
              : "Could not rename the project.",
        },
      };
    }
  }
  async function save() {
    if (saving || !draft.trim() || draft.trim() === name) return;
    setSaving(true);
    setError(null);
    const result = await rename();
    if (result.ok) {
      onRenamed(result.value.name);
      window.dispatchEvent(new Event("showbiz:project-changed"));
      setOpen(false);
    } else setError(result.error.message);
    setSaving(false);
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Project settings"
          title="Project settings"
          className="sidebar-project-settings"
        >
          <Settings2 size={14} />
        </Button>
      </DialogTrigger>
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>
            Settings for this project. Use File &gt; Save As to change its file
            name or location.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label
            htmlFor="project-settings-name"
            className="mb-2 block text-xs font-medium"
          >
            Project name
          </label>
          <Input
            id="project-settings-name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={saving}
            autoFocus
          />
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => changeOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !draft.trim() || draft.trim() === name}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
