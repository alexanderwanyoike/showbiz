# Claude rereview resolution

This records the existing rereview findings and their delivery. It is not a new formal code review. Source PRs target `dev`; none were merged. PR139 is superseded by142 and closed.

## Findings

47 new-issue bullets: 46 fixed, 1 explicitly qualified. The original ledger corrections are linked below.

| Review | Resolution |
| --- | --- |
| [#119-1](https://github.com/alexanderwanyoike/showbiz/pull/119#issuecomment-6552290060) | **Fixed:** Removed unreachable post-sync validation. Archive sync owns reference validation and existing missing-file/rollback tests remain. |
| [#120-1](https://github.com/alexanderwanyoike/showbiz/pull/120#issuecomment-6552290199) | **Fixed:** Terminal Result and thrown export failures cached under request ID; regression confirms one dispatch through PENDING and replay. |
| [#120-2](https://github.com/alexanderwanyoike/showbiz/pull/120#issuecomment-6552290199) | **Fixed:** Timeout/cancel guidance branches on request_id presence; actual Unix bridge read timeout test rejects request-ID guidance. |
| [#122-1](https://github.com/alexanderwanyoike/showbiz/pull/122#issuecomment-6552290548) | **Fixed:** The populated archive is rebound to the reopened database with its fingerprints. Tests and a separate runtime API demo prove first edits after conversion/Save As do not rewrite unchanged media. |
| [#123-1](https://github.com/alexanderwanyoike/showbiz/pull/123#issuecomment-6552290685) | **Fixed:** Bounded project/subject/family notices survive panel unmount in the current app session, warnings type is preserved, history errors remain visible, and the thrown receipt-write path is covered. |
| [#123-2](https://github.com/alexanderwanyoike/showbiz/pull/123#issuecomment-6552290685) | **Fixed:** Bounded project/subject/family notices survive panel unmount in the current app session, warnings type is preserved, history errors remain visible, and the thrown receipt-write path is covered. |
| [#123-3](https://github.com/alexanderwanyoike/showbiz/pull/123#issuecomment-6552290685) | **Fixed:** Bounded project/subject/family notices survive panel unmount in the current app session, warnings type is preserved, history errors remain visible, and the thrown receipt-write path is covered. |
| [#125-1](https://github.com/alexanderwanyoike/showbiz/pull/125#issuecomment-6552291011) | **Fixed:** Both native storyboard default setters share installed/enabled/kind catalog validation; unchanged-board integration regressions. |
| [#126-1](https://github.com/alexanderwanyoike/showbiz/pull/126#issuecomment-6552291158) | **Fixed:** Cooldown entries retain SHA-256 credential fingerprints. API keys remain local to the active reconciliation call. Security regression inspects retained entry allocations; existing key-change/cooldown behavior remains tested. |
| [#126-2](https://github.com/alexanderwanyoike/showbiz/pull/126#issuecomment-6552291158) | **Fixed:** Native notes classify ordinary pending receipts separately from failures; pending notes remain in ledger details but are not promoted to accounting warnings. |
| [#126-3](https://github.com/alexanderwanyoike/showbiz/pull/126#issuecomment-6552291158) | **Fixed:** Scoped native ledger error styling added and manually exercised with preserved request rows. |
| [#128-1](https://github.com/alexanderwanyoike/showbiz/pull/128#issuecomment-6552291489) | **Fixed:** Descriptor schema validates exact local Windows pipe ID or private Showbiz POSIX temporary socket namespace before discovery probing. |
| [#128-2](https://github.com/alexanderwanyoike/showbiz/pull/128#issuecomment-6552291489) | **Fixed:** MCP guide separates ID/PID freshness from private-socket directory and bearer-secret access protection. |
| [#128-3](https://github.com/alexanderwanyoike/showbiz/pull/128#issuecomment-6552291489) | **Fixed:** Stale liveness test uses an actual private tmpdir/showbiz-mcp-XXXXXX/app.sock path and asserts folder removal; guide explicitly requires shared TMPDIR and rejects foreign namespaces. |
| [#129-1](https://github.com/alexanderwanyoike/showbiz/pull/129#issuecomment-6552291638) | **Fixed:** Cache sweep isolates and reports errors per entry. This process identity is cached; other owners remain independently verified. An atomic mkdir guard serializes abandoned-lock reclamation, with native permission codes preserved. |
| [#129-2](https://github.com/alexanderwanyoike/showbiz/pull/129#issuecomment-6552291638) | **Fixed:** Cache sweep isolates and reports errors per entry. This process identity is cached; other owners remain independently verified. An atomic mkdir guard serializes abandoned-lock reclamation, with native permission codes preserved. |
| [#129-3](https://github.com/alexanderwanyoike/showbiz/pull/129#issuecomment-6552291638) | **Qualified:** The competing-reclaimer race is fixed with an atomic mkdir guard. The database intentionally closes before releasing ownership so another writer cannot enter while the old connection remains open. A temp-file rename alone would not provide compare-and-swap protection. |
| [#130-1](https://github.com/alexanderwanyoike/showbiz/pull/130#issuecomment-6552291749) | **Fixed:** Guide states Linux generation and Linux CI-only byte checks. |
| [#130-2](https://github.com/alexanderwanyoike/showbiz/pull/130#issuecomment-6552291749) | **Fixed:** YAML parsing inspects the actual jobs containing the icon check and requires ubuntu-latest; a later matrix/non-Linux job cannot satisfy it. |
| [#131-1](https://github.com/alexanderwanyoike/showbiz/pull/131#issuecomment-6552291898) | **Fixed:** Route identity gates the canvas and controls during loading and failed navigation. Delayed and failed storyboard switching was exercised manually. |
| [#132-1](https://github.com/alexanderwanyoike/showbiz/pull/132#issuecomment-6552292056) | **Fixed:** Unknown document handlers rejected before execution; shared explicit classification and every real createDataCommands key covered. |
| [#132-2](https://github.com/alexanderwanyoike/showbiz/pull/132#issuecomment-6552292056) | **Fixed:** EACCES/EROFS/EPERM creating an adjacent lock falls back to readonly opening. Regression uses actual protected filesystem and stubs successful access probes to reproduce missed ACL checks. Native Windows ACLs not manually exercised. |
| [#132-3](https://github.com/alexanderwanyoike/showbiz/pull/132#issuecomment-6552292056) | **Fixed:** read_only now required; one native command-test fixture updated. Strict type checks and readonly integration pass. |
| [#135-1](https://github.com/alexanderwanyoike/showbiz/pull/135#issuecomment-6552292530) | **Fixed:** Architecture now describes self-contained documents, embedded media, disposable caches, usage, OpenRouter/local transports and MCP. Removed the duplicate blank line and corrected ledger dispositions/references. |
| [#135-2](https://github.com/alexanderwanyoike/showbiz/pull/135#issuecomment-6552292530) | **Fixed:** Architecture now describes self-contained documents, embedded media, disposable caches, usage, OpenRouter/local transports and MCP. Removed the duplicate blank line and corrected ledger dispositions/references. |
| [#136-1](https://github.com/alexanderwanyoike/showbiz/pull/136#issuecomment-6552292709) | **Fixed:** Official Electron requestSingleInstanceLock/second-instance pattern routes subsequent arguments to current window before duplicate runtime startup. Relative paths use launcher cwd; restore/focus covered. Independent instances remain possible with separate profiles/device-storage directories. |
| [#137-1](https://github.com/alexanderwanyoike/showbiz/pull/137#issuecomment-6552292878) | **Fixed:** The font check runs in distribution tests, requires at least one referenced font and verifies every referenced asset is emitted. |
| [#138-1](https://github.com/alexanderwanyoike/showbiz/pull/138#issuecomment-6552293012) | **Fixed:** Committed renames notify the desktop metadata callback. A manual renderer rename and packaged native MCP rename passed. |
| [#139-1](https://github.com/alexanderwanyoike/showbiz/pull/139#issuecomment-6552293140) | **Fixed:** The fixture cleanup is included in PR142; redundant PR139 is closed rather than merging its integration history. |
| [#140-1](https://github.com/alexanderwanyoike/showbiz/pull/140#issuecomment-6552293306) | **Fixed:** Removed unused shortcut helpers and their obsolete test; shared Settings accelerator and a macOS caption floor remain, with shadowed CSS removed. |
| [#140-2](https://github.com/alexanderwanyoike/showbiz/pull/140#issuecomment-6552293306) | **Fixed:** Removed unused shortcut helpers and their obsolete test; shared Settings accelerator and a macOS caption floor remain, with shadowed CSS removed. |
| [#141-1](https://github.com/alexanderwanyoike/showbiz/pull/141#issuecomment-6552293493) | **Fixed:** Discard resets creation state immediately. Attempt tokens prevent a stale completion clearing or navigating a newer creation. The pending-save/reopen/Escape flow was exercised manually. |
| [#142-1](https://github.com/alexanderwanyoike/showbiz/pull/142#issuecomment-6552293678) | **Fixed:** One native aria-disabled trigger remains mounted across state changes, guards activation and preserves focus. Keyboard Export return focus was exercised manually. |
| [#143-1](https://github.com/alexanderwanyoike/showbiz/pull/143#issuecomment-6552293806) | **Fixed:** Creation retries reuse only a current entry with no takes. Recovering through Variation or Upload releases the draft identity; character/location/frame regressions and a manual recovery/new-entry journey passed. |
| [#144-1](https://github.com/alexanderwanyoike/showbiz/pull/144#issuecomment-6552293961) | **Fixed:** Notice test accepts an installed Undici version rather than pinning one patch. |
| [#144-2](https://github.com/alexanderwanyoike/showbiz/pull/144#issuecomment-6552293961) | **Fixed:** Declared-only licence exceptions moved to a version-specific allowlist. |
| [#144-3](https://github.com/alexanderwanyoike/showbiz/pull/144#issuecomment-6552293961) | **Fixed:** Vite module-derived notices now include React/Radix and ship inside dist/THIRD_PARTY_NOTICES.txt. Four real-build licence tests pass. Exact Radix upstream source URLs retained. Metadata-only cases are explicit, not fabricated licence text. |
| [#145-1](https://github.com/alexanderwanyoike/showbiz/pull/145#issuecomment-6552294131) | **Fixed:** Final project-save errors synchronously append to private appDataDir/logs/project-storage.log, with timestamp. Logging failure preserves original error. Actual filesystem regression checks content and mode. |
| [#145-2](https://github.com/alexanderwanyoike/showbiz/pull/145#issuecomment-6552294131) | **Fixed:** Close interface now synchronous. The change helper still accepts async operations for other commands, which actually require it. |
| [#146-1](https://github.com/alexanderwanyoike/showbiz/pull/146#issuecomment-6552294288) | **Fixed:** Removed duplicate outgoing fields and native comparison branch. Only price_basis supplies provenance; redundant top-level inputs return INVALID_INPUT. Tests tighten the contract rather than silently ignoring metadata. |
| [#147-1](https://github.com/alexanderwanyoike/showbiz/pull/147#issuecomment-6552294429) | **Fixed:** HttpRequestArgs documents any-host opt-in semantics, one-hour total cap and why ordinary cloud calls must leave timeout_ms unset. |
| [#147-2](https://github.com/alexanderwanyoike/showbiz/pull/147#issuecomment-6552294429) | **Fixed:** Added direct Undici constructor-policy coverage asserting both zero inactivity timeouts and selected dispatcher/overall signal; existing real loopback test covers the actual deadline. This is characterization coverage of already-correct behavior. |
| [#148-1](https://github.com/alexanderwanyoike/showbiz/pull/148#issuecomment-6552294595) | **Fixed:** Removed unreachable Veo done/error branch; readVeoOperation owns error handling. Existing operation/error tests pass. |
| [#148-2](https://github.com/alexanderwanyoike/showbiz/pull/148#issuecomment-6552294595) | **Fixed:** KIE retries network/HTTP429/5xx and transient API codes without resubmitting POST; terminal errors retain task identity and last useful provider diagnostic. |
| [#148-3](https://github.com/alexanderwanyoike/showbiz/pull/148#issuecomment-6552294595) | **Fixed:** OpenRouter, Replicate and KIE now share one consecutive-failure budget; all public transport recovery tests pass. |
| [#151-1](https://github.com/alexanderwanyoike/showbiz/pull/151#issuecomment-6552295046) | **Fixed:** Custom-rate provider fallback forwards endpoint_id; new real native SQLite settings + renderer estimate regression combines another manual facet, matching expired cache and FAL503. |
| [#151-2](https://github.com/alexanderwanyoike/showbiz/pull/151#issuecomment-6552295046) | **Fixed:** Removed unreachable published/manual staleness and unreachable zero-quote notice branches after domain normalization. |

## Original ledger corrections

[The original 136 findings](review-resolution.md) now record removal of the unused inspector fields, required controlled Bible model ownership and shared defaults, unavailable historical-zero quotes, missing-media conversion policy, accurate attribution wording, the shipped-migration reason and missing PR links.

## Verification

- All 1,473 Vitest tests, seven icon tests and 45 distribution tests passed, with strict TypeScript and both production bundles. Linux AppImage and deb packaging passed.
- Packaged Linux startup and second-instance file URIs, including spaces, opened the intended projects. The duplicate process exited0, only one MCP bridge remained, and native rename succeeded at revision3.
- An Electron43 will-quit harness using the production runtime and shutdown helper preserved an induced final-save error in a mode0600 timestamped log and closed device SQLite.
- Installed app.asar contains React/Radix renderer notices. Native resources contain the Undici notice. Production scripts contain no QA controls.
- Actual renderer checks covered Bible recovery followed by another creation, failed storyboard navigation, discarded creation reopening during a pending native save, keyboard Export focus, retained accounting warnings, combined history errors, preserved Usage rows and unavailable historical-zero quotes. Test faults and zero pricing responses were isolated fixtures, not real provider charges. Screenshots are embedded under Tested in the owning PRs.
- A separate runtime API demo created real media, performed Save As, renamed/reopened the copy, observed zero unchanged-media rewrites and found no device settings in the document.
- The user preview runs the updated backend and production bundle with zero usage rows. Real user projects and credentials were not changed.

## Limits

- Published commit histories are retained; no amend, rebase or force push. Historical phase/grouping criticism cannot be repaired retroactively.
- PR139 is superseded by142 and closed. Dependencies remain explicit; no PR was merged into dev.
- Legacy conversion still rejects missing referenced media instead of silently dropping takes. The original library remains untouched.
- FAL historical per-request averages are not settings-specific unit calculations. Billable quantities are not inferred from ambiguous unit labels.
- A crash during short-lived lock reclamation can leave a guard. Close all instances before removing the named guard.
- MCP discovery requires the same temporary namespace; native Windows ACL and macOS window behavior were not manually verified.
- Metadata-only licence exceptions are explicit; complete legal text is not invented for packages that do not publish it.
- Paid provider generation, actual charge receipts, real local inference hardware, and native Windows/macOS execution were not exercised.
