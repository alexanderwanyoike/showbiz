# Integrated application menu

The desktop window previously stacked the operating system title bar and menu bar above Showbiz's own header. The application now uses one themed 48px header for its identity, File/Edit/View/Help menus, project caption and workspace commands.

## Interaction

- File uses the existing document controller for New, Open, Save, Save As and Close Project. Its busy and unsaved-work protections remain authoritative.
- Edit restores the previous editing target before requesting native editing commands. Credentials are never included in the menu bridge.
- View groups native zoom/fullscreen commands and application appearance. File includes application settings; Help provides the shortcut reference and update settings.
- Menus use the existing Radix Menubar implementation for pointer and keyboard interaction. Alt/F10 and directional keys provide keyboard access; Escape closes the menu and restores focus.
- Native menu accelerators remain available while the in-window operating system menu bar stays hidden. Quit still passes through the existing application shutdown guard.
- The header excludes buttons and menus from its draggable region. Native window controls keep their platform behavior. Space for them is reserved only in the desktop shell; the browser preview does not imitate window buttons.

## Established patterns

The shell follows Electron's documented [custom title bar](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar) and [draggable-region](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions) patterns. It uses a hidden title bar with the native control overlay on Windows/Linux and an inset title bar on macOS. Native control colors follow the active application appearance.

The [Radix Menubar](https://www.radix-ui.com/primitives/docs/components/menubar) is supplied by the existing MIT-licensed Radix dependency. It supplies roving focus, directional menu navigation and dismissal rather than introducing another menu library. The visual direction continues the existing Auto Digger-inspired neutral surfaces and saturated accent choices.

The renderer has a small typed shell bridge for allowlisted menu commands and validated opaque colors. These operations are distinct from project data commands and are not available through MCP.

## Verification

The combined suite passes 1,211 tests in 121 files. The final Windows Quit label correction separately passes all seven menu tests. Strict TypeScript, both required builds and 39 distribution checks pass. The shell suite also checks that unsaved-work cancellation blocks integrated Quit.

Manual renderer verification uses real native document commands with disposable project/media fixtures. File Save As creates and opens a separate self-contained document; Close returns to the start screen with project-only actions disabled; Open restores the project. F10, arrow navigation and two Escape presses return to the original field. Help opens a real shortcut reference and restores focus on Escape. View opens Appearance preferences and restores focus after dismissal. Light/dark and compact layouts are inspected and captured.

Screenshots cover 1280x720, plus the actual renderer in 840x640 and 760x640 iframes. Compact verification found and removed a legacy fixed-width wordmark gap. The iframe harness checks renderer layout rather than resizing an operating system window.

The browser preview intentionally disables native-only Edit/View/Quit actions when the shell bridge is absent. Tests verify their native dispatch, editing-target restoration, command failures and theme-color retry. Native caption buttons, dragging, resizing and Windows/macOS appearance cannot be manually verified through the in-app browser. Screenshots show the actual application renderer, not a simulated operating system frame. Native file-picker choices are supplied by the disposable verification harness; paid generations and fabricated billing are not used.
