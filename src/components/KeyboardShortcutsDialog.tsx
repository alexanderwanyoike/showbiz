import { menuShortcutLabel, type MenuShortcut } from "../../shared/menu-shortcuts";
import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  isMacDesktop,
  desktopPlatform,
} from "../lib/menu-editor";
export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const origin = useRef<HTMLElement | null>(null);
  const mac = isMacDesktop();
  const shortcut = (command: MenuShortcut) => menuShortcutLabel(command, desktopPlatform());
  const groups: { label: string; commands: [string, string][] }[] = [
    {
      label: "File",
      commands: [
        ["New project", shortcut("new")],
        ["Open project", shortcut("open")],
        ["Save", shortcut("save")],
        ["Save as", shortcut("save_as")],
        ["Close project", shortcut("close")],
      ],
    },
    {
      label: "Edit",
      commands: [
        ["Undo", shortcut("undo")],
        ["Redo", shortcut("redo")],
        ["Cut", shortcut("cut")],
        ["Copy", shortcut("copy")],
        ["Paste", shortcut("paste")],
        ["Select all", shortcut("select_all")],
      ],
    },
    {
      label: "View",
      commands: [
        ["Zoom in", shortcut("zoom_in")],
        ["Zoom out", shortcut("zoom_out")],
        ["Actual size", shortcut("zoom_reset")],
        ["Toggle full screen", shortcut("toggle_fullscreen")],
      ],
    },
    {
      label: "Menu navigation",
      commands: [
        ["Focus application menu", mac ? "F10" : "Alt or F10"],
        ["Move between menus", "← / →"],
        ["Open menu", "↓ / Enter"],
        ["Close menu", "Escape"],
        ["Return to editor", "Escape again"],
      ],
    },
  ];
  if (window.showbiz?.desktop?.platform === "darwin") groups.pop();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="keyboard-shortcuts-dialog"
        onOpenAutoFocus={() => {
          origin.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          origin.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            File shortcuts use the desktop menu. Editing commands act on the
            focused field.
          </DialogDescription>
        </DialogHeader>
        <div className="keyboard-shortcut-list">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3>{group.label}</h3>
              <dl>
                {group.commands.map(([label, keys]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      <kbd>{keys}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
