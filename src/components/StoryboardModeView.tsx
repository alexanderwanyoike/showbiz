import { StoryboardLayout } from "./layout/StoryboardLayout";

interface StoryboardModeViewProps {
  shotListSlot: React.ReactNode;
  previewSlot: React.ReactNode;
  inspectorSlot: React.ReactNode;
  controlsOpen: boolean;
  controlsId: string;
  onCloseControls: () => void;
}

export default function StoryboardModeView({
  shotListSlot,
  previewSlot,
  inspectorSlot,
  controlsOpen, controlsId, onCloseControls,
}: StoryboardModeViewProps) {
  return (
    <StoryboardLayout controlsOpen={controlsOpen} controlsId={controlsId} onCloseControls={onCloseControls}
      shotListSlot={shotListSlot}
      previewSlot={previewSlot}
      inspectorSlot={inspectorSlot}
    />
  );
}
