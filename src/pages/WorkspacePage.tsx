import {
  Clapperboard,
  FilePlus2,
  FolderOpen,
  File,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useProjectDocument } from "../contexts/ProjectDocumentContext";
export default function WorkspacePage() {
  const document = useProjectDocument();
  return (
    <main className="document-start" aria-label="Open a project">
      <div className="document-start-panel">
        <section className="document-start-actions">
          <Clapperboard size={42} strokeWidth={1.2} />
          <h1>Showbiz</h1>
          <p>Bible & storyboard</p>
          <button
            aria-label="New Project"
            disabled={document.busy || document.loading}
            onClick={() => {
              void document.action("new");
            }}
          >
            <FilePlus2 size={18} />
            <span>
              New Project<small>Create a project file</small>
            </span>
          </button>
          <button
            aria-label="Open Project"
            disabled={document.busy || document.loading}
            onClick={() => {
              void document.action("open");
            }}
          >
            <FolderOpen size={18} />
            <span>
              Open Project<small>Choose a .showbiz file</small>
            </span>
          </button>
        </section>
        <section className="document-start-recent" aria-label="Recent projects">
          <h2>Recent</h2>
          {document.loading ? (
            <p>
              <Loader2 size={14} className="animate-spin" /> Reading recent
              files…
            </p>
          ) : document.recent.length ? (
            <ul>
              {document.recent.map((item) => (
                <li key={item.file_path}>
                  <button
                    disabled={document.busy}
                    aria-label={`Open ${item.name}`}
                    onClick={() => {
                      void document.openRecent(item.file_path);
                    }}
                  >
                    <File size={18} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.file_path}</small>
                    </span>
                    <ChevronRight size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No recent projects.
              <br />
              Open a file or create a new one.
            </p>
          )}
          {document.legacy.length > 0 && (
            <details className="document-legacy">
              <summary>
                Convert an existing library project ({document.legacy.length})
              </summary>
              <p>
                Save an independent project file with its media. Your existing
                library stays available.
              </p>
              {document.legacy.map((item) => (
                <button
                  key={item.id}
                  disabled={document.busy}
                  onClick={() => {
                    void document.importLegacy(item.id);
                  }}
                >
                  <File size={15} />
                  <span>{item.name}</span>
                  <ChevronRight size={13} />
                </button>
              ))}
            </details>
          )}
        </section>
      </div>
    </main>
  );
}
