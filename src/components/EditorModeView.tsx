import { EditorLayout } from "./layout/EditorLayout";

interface EditorModeViewProps {
  mediaPoolSlot: React.ReactNode;
  viewerSlot: React.ReactNode;
  detailTimelineSlot: React.ReactNode;
}

export default function EditorModeView({
  mediaPoolSlot,
  viewerSlot,
  detailTimelineSlot,
}: EditorModeViewProps) {
  return (
    <EditorLayout
      mediaPoolSlot={mediaPoolSlot}
      viewerSlot={viewerSlot}
      detailTimelineSlot={detailTimelineSlot}
    />
  );
}
