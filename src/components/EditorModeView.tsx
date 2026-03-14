import { EditorLayout } from "./layout/EditorLayout";

interface EditorModeViewProps {
  mediaPoolSlot: React.ReactNode;
  viewerSlot: React.ReactNode;
  miniTimelineSlot?: React.ReactNode;
  detailTimelineSlot: React.ReactNode;
}

export default function EditorModeView({
  mediaPoolSlot,
  viewerSlot,
  miniTimelineSlot,
  detailTimelineSlot,
}: EditorModeViewProps) {
  return (
    <EditorLayout
      mediaPoolSlot={mediaPoolSlot}
      viewerSlot={viewerSlot}
      miniTimelineSlot={miniTimelineSlot}
      detailTimelineSlot={detailTimelineSlot}
    />
  );
}
