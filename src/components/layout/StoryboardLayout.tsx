import "../../shot-workspace.css";
import { WorkspaceCommand } from "../WorkspaceCommand";
import type { ReactNode } from "react";
import { X } from "lucide-react";
interface StoryboardLayoutProps {
  shotListSlot: ReactNode;
  previewSlot: ReactNode;
  inspectorSlot: ReactNode;
  inspectorTitle?: React.ReactNode;
  controlsOpen: boolean;
  controlsId: string;
  onCloseControls: () => void;
}
export function StoryboardLayout({
  shotListSlot,
  previewSlot,
  inspectorSlot,
  inspectorTitle,
  controlsOpen,
  controlsId,
  onCloseControls,
}: StoryboardLayoutProps) {
  return (
    <div
      className={`storyboard-workspace shot-workspace ${controlsOpen ? "has-inspector" : ""}`}
    >
      <section className="canvas-preview" aria-label="Shot preview">
        {previewSlot}
      </section>
      <section className="canvas-filmstrip" aria-label="Shot sequence">
        {shotListSlot}
      </section>
      <aside
        id={controlsId}
        className="canvas-inspector"
        aria-label="Shot controls"
        hidden={!controlsOpen}
      >
        <div className="canvas-inspector-heading">
          <div className="canvas-inspector-title">
            {inspectorTitle ?? "Shot controls"}
          </div>
          <WorkspaceCommand
            label="Close shot controls"
            onClick={onCloseControls}
          >
            <X size={15} />
          </WorkspaceCommand>
        </div>
        <div className="canvas-inspector-body">{inspectorSlot}</div>
      </aside>
    </div>
  );
}
