import { useState } from "react";
import { Link } from "react-router";
import { Clapperboard, Download, Palette, Settings } from "lucide-react";
import { useUpdates } from "../hooks/useUpdates";
import { SettingsDialog } from "./SettingsDialog";
import { Button } from "@/components/ui/button";

export function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"providers" | "updates" | "appearance">("providers");
  const { status: updateStatus } = useUpdates();
  return (
    <header className="desktop-chrome">
      <Link to="/" className="desktop-wordmark" aria-label="Showbiz"><Clapperboard size={20} /><span>Showbiz</span></Link>
      <span className="desktop-chrome-caption">Bible & storyboard</span>
      <div className="desktop-chrome-actions">
        {(updateStatus?.state === "available" || updateStatus?.state === "downloaded") && <Button variant="outline" size="sm" onClick={() => { setSettingsSection("updates"); setSettingsOpen(true); }}><Download size={13} />{updateStatus.state === "downloaded" ? "Update ready" : "Update available"}</Button>}
        <Button variant="ghost" size="icon" aria-label="Appearance" title="Appearance" onClick={() => { setSettingsSection("appearance"); setSettingsOpen(true); }}><Palette size={15} /></Button>
        <Button variant="ghost" size="icon" aria-label="Settings" title="Settings" onClick={() => { setSettingsSection("providers"); setSettingsOpen(true); }}><Settings size={15} /></Button>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} initialSection={settingsSection} />
    </header>
  );
}
