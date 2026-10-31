import { Header } from "./components/Header";
import { ProjectNavigator } from "./components/ProjectNavigator";
import { ApplicationStatus } from "./components/ApplicationStatus";
import { Routes, Route } from "react-router";
import WorkspacePage from "./pages/WorkspacePage";
import ProjectPage from "./pages/ProjectPage";
import StoryboardPage from "./pages/StoryboardPage";

export default function App() {
  return (
    <div className="desktop-shell">
      <Header />
      <ProjectNavigator />
      <section className="desktop-content" aria-label="Project workspace">
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/project/:id" element={<ProjectPage />} />
      <Route path="/storyboard/:id" element={<StoryboardPage />} />
    </Routes>
      </section>
      <ApplicationStatus />
    </div>
  );
}
