import { ZoneContainer } from "./ZoneContainer";

interface EditorLayoutProps {
  mediaPoolSlot: React.ReactNode;
  viewerSlot: React.ReactNode;
  detailTimelineSlot: React.ReactNode;
}

export function EditorLayout({
  mediaPoolSlot,
  viewerSlot,
  detailTimelineSlot,
}: EditorLayoutProps) {
  return (
    <div
      className="flex-1 min-h-0 bg-background"
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        gridTemplateRows: "minmax(0, 2fr) minmax(0, 3fr)",
        gridTemplateAreas: `"media-pool viewer" "detail-timeline detail-timeline"`,
      }}
    >
      <ZoneContainer area="media-pool">{mediaPoolSlot}</ZoneContainer>
      <ZoneContainer area="viewer">{viewerSlot}</ZoneContainer>
      <ZoneContainer area="detail-timeline">
        {detailTimelineSlot}
      </ZoneContainer>
    </div>
  );
}
