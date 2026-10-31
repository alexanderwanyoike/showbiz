# Desktop workspace and appearance

Showbiz uses a full-window desktop shell with a collapsible project navigator, compact workspace toolbars, inset content panels and an application status bar. A document start window provides New, Open and recent files. The open project owns the navigator; its storyboards use a contact sheet. Bible and storyboard work stay within the same shell. Shot selection uses keyboard-accessible controls and media-readiness labels, with no invented timeline positions.

Open Appearance in the title toolbar or Settings. Choose a material, light/dark/system mode and an accent independently. Showbiz native preserves the original surfaces and Showbiz blue remains the default accent. Choices persist on the current device and apply on startup. Invalid saved preferences fall back to native; storage failures are reported instead of claiming the new preference was saved.

The shell follows the existing desktop patterns in [Muzo](https://github.com/alexanderwanyoike/muzo/tree/dev/apps/desktop/src), Auto Digger and Forgecut: a stable sidebar, compact Manrope typography, framed controls, subdued chrome and separate content scrolling. Materials use Auto Digger's vocabulary, and the aluminium surfaces plus cobalt, sage, copper, plum and amber pairs follow Forgecut's existing light/dark palette. The brushed-grain asset comes from Auto Digger (MIT). Manrope is bundled locally with its OFL licence at `/Manrope-LICENSE.txt`.

Preferences use a left-hand category list. Arrow Up and Arrow Down switch categories; keyboard focus remains visible throughout the app. Appearance controls, document opening and switching, project navigation, project renaming, selection and update access retain their functional tests.

## Surface and accent contrast

Light materials pair crisp panels with darker inset surfaces and more distinct borders. Dark materials use deeper backgrounds, raised panels and readable secondary text. The material identities remain separate from the accent.

Accents now use saturated, mode-specific colours rather than pastel variants. Each light and dark accent includes its own foreground colour, tested at a minimum 4.5:1 contrast for primary-button text. Existing stored accent IDs are retained; Sage, Copper and Plum are presented as Emerald, Vermilion and Violet to reflect the stronger palette. Selected shots, focus rings, sliders, switches and primary actions use the chosen accent.

Muzo's surface hierarchy and Auto Digger's aluminium framing informed the separation of chrome, panels and inset areas. The added palette is original; no reference application code or artwork was copied in this pass.

## Project navigation

The title bar keeps File/Edit/View/Help menus, one Project navigator control, and the document name. Storyboards and Bible live in that navigator alongside the project’s boards. The active view is marked in the navigator; the workspace toolbar names the active board and contains its actions. The navigator opens by default in project views and closes by default on the canvas. An explicit open or close choice is retained while navigating within that document.
