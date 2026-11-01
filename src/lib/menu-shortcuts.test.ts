import { expect, it } from "vitest";
import { menuAccelerator, menuShortcutLabel } from "../../shared/menu-shortcuts";
it("defines Settings in the same shortcut catalog as the document commands", () => {
  expect(menuAccelerator("settings", "darwin")).toBe("CmdOrCtrl+,");
  expect(menuShortcutLabel("settings", "darwin")).toBe("⌘,");
  expect(menuShortcutLabel("settings", "linux")).toBe("Ctrl+,");
});
