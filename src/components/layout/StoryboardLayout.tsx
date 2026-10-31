import type { ReactNode } from "react";
import { X } from "lucide-react";
interface StoryboardLayoutProps {
  shotListSlot: ReactNode;
  previewSlot: ReactNode;
  inspectorSlot: ReactNode;
  controlsOpen: boolean;
  controlsId: string;
  onCloseControls: () => void;
}
export function StoryboardLayout({ shotListSlot, previewSlot, inspectorSlot, controlsOpen, controlsId, onCloseControls }: StoryboardLayoutProps) {
  return (
    <div className={`storyboard-workspace ${controlsOpen ? "has-inspector" : ""}`}>
      <section className="canvas-preview" aria-label="Shot preview">{previewSlot}</section>
      <section className="canvas-filmstrip" aria-label="Shot sequence">{shotListSlot}</section>
      <aside id={controlsId} className="canvas-inspector" aria-label="Shot controls" hidden={!controlsOpen}>
        <div className="canvas-inspector-heading"><span>Shot controls</span><button aria-label="Close shot controls" onClick={onCloseControls}><X size={14} /></button></div>
        <div className="canvas-inspector-body">{inspectorSlot}</div>
      </aside>
    </div>
  );
}
