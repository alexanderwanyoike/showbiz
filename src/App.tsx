import { Routes, Route } from "react-router";
import WorkspacePage from "./pages/WorkspacePage";
import ProjectPage from "./pages/ProjectPage";
import StoryboardPage from "./pages/StoryboardPage";
import VideoSpikePage from "./pages/VideoSpikePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/project/:id" element={<ProjectPage />} />
      <Route path="/storyboard/:id" element={<StoryboardPage />} />
      {/* THROWAWAY: HTML5 video spike, remove with the spike */}
      <Route path="/spike/video" element={<VideoSpikePage />} />
    </Routes>
  );
}
