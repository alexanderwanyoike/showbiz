import { useRef, useState, type ReactNode } from "react";
import { Clapperboard, Download, Palette, Settings } from "lucide-react";
import { useUpdates } from "../hooks/useUpdates";
import { SettingsDialog } from "./SettingsDialog";
import { WorkspaceCommand } from "./WorkspaceCommand";
import { useTitlebarAppearance } from "../hooks/useTitlebarAppearance";
import type { MenuSettingsSection } from "./ApplicationMenu";
import "../application-menu.css";
import { Button } from "@/components/ui/button";

export function Header({
  caption = "Bible & storyboard",
  children,
  menu,
}: {
  caption?: string;
  children?: ReactNode;
  menu?: (actions: { openSettings: (section: MenuSettingsSection) => void; reportError: (message: string) => void }) => ReactNode;
}) {
  const chrome = useRef<HTMLElement>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const titlebar = useTitlebarAppearance(chrome);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "providers" | "updates" | "appearance"
  >("providers");
  const { status: updateStatus } = useUpdates();
  return (
    <header ref={chrome} className="desktop-chrome integrated-titlebar" data-native-titlebar={window.showbiz?.desktop?.customTitlebar ? "true" : "false"} data-desktop-platform={window.showbiz?.desktop?.platform}>
      <div className="desktop-wordmark" aria-label="Showbiz">
        <Clapperboard size={20} />
        <span>Showbiz</span>
      </div>
      {menu?.({ openSettings: (section) => { setSettingsSection(section); setSettingsOpen(true); }, reportError: setMenuError })}
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
            <span className="desktop-update-label">{updateStatus.state === "downloaded"
              ? "Update ready"
              : "Update available"}</span>
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
      {(menuError || titlebar.error) && <div role="alert" className="app-menu-error"><span>{menuError ?? titlebar.error}</span>{!menuError && <Button variant="ghost" size="sm" onClick={titlebar.retry}>Retry</Button>}<Button variant="ghost" size="sm" onClick={() => { setMenuError(null); titlebar.dismiss(); }}>Dismiss</Button></div>}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSection={settingsSection}
      />
    </header>
  );
}
