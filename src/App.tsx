import { useState } from "react";
import { PanelLeft } from "lucide-react";
import { Routes, Route, useLocation } from "react-router";
import { Header } from "./components/Header";
import { DocumentMenu } from "./components/DocumentMenu";
import { ProjectNavigator } from "./components/ProjectNavigator";
import { ApplicationStatus } from "./components/ApplicationStatus";
import {
  ProjectDocumentProvider,
  useProjectDocument,
} from "./contexts/ProjectDocumentContext";
import UsagePage from "./pages/UsagePage";
import WorkspacePage from "./pages/WorkspacePage";
import ProjectPage from "./pages/ProjectPage";
import StoryboardPage from "./pages/StoryboardPage";
function DocumentWorkspace() {
  const document = useProjectDocument();
  const shotWorkspace = useLocation().pathname.startsWith("/storyboard/");
  const [navigatorPreference, setNavigatorPreference] = useState<{
    file: string;
    open: boolean;
  } | null>(null);
  const navigatorOpen =
    !!document.current &&
    (navigatorPreference?.file === document.current.file_path
      ? navigatorPreference.open
      : !shotWorkspace);
  return (
    <div
      className={`desktop-shell ${navigatorOpen ? "" : "desktop-shell-start"}`}
    >
      <Header caption={document.current?.name ?? ""}>
        {!window.showbiz?.onDocumentAction && <DocumentMenu />}
        {document.current && (
          <button
            type="button"
            className="desktop-navigator-toggle"
            aria-label="Project navigator"
            aria-expanded={navigatorOpen}
            aria-controls="project-navigation-panel"
            onClick={() =>
              setNavigatorPreference({
                file: document.current!.file_path,
                open: !navigatorOpen,
              })
            }
          >
            <PanelLeft size={15} />
            <span>Project</span>
          </button>
        )}
      </Header>
      {navigatorOpen && <ProjectNavigator />}
      <section className="desktop-content" aria-label="Project workspace">
        {document.error && (
          <div role="alert" className="document-error">
            <span>{document.error}</span>
            <button onClick={document.dismissError}>Dismiss</button>
          </div>
        )}
        <div
          className="document-content"
          key={document.current?.file_path ?? "start"}
        >
          {document.current ? (
            <Routes>
              <Route path="/usage/:id" element={<UsagePage />} />
              <Route path="/project/:id" element={<ProjectPage />} />
              <Route path="/storyboard/:id" element={<StoryboardPage />} />
              <Route path="*" element={<ProjectPage />} />
            </Routes>
          ) : (
            <WorkspacePage />
          )}
        </div>
      </section>
      <ApplicationStatus />
    </div>
  );
}
export default function App() {
  return (
    <ProjectDocumentProvider>
      <DocumentWorkspace />
    </ProjectDocumentProvider>
  );
}
