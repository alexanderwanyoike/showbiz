# Native workspace polish

The previous controls inherited a 2px theme radius, negative derived radii and a desktop rule that forced every button into a 29px bevelled box. Ghost styling also depended on a data attribute the shared Button never emitted. The Bible used the whole content width for a vertically stacked creation form, leaving its picture library below the controls.

## Design decisions

- Separate quiet toolbar commands, neutral secondary controls and the primary creation action. Use a coherent 8px control radius, visible hover/press/focus states and distinct disabled states across the window and portalled menus/dialogs.
- Native and Carbon use low-chroma surfaces with 8px gutters and 12px bounded panels. Existing vivid accent choices remain available. Explicit metal materials retain their finish.
- Use named icon commands with real pointer and keyboard tooltips in the toolbar. Keep model/provider/inheritance visible in compact inspector rows; make longer scope explanations available through accessible help.
- Give the Bible one visible tabs/creation toolbar. Its media grid owns the main area; a bounded creation dock owns the model, references and draft fields. Its footer keeps the estimate and generation action reachable while the controls scroll.
- Closing the creation dock preserves independent drafts and returns focus to its opener. Picture actions disclose the effective model and estimate before a paid action. Compact references retain a separate picture-preview action.
- Keep native Electron window controls and application menus. The renderer does not imitate platform window buttons.

## Established patterns

The visual reference is the local Auto Digger Carbon material in `src/renderer/styles/materials.css`: neutral body and raised/inset surfaces, bounded panels, quiet chrome and a limited accent. Auto Digger is MIT licensed, copyright 2026 Alexander Wanyoike. This pass follows its composition and token relationships without copying a component implementation.

The toolbar and control hierarchy follows Apple's [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) and [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) guidance. Existing [Radix Slot](https://www.radix-ui.com/primitives/docs/utilities/slot), Dialog, Tabs and Tooltip composition is retained. Shared action buttons use explicit submit semantics so incidental controls do not submit a surrounding form.

## Verification

Behavioral regressions cover action-button composition and form behavior, command names/tooltips/toggles, keyboard help, dock focus/draft retention, the single Bible context toolbar and picture-action disclosure. Rendered verification exercises populated and empty libraries, the creation dock, model selection, failure recovery, picture previews, dialogs and compact layouts in light and dark appearances. Preview media are uploaded local samples; billing records and provider responses are not fabricated.

Final combined validation passed 1,174 tests in 115 files, 39 distribution checks, strict TypeScript, and the required frontend/Electron builds. Manual checks at 1280x720 and an 840x640 actual-application iframe cover the populated frame grid, light/dark materials, creation dock close/reopen, retained reference/prompt drafts, reference preview Escape focus, picture-menu Escape focus, and frame search/filter/Escape focus restoration. This is renderer verification backed by real native document commands; the compact harness is not an OS window resize. Native OS window controls were not changed.
