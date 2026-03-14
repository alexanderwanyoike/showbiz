import { StoryboardLayout } from "./layout/StoryboardLayout";

interface StoryboardModeViewProps {
  shotListSlot: React.ReactNode;
  previewSlot: React.ReactNode;
  inspectorSlot: React.ReactNode;
}

export default function StoryboardModeView({
  shotListSlot,
  previewSlot,
  inspectorSlot,
}: StoryboardModeViewProps) {
  return (
    <StoryboardLayout
      shotListSlot={shotListSlot}
      previewSlot={previewSlot}
      inspectorSlot={inspectorSlot}
    />
  );
}
