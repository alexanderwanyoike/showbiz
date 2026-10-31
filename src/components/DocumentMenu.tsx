import { useEffect } from "react";
import { Menubar } from "radix-ui";
import {
  useProjectDocument,
  type DocumentAction,
} from "../contexts/ProjectDocumentContext";
import { useApplicationWork } from "../hooks/useApplicationWork";
import { menuShortcut } from "../lib/menu-editor";
export function DocumentMenu({
  mac,
  onQuit,
  canQuit,
  onSettings,
  onCloseAutoFocus,
}: {
  mac: boolean;
  onQuit: () => void;
  canQuit: boolean;
  onSettings: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const document = useProjectDocument();
  const work = useApplicationWork();
  const disabled =
    document.busy ||
    document.loading ||
    work.active.length > 0 ||
    work.unsaved.length > 0 ||
    work.closing;
  useEffect(() => {
    if (window.showbiz?.onDocumentAction) return;
    const shortcut = (event: KeyboardEvent) => {
      if (
        !(mac ? event.metaKey : event.ctrlKey) ||
        event.altKey ||
        (mac ? event.ctrlKey : event.metaKey)
      )
        return;
      const key = event.key.toLowerCase();
      const action: DocumentAction | null =
        key === "n" && !event.shiftKey
          ? "new"
          : key === "o" && !event.shiftKey
            ? "open"
            : key === "s"
              ? event.shiftKey
                ? "save_as"
                : "save"
              : key === "w" && event.shiftKey
                ? "close"
                : null;
      if (!action) return;
      event.preventDefault();
      if (
        !disabled &&
        (action === "new" || action === "open" || document.current)
      )
        void document.action(action);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [document, disabled, mac]);
  const item = (
    label: string,
    action: DocumentAction,
    shortcut: string,
    requiresProject = false,
  ) => (
    <Menubar.Item
      className="app-menu-item"
      aria-label={label}
      disabled={disabled || (requiresProject && !document.current)}
      onSelect={() => {
        void document.action(action);
      }}
    >
      {label}
      <span className="app-menu-shortcut" aria-hidden="true">
        {menuShortcut(shortcut, mac)}
      </span>
    </Menubar.Item>
  );
  return (
    <Menubar.Menu value="file">
      <Menubar.Trigger data-menu-trigger="file" className="app-menu-trigger">
        File
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content
          className="app-menu-content"
          align="start"
          sideOffset={5}
          collisionPadding={8}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {item("New Project…", "new", "N")}
          {item("Open Project…", "open", "O")}
          <Menubar.Separator className="app-menu-separator" />
          {item("Save", "save", "S", true)}
          {item("Save As…", "save_as", "Shift+S", true)}
          <Menubar.Separator className="app-menu-separator" />
          {item("Close Project", "close", "Shift+W", true)}
          <Menubar.Separator className="app-menu-separator" />
          <Menubar.Item className="app-menu-item" onSelect={onSettings}>
            Settings…
          </Menubar.Item>
          <Menubar.Item
            className="app-menu-item"
            disabled={!canQuit}
            onSelect={onQuit}
          >
            Quit Showbiz
            <span className="app-menu-shortcut" aria-hidden="true">
              {menuShortcut("Q", mac)}
            </span>
          </Menubar.Item>
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  );
}
