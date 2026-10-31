import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Clapperboard,
  Folder,
  Folders,
  HardDrive,
  LayoutGrid,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import {
  getProjects,
  getStoryboard,
  getStoryboardsWithPreview,
  type Project,
  type StoryboardWithPreview,
} from "../lib/backend-api";

export function ProjectNavigator() {
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [storyboards, setStoryboards] = useState<StoryboardWithPreview[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await getProjects();
        const project = location.pathname.match(/^\/project\/([^/]+)/)?.[1];
        const storyboard = location.pathname.match(
          /^\/storyboard\/([^/]+)/,
        )?.[1];
        const currentId =
          project ??
          (storyboard ? (await getStoryboard(storyboard))?.project_id : null) ??
          null;
        const boards = currentId
          ? await getStoryboardsWithPreview(currentId)
          : [];
        if (!cancelled) {
          setProjects(list);
          setProjectId(currentId);
          setStoryboards(boards);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);
  const bible = location.search.includes("view=bible");
  return (
    <aside className="desktop-sidebar">
      <nav aria-label="Project navigator">
        <div className="sidebar-caption">WORKSPACE</div>
        <Link
          className={`sidebar-item ${location.pathname === "/" ? "is-selected" : ""}`}
          to="/"
          aria-current={location.pathname === "/" ? "page" : undefined}
        >
          <Folders size={15} />
          All projects<span className="sidebar-count">{projects.length}</span>
        </Link>
        <div className="sidebar-caption sidebar-caption-projects">
          <ChevronDown size={11} />
          PROJECTS
        </div>
        <div className="sidebar-projects">
          {projects.map((project) => (
            <div key={project.id}>
              <Link
                to={`/project/${project.id}`}
                className={`sidebar-item ${projectId === project.id ? "is-current-project" : ""}`}
                aria-current={
                  projectId === project.id &&
                  !location.pathname.startsWith("/storyboard/") &&
                  !bible
                    ? "page"
                    : undefined
                }
              >
                <Folder size={15} />
                <span className="truncate">{project.name}</span>
              </Link>
              {projectId === project.id && (
                <div className="sidebar-project-content">
                  <Link
                    to={`/project/${project.id}`}
                    className={`sidebar-item ${!bible && !location.pathname.startsWith("/storyboard/") ? "is-selected" : ""}`}
                  >
                    <LayoutGrid size={14} />
                    Storyboards
                  </Link>
                  <Link
                    to={`/project/${project.id}?view=bible`}
                    className={`sidebar-item ${bible ? "is-selected" : ""}`}
                  >
                    <BookOpen size={14} />
                    Bible
                  </Link>
                  {storyboards.map((board) => (
                    <Link
                      key={board.id}
                      to={`/storyboard/${board.id}`}
                      className={`sidebar-item sidebar-board ${location.pathname === `/storyboard/${board.id}` ? "is-selected" : ""}`}
                      aria-current={
                        location.pathname === `/storyboard/${board.id}`
                          ? "page"
                          : undefined
                      }
                    >
                      <Clapperboard size={13} />
                      <span className="truncate">{board.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="sidebar-error">
            {error}
          </p>
        )}
      </nav>
      <div className="sidebar-storage">
        <HardDrive size={14} />
        <div>
          <strong>Local workspace</strong>
          <span>Projects saved on this device</span>
        </div>
      </div>
    </aside>
  );
}
