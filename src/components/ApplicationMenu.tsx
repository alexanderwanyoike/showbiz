import { menuShortcutLabel } from "../../shared/menu-shortcuts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Menubar } from "radix-ui";
import { DocumentMenu } from "./DocumentMenu";
import {
  captureMenuEditor,
  restoreMenuEditor,
  isMacDesktop,
  desktopPlatform,
} from "../lib/menu-editor";
import type { DesktopMenuCommand } from "../../shared/desktop-shell";
export type MenuSettingsSection = "providers" | "appearance" | "updates";
export function ApplicationMenu({
  onSettings,
  onError,
  onShortcuts,
}: {
  onSettings: (section: MenuSettingsSection) => void;
  onError: (message: string) => void;
  onShortcuts: () => void;
}) {
  const [value, setValue] = useState("");
  const [editor, setEditor] = useState(captureMenuEditor);
  const editorRef = useRef(editor);
  const root = useRef<HTMLDivElement>(null);
  const activeMenu = useRef("");
  const deferred = useRef<(() => void) | null>(null);
  const mac = isMacDesktop();
  const platform = desktopPlatform();
  const nativeMac = window.showbiz?.desktop?.platform === "darwin";
  const shortcut = (command: DesktopMenuCommand) => menuShortcutLabel(command, platform);
  const native = !!window.showbiz?.runMenuCommand;
  const capture = useCallback(() => {
    const next = captureMenuEditor();
    editorRef.current = next;
    setEditor(next);
  }, []);
  useEffect(() => {
    if (nativeMac) return;
    let altOnly = false;
    const focusMenu = () => {
      if (!root.current?.contains(document.activeElement)) capture();
      root.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Alt" &&
        !mac &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        altOnly = true;
        event.preventDefault();
        return;
      }
      altOnly = false;
      if (
        event.key === "F10" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        focusMenu();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt" && altOnly) {
        event.preventDefault();
        focusMenu();
      }
      altOnly = false;
    };
    const focusIn = (event: FocusEvent) => {
      if (
        event.target instanceof Element &&
        !root.current?.contains(event.target) &&
        !event.target.closest(".app-menu-content")
      )
        capture();
    };
    const resetAlt = () => { altOnly = false; };
    window.addEventListener("blur", resetAlt);
    window.addEventListener("pointerdown", resetAlt);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    document.addEventListener("focusin", focusIn);
    return () => {
      window.removeEventListener("blur", resetAlt);
      window.removeEventListener("pointerdown", resetAlt);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      document.removeEventListener("focusin", focusIn);
    };
  }, [mac, nativeMac, capture]);
  useEffect(() => window.showbiz?.onApplicationMenuAction?.((action) => {
    if (action === "shortcuts") onShortcuts();
    else onSettings(action === "settings" ? "providers" : action);
  }), [onSettings, onShortcuts]);
  function nativeAction(command: DesktopMenuCommand, restore = false) {
    const target = editorRef.current;
    deferred.current = () => {
      if (restore) restoreMenuEditor(target);
      const run = window.showbiz?.runMenuCommand;
      if (!run) {
        onError("This command is available in the desktop application.");
        return;
      }
      void run(command)
        .then((result) => {
          if (!result.ok) onError(result.error.message);
        })
        .catch((cause: unknown) =>
          onError(
            cause instanceof Error
              ? cause.message
              : "The desktop command could not be completed.",
          ),
        );
    };
  }
  const closed = (event: Event) => {
    const action = deferred.current;
    if (action) {
      deferred.current = null;
      event.preventDefault();
      root.current
        ?.querySelector<HTMLButtonElement>(
          `[data-menu-trigger="${activeMenu.current}"]`,
        )
        ?.focus();
      action();
    }
  };
  const showSettings = (section: MenuSettingsSection) => {
    deferred.current = () => onSettings(section);
  };
  const content = (children: ReactNode) => (
    <Menubar.Portal>
      <Menubar.Content
        className="app-menu-content"
        align="start"
        sideOffset={5}
        collisionPadding={8}
        onCloseAutoFocus={closed}
      >
        {children}
      </Menubar.Content>
    </Menubar.Portal>
  );
  const command = (
    label: string,
    commandId: DesktopMenuCommand,
    shortcut: string,
    disabled = false,
    restore = true,
  ) => (
    <Menubar.Item
      className="app-menu-item"
      aria-label={label}
      disabled={!native || disabled}
      onSelect={() => nativeAction(commandId, restore)}
    >
      {label}
      <span className="app-menu-shortcut" aria-hidden="true">
        {shortcut}
      </span>
    </Menubar.Item>
  );
  const separator = <Menubar.Separator className="app-menu-separator" />;
  if (nativeMac) return null;
  return (
    <Menubar.Root
      ref={root}
      aria-label="Application menu"
      className="app-menubar"
      value={value}
      onValueChange={(next) => {
        if (next) activeMenu.current = next;
        setValue(next);
      }}
      onPointerDownCapture={() => {
        if (
          !root.current?.contains(document.activeElement) &&
          !(
            document.activeElement instanceof Element &&
            document.activeElement.closest(".app-menu-content")
          )
        )
          capture();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !value)
          restoreMenuEditor(editorRef.current);
      }}
    >
      <DocumentMenu
        onSettings={() => showSettings("providers")}
        onCloseAutoFocus={closed}
        mac={mac}
        canQuit={native}
        onQuit={() => {
          const run = window.showbiz?.runMenuCommand;
          if (run)
            void run("quit")
              .then((result) => {
                if (!result.ok) onError(result.error.message);
              })
              .catch((cause: unknown) => onError(String(cause)));
        }}
      />
      <Menubar.Menu value="edit">
        <Menubar.Trigger data-menu-trigger="edit" className="app-menu-trigger">
          Edit
        </Menubar.Trigger>
        {content(
          <>
            {command(
              "Undo",
              "undo",
              shortcut("undo"),
              !editor.writable,
              true,
            )}
            {command("Redo", "redo", shortcut("redo"), !editor.writable, true)}
            {separator}
            {command(
              "Cut",
              "cut",
              shortcut("cut"),
              !editor.writable || !editor.selected,
              true,
            )}
            {command(
              "Copy",
              "copy",
              shortcut("copy"),
              !editor.selected,
              true,
            )}
            {command(
              "Paste",
              "paste",
              shortcut("paste"),
              !editor.writable,
              true,
            )}
            {separator}
            {command(
              "Select All",
              "select_all",
              shortcut("select_all"),
              !editor.editable,
              true,
            )}
          </>,
        )}
      </Menubar.Menu>
      <Menubar.Menu value="view">
        <Menubar.Trigger data-menu-trigger="view" className="app-menu-trigger">
          View
        </Menubar.Trigger>
        {content(
          <>
            {command("Zoom In", "zoom_in", shortcut("zoom_in"))}
            {command("Zoom Out", "zoom_out", shortcut("zoom_out"))}
            {command("Actual Size", "zoom_reset", shortcut("zoom_reset"))}
            {separator}
            {command(
              "Toggle Full Screen",
              "toggle_fullscreen",
              shortcut("toggle_fullscreen"),
            )}
            {separator}
            <Menubar.Item
              className="app-menu-item"
              onSelect={() => showSettings("appearance")}
            >
              Appearance…
            </Menubar.Item>
          </>,
        )}
      </Menubar.Menu>
      <Menubar.Menu value="help">
        <Menubar.Trigger data-menu-trigger="help" className="app-menu-trigger">
          Help
        </Menubar.Trigger>
        {content(
          <>
            <Menubar.Item
              className="app-menu-item"
              onSelect={() => {
                deferred.current = onShortcuts;
              }}
            >
              Keyboard Shortcuts…
            </Menubar.Item>
            <Menubar.Item
              className="app-menu-item"
              onSelect={() => showSettings("updates")}
            >
              Check for Updates…
            </Menubar.Item>
          </>,
        )}
      </Menubar.Menu>
    </Menubar.Root>
  );
}
