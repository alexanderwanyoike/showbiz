import type { DesktopPlatform } from "../../shared/desktop-shell";
import { menuShortcutLabel } from "../../shared/menu-shortcuts";
export interface MenuEditor {
  element: HTMLElement | null;
  start: number | null;
  end: number | null;
  direction: "forward" | "backward" | "none" | null;
  range: Range | null;
  editable: boolean;
  selected: boolean;
  writable: boolean;
}
export function captureMenuEditor(): MenuEditor {
  const element =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const control =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
      ? element
      : null;
  const selection = window.getSelection();
  const range = selection?.rangeCount
    ? selection.getRangeAt(0).cloneRange()
    : null;
  const editable =
    (!!control && control.selectionStart !== null) ||
    !!element?.isContentEditable;
  return {
    element,
    start: control?.selectionStart ?? null,
    end: control?.selectionEnd ?? null,
    direction: control?.selectionDirection ?? null,
    range,
    editable,
    selected: control
      ? control.selectionStart !== control.selectionEnd
      : !!window.getSelection()?.toString(),
    writable:
      editable && (!control || (!control.disabled && !control.readOnly)),
  };
}
export function restoreMenuEditor(editor: MenuEditor) {
  if (editor.element?.isConnected) editor.element.focus();
  if (
    (editor.element instanceof HTMLInputElement ||
      editor.element instanceof HTMLTextAreaElement) &&
    editor.start !== null &&
    editor.end !== null
  )
    editor.element.setSelectionRange(
      editor.start,
      editor.end,
      editor.direction ?? undefined,
    );
  else if (editor.range?.commonAncestorContainer.isConnected) {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(editor.range);
  }
}
export function isMacDesktop() {
  return (
    window.showbiz?.desktop?.platform === "darwin" ||
    (!window.showbiz?.desktop && /Mac/i.test(navigator.platform))
  );
}
export function menuShortcut(keys: string, mac = isMacDesktop()) {
  return mac
    ? `${keys.startsWith("Shift+") ? "⇧" : ""}⌘${keys.replace("Shift+", "")}`
    : `Ctrl+${keys}`;
}

export function desktopPlatform(): DesktopPlatform {
  return (
    window.showbiz?.desktop?.platform ?? (isMacDesktop() ? "darwin" : "linux")
  );
}
export function redoShortcut() {
  return menuShortcutLabel("redo", desktopPlatform());
}
export function fullscreenShortcut() {
  return menuShortcutLabel("toggle_fullscreen", desktopPlatform());
}
