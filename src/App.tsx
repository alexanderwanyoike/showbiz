import { Routes, Route } from "react-router";
import { Header } from "./components/Header";
import { DocumentMenu } from "./components/DocumentMenu";
import { ProjectNavigator } from "./components/ProjectNavigator";
import { ApplicationStatus } from "./components/ApplicationStatus";
import {
  ProjectDocumentProvider,
  useProjectDocument,
} from "./contexts/ProjectDocumentContext";
import WorkspacePage from "./pages/WorkspacePage";
import ProjectPage from "./pages/ProjectPage";
import StoryboardPage from "./pages/StoryboardPage";
function DocumentWorkspace() {
  const document = useProjectDocument();
  return (
    <div
      className={`desktop-shell ${document.current ? "" : "desktop-shell-start"}`}
    >
      <Header caption={document.current?.name ?? ""}>
        {!window.showbiz?.onDocumentAction && <DocumentMenu />}
      </Header>
      {document.current && <ProjectNavigator />}
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
