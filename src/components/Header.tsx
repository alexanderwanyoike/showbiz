import { useState, type ReactNode } from "react";
import { Clapperboard, Download, Palette, Settings } from "lucide-react";
import { useUpdates } from "../hooks/useUpdates";
import { SettingsDialog } from "./SettingsDialog";
import { WorkspaceCommand } from "./WorkspaceCommand";
import { Button } from "@/components/ui/button";

export function Header({
  caption = "Bible & storyboard",
  children,
}: {
  caption?: string;
  children?: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "providers" | "updates" | "appearance"
  >("providers");
  const { status: updateStatus } = useUpdates();
  return (
    <header className="desktop-chrome">
      <div className="desktop-wordmark" aria-label="Showbiz">
        <Clapperboard size={20} />
        <span>Showbiz</span>
      </div>
      {children}
      <span className="desktop-chrome-caption">{caption}</span>
      <div className="desktop-chrome-actions">
        {(updateStatus?.state === "available" ||
          updateStatus?.state === "downloaded") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSettingsSection("updates");
              setSettingsOpen(true);
            }}
          >
            <Download size={13} />
            {updateStatus.state === "downloaded"
              ? "Update ready"
              : "Update available"}
          </Button>
        )}
        <WorkspaceCommand
          label="Appearance"
          onClick={() => {
            setSettingsSection("appearance");
            setSettingsOpen(true);
          }}
        >
          <Palette size={17} />
        </WorkspaceCommand>
        <WorkspaceCommand
          label="Settings"
          onClick={() => {
            setSettingsSection("providers");
            setSettingsOpen(true);
          }}
        >
          <Settings size={17} />
        </WorkspaceCommand>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSection={settingsSection}
      />
    </header>
  );
}
