import { ZoneContainer } from "./ZoneContainer";

interface EditorLayoutProps {
  mediaPoolSlot: React.ReactNode;
  viewerSlot: React.ReactNode;
  miniTimelineSlot?: React.ReactNode;
  detailTimelineSlot: React.ReactNode;
}

export function EditorLayout({
  mediaPoolSlot,
  viewerSlot,
  miniTimelineSlot,
  detailTimelineSlot,
}: EditorLayoutProps) {
  return (
    <div
      className="flex-1 bg-background"
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 3fr",
        gridTemplateRows: "1fr 48px 1fr",
        gridTemplateAreas: `"media-pool viewer" "mini-timeline mini-timeline" "detail-timeline detail-timeline"`,
      }}
    >
      <ZoneContainer area="media-pool">{mediaPoolSlot}</ZoneContainer>
      <ZoneContainer area="viewer">{viewerSlot}</ZoneContainer>
      <ZoneContainer area="mini-timeline">{miniTimelineSlot}</ZoneContainer>
      <ZoneContainer area="detail-timeline">
        {detailTimelineSlot}
      </ZoneContainer>
    </div>
  );
}
