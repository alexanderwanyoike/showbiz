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
      className="storyboard-workspace"
    >
      <ZoneContainer area="shot-list">{shotListSlot}</ZoneContainer>
      <ZoneContainer area="preview">{previewSlot}</ZoneContainer>
      <ZoneContainer area="inspector">{inspectorSlot}</ZoneContainer>
    </div>
  );
}
