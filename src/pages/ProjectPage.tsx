import "../storyboards-library.css";
import type { Result } from "../../shared/result";
import { useAgentChanges } from "../hooks/useAgentChanges";
import { useProjectDocument } from "../contexts/ProjectDocumentContext";
import { useUnsavedWork } from "../hooks/useApplicationWork";
import { withApplicationWork } from "../lib/application-work";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Plus, Clapperboard, Loader2, Search, X } from "lucide-react";
import StoryboardCard from "../components/StoryboardCard";
import ProjectBibleView from "../components/ProjectBibleView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getProject, getStoryboardsWithPreview, createStoryboard, deleteStoryboard } from "../lib/backend-api";
import type { Project, Storyboard, StoryboardWithPreview } from "../lib/backend-api";

async function readProjectLibrary(id: string): Promise<Result<{ project: Project; storyboards: StoryboardWithPreview[] }>> {
  try {
    const [project, storyboards] = await Promise.all([getProject(id), getStoryboardsWithPreview(id)]);
    return project ? { ok: true, value: { project, storyboards } } : { ok: false, error: { code: "NOT_FOUND", message: "This project is unavailable. Retry loading the open document." } };
  } catch (cause) {
    return { ok: false, error: { code: "IO_ERROR", message: cause instanceof Error ? cause.message : "Could not load this project's storyboards." } };
  }
}

export default function ProjectPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const { current, bibleGenerationModel, setBibleGenerationModel } = useProjectDocument();
  const id = routeId ?? current?.project_id;
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [storyboards, setStoryboards] = useState<StoryboardWithPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [newStoryboardName, setNewStoryboardName] = useState("");
  const [creationOpen, setCreationOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchParams] = useSearchParams();
  const bibleView = searchParams.get("view") === "bible";
  const creating = useRef(false);
  const newAction = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const loadRequest = useRef(0);
  useUnsavedWork("draft", creationOpen && !!newStoryboardName, newStoryboardName);
  useAgentChanges(loadData);
  useEffect(() => {
    const discard = () => { setNewStoryboardName(""); setCreationOpen(false); setCreationError(null); };
    window.addEventListener("showbiz:discard-workspace-drafts", discard);
    return () => window.removeEventListener("showbiz:discard-workspace-drafts", discard);
  }, []);
  useEffect(() => {
    if (id) void loadData();
    return () => { loadRequest.current++; };
  }, [id]);

  async function loadData() {
    if (!id) return;
    const request = ++loadRequest.current;
    setIsLoading(true);
    setLoadError(null);
    const result = await readProjectLibrary(id);
    if (request !== loadRequest.current) return;
    if (result.ok) {
      setProject(result.value.project);
      setStoryboards(result.value.storyboards);
    } else setLoadError(result.error.message);
    setIsLoading(false);
  }

  function changeCreationOpen(open: boolean) {
    if (creating.current) return;
    setNewStoryboardName("");
    setCreationError(null);
    setCreationOpen(open);
  }
  async function createDraft(name: string): Promise<Result<Storyboard>> {
    if (!id) return { ok: false, error: { code: "NOT_FOUND", message: "Open a project before creating a storyboard." } };
    try {
      return { ok: true, value: await withApplicationWork("saving", () => createStoryboard(id, name)) };
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
      setStoryboards((previous) => [{ ...result.value, preview_image_path: null }, ...previous]);
      setNewStoryboardName("");
      setCreationOpen(false);
      window.dispatchEvent(new Event("showbiz:project-changed"));
      navigate(`/storyboard/${result.value.id}`);
    } else setCreationError(result.error.message);
    creating.current = false;
    setIsCreating(false);
  }
  async function handleDeleteStoryboard(storyboardId: string): Promise<Result<null>> {
    try {
      const removed = await deleteStoryboard(storyboardId);
      if (!removed) return { ok: false, error: { code: "NOT_FOUND", message: "The storyboard could not be deleted. Refresh and try again." } };
      setStoryboards((previous) => previous.filter((storyboard) => storyboard.id !== storyboardId));
      window.dispatchEvent(new Event("showbiz:project-changed"));
      return { ok: true, value: null };
    } catch (cause) {
      return { ok: false, error: { code: "IO_ERROR", message: cause instanceof Error ? cause.message : "Could not delete storyboard." } };
    }
  }
  function clearSearch() { setSearchQuery(""); searchInput.current?.focus(); }
  const filteredStoryboards = storyboards.filter((storyboard) => storyboard.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  return (
    <div className={bibleView ? "desktop-page" : "desktop-page storyboards-library-workspace"}>
      {!bibleView && (
        <header className="storyboards-context-toolbar" role="toolbar" aria-label="Storyboards">
          <h1>Storyboards</h1>
          <div className="storyboards-search">
            <Search aria-hidden="true" size={14} />
            <Input ref={searchInput} type="search" aria-label="Search storyboards" placeholder="Search storyboards" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} disabled={!project} />
            {searchQuery && <Button variant="ghost" size="icon" aria-label="Clear search" onClick={clearSearch}><X size={12} /></Button>}
          </div>
          <Button ref={newAction} size="sm" disabled={!project} onClick={() => changeCreationOpen(true)}><Plus size={14} />New Storyboard</Button>
        </header>
      )}
      <main className={bibleView ? "workspace-body" : "storyboards-library-main"}>
        {bibleView ? project ? (
          <>
            <h1 className="sr-only">Project bible</h1>
            <ProjectBibleView projectId={project.id} generationModel={bibleGenerationModel && setBibleGenerationModel ? { value: bibleGenerationModel, onChange: setBibleGenerationModel } : undefined} initialTab={searchParams.get("bibleTab") === "frames" ? "frames" : undefined} />
          </>
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center gap-3 p-6" aria-label="Project bible"><h1 className="sr-only">Project bible</h1><p role={loadError ? "alert" : "status"}>{loadError ?? "Loading the open project…"}</p>{loadError && <Button variant="outline" onClick={() => void loadData()}>Retry loading project</Button>}</section>
        ) : (
          <section className="storyboards-gallery" aria-label="Storyboards library" aria-busy={isLoading}>
            <div className="storyboards-gallery-heading">
              <output aria-label="Storyboard count">{filteredStoryboards.length === storyboards.length ? `${storyboards.length} storyboard${storyboards.length === 1 ? "" : "s"}` : `${filteredStoryboards.length} of ${storyboards.length} storyboards`}</output>
              {isLoading && <span role="status"><Loader2 className="animate-spin" size={12} />{project ? "Refreshing…" : "Loading project…"}</span>}
            </div>
            {loadError && <div className="storyboards-load-error"><p role="alert">{loadError}</p><Button variant="outline" size="sm" onClick={() => void loadData()}>Retry loading storyboards</Button></div>}
            {!project && isLoading ? <div className="storyboards-library-empty"><Clapperboard /><p>Loading the open project…</p></div> : !project ? null : storyboards.length === 0 ? (
              <div className="storyboards-library-empty"><Clapperboard /><h2>No storyboards yet</h2><p>Use New Storyboard to start building a sequence of shots.</p></div>
            ) : filteredStoryboards.length === 0 ? (
              <div className="storyboards-library-empty"><Search /><h2>No matching storyboards</h2><p>No storyboard names match “{searchQuery}”.</p><Button variant="outline" size="sm" onClick={clearSearch}>Show all storyboards</Button></div>
            ) : (
              <div className="storyboards-gallery-grid">{filteredStoryboards.map((storyboard) => <StoryboardCard key={storyboard.id} id={storyboard.id} name={storyboard.name} updatedAt={storyboard.updated_at} previewImageUrl={storyboard.preview_image_path} onDelete={handleDeleteStoryboard} />)}</div>
            )}
          </section>
        )}
      </main>
      <Dialog open={creationOpen} onOpenChange={changeCreationOpen}>
        <DialogContent className="storyboards-create-dialog" showCloseButton={!isCreating} onEscapeKeyDown={(event) => { if (creating.current) event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => { event.preventDefault(); newAction.current?.focus(); }}>
          <DialogHeader><DialogTitle>New storyboard</DialogTitle><DialogDescription>Create a storyboard in {project?.name ?? "this project"}. It will open ready for its first shot.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void handleCreateStoryboard(event)}>
            <label htmlFor="new-storyboard-name">Storyboard name</label>
            <Input id="new-storyboard-name" placeholder="Storyboard name..." value={newStoryboardName} onChange={(event) => setNewStoryboardName(event.target.value)} disabled={isCreating} autoFocus />
            {creationError && <p role="alert" className="storyboards-creation-error">{creationError}</p>}
            <DialogFooter><Button variant="outline" disabled={isCreating} onClick={() => changeCreationOpen(false)}>Cancel</Button><Button type="submit" disabled={isCreating || !newStoryboardName.trim()}>{isCreating && <Loader2 size={14} className="animate-spin" />}Create storyboard</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
