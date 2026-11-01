import { ProjectSettings } from "./ProjectSettings";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Clapperboard,
  File,
  LayoutGrid,
  Receipt,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import {
  getProject,
  getStoryboardsWithPreview,
  type StoryboardWithPreview,
} from "../lib/backend-api";
import { useProjectDocument } from "../contexts/ProjectDocumentContext";
export function ProjectNavigator() {
  const { current } = useProjectDocument();
  const location = useLocation();
  const [name, setName] = useState(current?.name ?? "");
  const [boards, setBoards] = useState<StoryboardWithPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (!current) return;
      try {
        const [project, storyboards] = await Promise.all([
          getProject(current.project_id),
          getStoryboardsWithPreview(current.project_id),
        ]);
        if (!stopped) {
          setName(project?.name ?? current.name);
          setBoards(storyboards);
          setError(null);
        }
      } catch (cause) {
        if (!stopped) setError(String(cause));
      }
    };
    const refresh = () => {
      void load();
    };
    window.addEventListener("showbiz:project-changed", refresh);
    void load();
    return () => {
      stopped = true;
      window.removeEventListener("showbiz:project-changed", refresh);
    };
  }, [current?.project_id, current?.file_path, location.pathname]);
  if (!current) return null;
  const bible = location.search.includes("view=bible");
  return (
    <aside className="desktop-sidebar" id="project-navigation-panel">
      <div className="sidebar-document">
        <File size={17} />
        <strong>{name}</strong>
        <small>Project</small>
        <ProjectSettings
          projectId={current.project_id}
          name={name}
          onRenamed={setName}
        />
      </div>
      <nav aria-label="Project navigator">
        <Link
          className={`sidebar-item ${!bible && location.pathname.startsWith("/project/") ? "is-selected" : ""}`}
          aria-current={
            !bible && location.pathname.startsWith("/project/")
              ? "page"
              : undefined
          }
          to={`/project/${current.project_id}`}
        >
          <LayoutGrid size={15} />
          Storyboards
        </Link>
        <Link
          className={`sidebar-item ${bible ? "is-selected" : ""}`}
          aria-current={bible ? "page" : undefined}
          to={`/project/${current.project_id}?view=bible`}
        >
          <BookOpen size={15} />
          Bible
        </Link>
        <Link
          className={`sidebar-item ${location.pathname.startsWith("/usage/") ? "is-selected" : ""}`}
          aria-current={
            location.pathname.startsWith("/usage/") ? "page" : undefined
          }
          to={`/usage/${current.project_id}`}
        >
          <Receipt size={15} />
          Usage &amp; billing
        </Link>
        <div className="sidebar-caption sidebar-caption-projects">
          STORYBOARDS
        </div>
        {boards.map((board) => (
          <Link
            key={board.id}
            className={`sidebar-item ${location.pathname === `/storyboard/${board.id}` ? "is-selected" : ""}`}
            aria-current={
              location.pathname === `/storyboard/${board.id}`
                ? "page"
                : undefined
            }
            to={`/storyboard/${board.id}`}
          >
            <Clapperboard size={14} />
            <span className="truncate">{board.name}</span>
          </Link>
        ))}
        {error && (
          <p role="alert" className="sidebar-error">
            {error}
          </p>
        )}
      </nav>
      <div className="sidebar-document-file">
        <File size={13} />
        <span title={current.file_path}>
          {current.file_path.split(/[/\\]/).pop()}
        </span>
        <small>
          {current.read_only
            ? "Read-only · Save As to edit"
            : "Changes saved automatically"}
        </small>
      </div>
    </aside>
  );
}
