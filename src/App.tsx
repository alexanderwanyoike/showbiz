import { Navigate, Route, Routes } from "react-router";
import WorkspacePage from "./pages/WorkspacePage";
import ProjectPage from "./pages/ProjectPage";
import StoryboardPage from "./pages/StoryboardPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/project/:id" element={<ProjectPage />} />
      <Route
        path="/storyboard/:id"
        element={<Navigate to="storyboard" replace />}
      />
      <Route path="/storyboard/:id/:mode" element={<StoryboardPage />} />
    </Routes>
  );
}
