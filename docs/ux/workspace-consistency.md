# Workspace consistency

Storyboards, the shot workspace and Usage & billing now follow the approved Bible workspace direction described in [Native workspace polish](native-control-polish.md).

## Composition

- Storyboards has one context toolbar with a labelled search field and New command. A bounded thumbnail library keeps caption actions next to each storyboard. Empty search results offer recovery without replacing the project workspace.
- New storyboard uses a project-scoped dialog. A failed native save retains its name for retry; duplicate submissions are guarded. Background refreshes keep loaded Bible views and creation drafts mounted.
- The shot preview owns the main canvas. Start and end frames use compact source rows with a full-image dialog on request. Prompt and output settings precede take history. A shorter filmstrip keeps selection and one visible More command per shot, with arrow, Home and End navigation.
- Usage & billing is a ledger workspace with compact project totals, a bounded scrolling table and sticky headings. Receipt identities, provenance and unconfirmed-charge reasons are available through request Details. Cost explanations are available on demand.
- Reported charges, unconfirmed estimates and unknown charges remain distinct. This pass changes their presentation, not provider pricing, reconciliation or accounting rules.

## Established patterns

This extends the existing Auto Digger Carbon composition: neutral surfaces, rounded bounded panels, compact gutters, quiet chrome and a saturated accent. The local reference is MIT licensed, copyright 2026 Alexander Wanyoike. No third-party component implementation was copied.

The control hierarchy follows Apple's [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) and [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) guidance. Existing [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) and [Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu) composition provides modal focus and keyboard behavior. The renderer retains Electron's native window controls and document workflow.

## Verification

Regression tests exercise public journeys for library search, creation failure and retry, duplicate prevention, draft retention across refresh, shot preview and selection, deletion cancellation, billing request details, charge labels, reconciliation, pagination and project boundaries.

Manual verification uses the actual production renderer backed by native project commands in an isolated copy of a self-contained project. Media are local uploaded samples. The ledger is genuinely empty; no provider responses or charges are fabricated. Populated ledger states and receipt explanations are verified in component tests. No paid generation is performed.

The final combined run passes 1,187 tests in 117 files, 39 distribution checks, strict TypeScript and both required builds. Rendered verification covers native light, native dark and Carbon materials at 1280x720, plus an actual application iframe at 840x640. The compact harness verifies renderer layout, not an OS window resize.

Manual journeys include labelled search and clear/no-match recovery, New dialog Escape focus, a genuine SQLite write-lock creation failure followed by successful retry, first-shot creation and choosing an uploaded Bible frame, frame-preview Escape focus, keyboard selection with End, shot-delete cancellation and focus restoration, cost-help Escape focus, and refreshing the genuinely empty ledger. An unfinished Bible draft still blocks navigation; Stay retains it, and clearing the draft restores normal navigation.

The write-lock retry exposed a transient discard prompt caused by delayed native draft-status echoes. A regression now observes dialog insertion as well as router state. Completed creation clears the committed local draft before navigation; native work status still protects file operations and shutdown. The same native retry journey opens the saved storyboard directly after the fix.

The existing user preview receives only built renderer assets after checking for active work and unsaved drafts. Its project package, uploaded media and appearance preferences are preserved. Native OS window behavior and live paid provider billing are not exercised in this presentation pass.
