import { ZoneContainer } from "./ZoneContainer";

interface StoryboardLayoutProps {
  shotListSlot: React.ReactNode;
  previewSlot: React.ReactNode;
  inspectorSlot: React.ReactNode;
}

export function StoryboardLayout({
  shotListSlot,
  previewSlot,
  inspectorSlot,
}: StoryboardLayoutProps) {
  return (
    <div
      className="flex-1 bg-background"
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr 320px",
        gridTemplateRows: "1fr",
        gridTemplateAreas: '"shot-list preview inspector"',
      }}
    >
      <ZoneContainer area="shot-list">{shotListSlot}</ZoneContainer>
      <ZoneContainer area="preview">{previewSlot}</ZoneContainer>
      <ZoneContainer area="inspector">{inspectorSlot}</ZoneContainer>
    </div>
  );
}
