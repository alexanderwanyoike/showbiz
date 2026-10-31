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
  menuShortcut,
  redoShortcut,
  fullscreenShortcut,
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
  const shortcut = (keys: string) => menuShortcut(keys, mac);
  const groups: { label: string; commands: [string, string][] }[] = [
    {
      label: "File",
      commands: [
        ["New project", shortcut("N")],
        ["Open project", shortcut("O")],
        ["Save", shortcut("S")],
        ["Save as", shortcut("Shift+S")],
        ["Close project", shortcut("Shift+W")],
      ],
    },
    {
      label: "Edit",
      commands: [
        ["Undo", shortcut("Z")],
        ["Redo", redoShortcut()],
        ["Cut", shortcut("X")],
        ["Copy", shortcut("C")],
        ["Paste", shortcut("V")],
        ["Select all", shortcut("A")],
      ],
    },
    {
      label: "View",
      commands: [
        ["Zoom in", shortcut("+")],
        ["Zoom out", shortcut("-")],
        ["Actual size", shortcut("0")],
        ["Toggle full screen", fullscreenShortcut()],
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
