import { StoryboardLayout } from "./layout/StoryboardLayout";

interface StoryboardModeViewProps {
  shotListSlot: React.ReactNode;
  previewSlot: React.ReactNode;
  inspectorSlot: React.ReactNode;
  inspectorTitle?: React.ReactNode;
  controlsOpen: boolean;
  controlsId: string;
  onCloseControls: () => void;
}

export default function StoryboardModeView({
  shotListSlot,
  previewSlot,
  inspectorSlot,
  inspectorTitle,
  controlsOpen,
  controlsId,
  onCloseControls,
}: StoryboardModeViewProps) {
  return (
    <StoryboardLayout
      inspectorTitle={inspectorTitle}
      controlsOpen={controlsOpen}
      controlsId={controlsId}
      onCloseControls={onCloseControls}
      shotListSlot={shotListSlot}
      previewSlot={previewSlot}
      inspectorSlot={inspectorSlot}
    />
  );
}
