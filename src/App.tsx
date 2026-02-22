import { Routes, Route } from "react-router";
import WorkspacePage from "./pages/WorkspacePage";
import ProjectPage from "./pages/ProjectPage";
import StoryboardPage from "./pages/StoryboardPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/project/:id" element={<ProjectPage />} />
      <Route path="/storyboard/:id" element={<StoryboardPage />} />
    </Routes>
  );
}
