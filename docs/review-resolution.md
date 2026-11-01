# Claude review resolution ledger

Completion accounting for the existing findings on source PRs #99 through #118, against the combined document-close baseline `785e1b4`. This is not a new code review. Row numbers below are the original zero-based indexes in the 136-item tracking corpus; the original finding text and detailed owner evidence remain in the accompanying tracking JSON.

The original 136 findings retain their source text and dispositions below. Claude's subsequent rereview identified additional gaps, recorded in the rereview ledger; earlier verification totals do not establish that those gaps were closed.

Verification on Linux: all 1,421 combined Vitest tests, seven icon tests, 42 distribution tests, strict TypeScript and both production bundles passed. The final AppImage and deb built successfully. Actual Electron 43 normal-close and induced final-save-error demos exited successfully, with the latter failure logged. The packaged application opened a file URL and exposed the correct project and revision through MCP. Installed resources contain the full Undici MIT notice. All follow-up CI test jobs passed; current checks are linked from each PR. Visual evidence is embedded in the relevant PR descriptions.

## Explicit qualifications

- **Immutable history:** rows 16, 27, 34, 46, 81, 99, 105, 123, 129 and 134 concern historical commit grouping, order or labels. No prohibited amend/force rewrite was performed; current repair phases are separate commits. Row 134 was already confirmed formatting-only by the original reviewer.
- **Shipped migration:** row 42 retains migration 04's filename under the append-only migration rule.
- **Required contracts/provenance:** row 32 retains snake_case IPC arguments, consistent with current neighbouring commands and project rules. Row 36 retains concise pattern/license references requested in the user-supplied workspace instructions; that requirement is not in the repository AGENTS.md.
- **Verified provider semantics:** row 55 keeps OpenRouter's documented/live-catalog `4K` spelling. The rereview tightens historical-zero quote behavior; its final disposition is tracked separately. Row 94 does not invent billable quantities from FAL unit labels; live metadata and explicitly unadjusted historical estimates remain labelled.
- **Evidence storage:** row 86 preserves committed reviewer-accessible screenshot evidence; attachment storage remains a future workflow choice.
- **Intentional current boundaries:** row 113 retains small project-scoped Usage pagination protection for reused route-driven components and stale replies. Row 133 has one actual AppMark instance, so no speculative ID abstraction was added.
- **Platform limit:** row 135 combines immutable-history criticism with Windows caption interaction that could not be manually exercised here. Current geometry/disclosure behavior has tests and rendered evidence; native Windows interaction is not claimed.

## Original findings

### Source PR #99

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 0 / #99 | Removed NLE guidance | **Fixed:** Current architecture documentation replaces removed NLE instructions and package-export guidance across README/CLAUDE/AGENTS. | [#135](https://github.com/alexanderwanyoike/showbiz/pull/135) `8ae9922` |
| 1 / #99 | Unreachable source-overwrite export guard | **Fixed:** Removed unreachable guard separately: accepted media suffixes cannot equal ZIP/SBZ destination suffixes | [#134](https://github.com/alexanderwanyoike/showbiz/pull/134) `475678e` |
| 2 / #99 | Export errors omit shot/media role | **Fixed:** Selected-media failure names shot ID, role, relative filename and original filesystem cause; existing destination retained | [#134](https://github.com/alexanderwanyoike/showbiz/pull/134) `475678e` |

### Source PR #100

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 3 / #100 | Deleted media remains embedded | **Fixed:** Package sync embeds only record-referenced media; deleted/unreferenced cache data is excluded. | [#119](https://github.com/alexanderwanyoike/showbiz/pull/119) `4886ea8` |
| 4 / #100 | Confirmed package replacement rejected | **Fixed:** Confirmed replacement publishes through temporary/backup files with guarded rollback. | [#122](https://github.com/alexanderwanyoike/showbiz/pull/122) `088cb34` |
| 5 / #100 | Abandoned extraction caches | **Fixed:** Project cache startup sweep identifies live owners and removes abandoned extraction workspaces. | [#129](https://github.com/alexanderwanyoike/showbiz/pull/129) `6009aea` |
| 6 / #100 | PID reuse and read-only locks | **Fixed:** Lock ownership includes process identity to reject PID reuse; read-only document inspection no longer requires a writable adjacent lock. | [#129](https://github.com/alexanderwanyoike/showbiz/pull/129) `6009aea`; [#132](https://github.com/alexanderwanyoike/showbiz/pull/132) `77c831c` |
| 7 / #100 | Symlinked current-file identity | **Fixed:** Create/Open/Save As share canonical real-file identity through symlinked directories. | [#127](https://github.com/alexanderwanyoike/showbiz/pull/127) `caff7c3` |
| 8 / #100 | Final save failure lost on quit | **Fixed:** Synchronous final disposal inspects its Result and logs final-save failures during will-quit; native Electron43 normal close and an induced missing referenced-cache-media failure both exit0, with the failure logged rather than lost. | [#145](https://github.com/alexanderwanyoike/showbiz/pull/145) `edf969a` |
| 9 / #100 | Synchronous large-project save limitation | **Fixed:** docs/project-documents.md:36 explicitly records synchronous main-thread embedding and rollback extraction as a large-project limitation. | [#135](https://github.com/alexanderwanyoike/showbiz/pull/135) `8ae9922` |
| 10 / #100 | Prefix-based mutation classification | **Fixed:** Document read/write classification uses shared explicit saved-data command effects; read-only mode rejects classified mutations rather than guessing by prefix. | [#132](https://github.com/alexanderwanyoike/showbiz/pull/132) `77c831c`; [#121](https://github.com/alexanderwanyoike/showbiz/pull/121) `06d62a3` |
| 11 / #100 | Legacy conversion lacks media context | **Qualified:** Missing-file diagnostics now name the referenced media and retain the OS cause. Conversion still rejects a project with dangling media references rather than silently publishing an incomplete document; the legacy library remains untouched. | [#134](https://github.com/alexanderwanyoike/showbiz/pull/134) |
| 12 / #100 | OS recent-file activation missing | **Fixed:** OS argv/open-file URLs enter the guarded document workflow; native path and URI launches verified in real Electron. | [#136](https://github.com/alexanderwanyoike/showbiz/pull/136) `a61d234` |
| 13 / #100 | Browser verification menu in product | **Resolved later:** App now renders ApplicationMenu; DocumentMenu is its File menu content with product lifecycle actions, not a second standalone browser-verification toolbar. The review describes the older PR100 surface. | [#114](https://github.com/alexanderwanyoike/showbiz/pull/114) `bb0bc86`; [#118](https://github.com/alexanderwanyoike/showbiz/pull/118) `785e1b4` |
| 14 / #100 | Navigator documentation stale | **Fixed:** docs/project-documents.md:29 describes the single collapsible project navigator. | [#135](https://github.com/alexanderwanyoike/showbiz/pull/135) `8ae9922` |
| 15 / #100 | Recent name stale after rename | **Fixed:** Committed project renames refresh recent metadata; a recent-list persistence failure preserves rename/current document/in-memory name, exposes a separate warning, and retries on Save. | [#138](https://github.com/alexanderwanyoike/showbiz/pull/138) `3388d54` |
| 16 / #100 | Historical mixed commits | **Qualified:** Historical commit phase/label/atomicity criticism cannot be corrected without prohibited history rewriting. Current repair commits keep RED, GREEN, refactoring, formatting and documentation separate; no amend or force push. | No new code required |

### Source PR #101

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 17 / #101 | MCP export argument alias | **Fixed:** Native mapper preserved; export-specific timeout, fail-fast mutation lease, concurrent reads and PENDING replay; 29 focused tests/types pass; combined frontend/Electron builds passed root integration | [#120](https://github.com/alexanderwanyoike/showbiz/pull/120) `ff6dd59` |
| 18 / #101 | Native export dialog timeout/queue | **Fixed:** Native mapper preserved; export-specific timeout, fail-fast mutation lease, concurrent reads and PENDING replay; 29 focused tests/types pass; combined frontend/Electron builds passed root integration | [#120](https://github.com/alexanderwanyoike/showbiz/pull/120) `ff6dd59` |
| 19 / #101 | Agent refresh destroys editor state | **Fixed:** Refresh retains the mounted inspector/dialog and focus, reports recoverable errors with Retry, and gates paid submission while stale. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 20 / #101 | Rejected results advance revisions | **Fixed:** Shared saved-data effects, rejected/cancelled results preserve revisions, preload wrapper and single renderer work lease; 33 focused tests and strict types pass | [#121](https://github.com/alexanderwanyoike/showbiz/pull/121) `06d62a3` |
| 21 / #101 | Duplicate mutation classifiers | **Fixed:** Shared saved-data effects, rejected/cancelled results preserve revisions, preload wrapper and single renderer work lease; 33 focused tests and strict types pass | [#121](https://github.com/alexanderwanyoike/showbiz/pull/121) `06d62a3` |
| 22 / #101 | Preload leaks IPC event | **Fixed:** Shared saved-data effects, rejected/cancelled results preserve revisions, preload wrapper and single renderer work lease; 33 focused tests and strict types pass | [#121](https://github.com/alexanderwanyoike/showbiz/pull/121) `06d62a3` |
| 23 / #101 | Duplicate saving leases | **Fixed:** Shared saved-data effects, rejected/cancelled results preserve revisions, preload wrapper and single renderer work lease; 33 focused tests and strict types pass | [#121](https://github.com/alexanderwanyoike/showbiz/pull/121) `06d62a3` |
| 24 / #101 | Stale MCP descriptors/sockets | **Fixed:** Authenticated health and constrained stale cleanup; Windows ACL limits documented; all 35 MCP tests/types and root combined builds pass | [#128](https://github.com/alexanderwanyoike/showbiz/pull/128) `537c947` |
| 25 / #101 | Windows pipe/ACL limitation undocumented | **Fixed:** Authenticated health and constrained stale cleanup; Windows ACL limits documented; all 35 MCP tests/types and root combined builds pass | [#128](https://github.com/alexanderwanyoike/showbiz/pull/128) `537c947` |
| 26 / #101 | MCP docs tied to old PRs | **Fixed:** Removed PR-specific and sibling implementation references from MCP workflow docs | [#120](https://github.com/alexanderwanyoike/showbiz/pull/120) `ff6dd59` |
| 27 / #101 | Historical missing RED phase | **Qualified:** Original missing RED is historical and must not be rewritten. All current repair slices record independently committed intended RED before GREEN; no force/amend | [#120](https://github.com/alexanderwanyoike/showbiz/pull/120) `ff6dd59` |

### Source PR #102

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 28 / #102 | Refresh leaks default-model settings | **Resolved later:** Settings are already derived per selected shot/model; loadData no longer resets them. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 29 / #102 | Image submit ignores model save | **Fixed:** Image/edit openers, submit controls and handlers wait for model persistence; requests and labels resolve the target shot; generation failures are inline. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 30 / #102 | Image dialog names wrong shot model | **Fixed:** Image/edit openers, submit controls and handlers wait for model persistence; requests and labels resolve the target shot; generation failures are inline. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 31 / #102 | Unknown/retired model overrides | **Fixed:** Single explicit runtime catalog uses shared renderer/native validators and rejects unavailable/wrong-kind overrides; 187 focused tests/types pass; combined builds passed root | [#125](https://github.com/alexanderwanyoike/showbiz/pull/125) `fe9e2c2` |
| 32 / #102 | Shot-model IPC argument naming | **Qualified:** Snake_case matches the required IPC JSON contract and adjacent current set_shot_video_settings/clear_shot_start_frame wrappers. Renaming the boundary solely to resemble older camelCase wrappers would break the mandated native/MCP convention. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 33 / #102 | Duplicate model-name lookups | **Resolved later:** ShotModelControls delegates both fields to shared GenerationModelField; no duplicated model-name lookup remains. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 34 / #102 | Historical type/format commit | **Qualified:** Historical commit phase/label/atomicity criticism cannot be corrected without prohibited history rewriting. Current repair commits keep RED, GREEN, refactoring, formatting and documentation separate; no amend or force push. | No new code required |
| 35 / #102 | Unused inspector model fields | **Resolved later:** Current StoryboardPage no longer passes unused image_model/video_model fields in the inspector shot object. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 36 / #102 | Pattern/license attribution questioned | **Qualified:** Retained concise interaction-pattern/license references under the user-supplied workspace instructions. The repository AGENTS.md does not itself contain that attribution requirement. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) |

### Source PR #103

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 37 / #103 | Usage recovery runs during binding | **Fixed:** Interrupted-usage recovery runs only during validated writable project open, not every command binding or Save As. | [#124](https://github.com/alexanderwanyoike/showbiz/pull/124) `ae4f389` |
| 38 / #103 | Unconfirmed totals include failed outcomes | **Fixed:** Usage help now explicitly includes failed/cancelled/interrupted requests, any can incur a charge. | [#149](https://github.com/alexanderwanyoike/showbiz/pull/149) `988467b` |
| 39 / #103 | Quote provenance can contradict snapshot | **Fixed:** Validate explicit provenance, reject contradictions, derive stored fields from immutable snapshot. | [#146](https://github.com/alexanderwanyoike/showbiz/pull/146) `69800ea` |
| 40 / #103 | MCP subject summary inaccessible | **Fixed:** Subject-scoped native/MCP totals and ledger rows are exposed; unused summary pagination is removed. All 41 affected tests and types pass. | [#133](https://github.com/alexanderwanyoike/showbiz/pull/133) `13c370d` |
| 41 / #103 | Dead usage schema guard | **Fixed:** The obsolete sqlite_master guard was removed when interrupted usage recovery moved to validated project open; current generation-usage.ts:32 directly performs the sweep. | [#124](https://github.com/alexanderwanyoike/showbiz/pull/124) `ae4f389` |
| 42 / #103 | Shipped migration filename style | **Qualified:** The append-only migration rule retains the shipped filename. Migration application uses the ordered user_version index; this is a history policy, not a claim that this rename would change ordering. | [#124](https://github.com/alexanderwanyoike/showbiz/pull/124) |
| 43 / #103 | Usage refresh flashes and offset scope | **Fixed:** The Usage page retains same-scope local data during charge refresh, resets pagination on project changes and ignores outdated responses. | [#126](https://github.com/alexanderwanyoike/showbiz/pull/126) |

### Source PR #104

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 44 / #104 | Provider errors fail schema parsing first | **Fixed:** KIE safe error parsing across upload/task/poll/Flux and Veo safe operation/error handling. | [#148](https://github.com/alexanderwanyoike/showbiz/pull/148) `50f2da2` |
| 45 / #104 | Extensible model-ID type claims | **Fixed:** CLAUDE.md:80 explicitly documents extensible string IDs and runtime availability/kind validation, the review's offered documentation alternative. | [#135](https://github.com/alexanderwanyoike/showbiz/pull/135) `8ae9922`; [#125](https://github.com/alexanderwanyoike/showbiz/pull/125) `fe9e2c2` |
| 46 / #104 | Historical mixed typing commit | **Qualified:** Historical commit grouping cannot be rewritten with amend/rebase forbidden; current fixes separate atomic RED/GREEN. | No new code required |
| 47 / #104 | Whitespace-only role-query lines | **Fixed:** Whitespace-only fixture lines are removed in PR142; redundant PR139 is superseded. | [#142](https://github.com/alexanderwanyoike/showbiz/pull/142) |
| 48 / #104 | Repeated test error narrowing | **Fixed:** Provider fixture cleanup removes the redundant instanceof ternary and asserts message properties directly without unsafe narrowing; final provider suite129tests/types pass. | [#148](https://github.com/alexanderwanyoike/showbiz/pull/148) `50f2da2` |

### Source PR #105

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 49 / #105 | Transient polling loses paid job | **Fixed:** Bounded polling retries and job identity in failures; no duplicate generation POST. | [#148](https://github.com/alexanderwanyoike/showbiz/pull/148) `50f2da2` |
| 50 / #105 | Submission receipt not retained | **Fixed:** Initial submission receipt preserves known charges, including0, through missing later usage. | [#148](https://github.com/alexanderwanyoike/showbiz/pull/148) `50f2da2` |
| 51 / #105 | Observer initially test-only | **Resolved later:** Production runAccountedGeneration supplies observer from integrated107/111. | No new code required |
| 52 / #105 | Duplicate OpenRouter usage schema | **Fixed:** Shared usage contract across OpenRouter images/video/receipts/native billing. | [#148](https://github.com/alexanderwanyoike/showbiz/pull/148) `50f2da2` |
| 53 / #105 | Model-controls formatting | **Resolved later:** Later native UI polish normalized ShotModelControls formatting, root verifies integratedsource. | No new code required |
| 54 / #105 | Direct Gemini provider label | **Resolved later:** modelProviderName falls back from apiKeyProvider to the catalog name in all current model pickers. Gemini therefore has its proper provider label without redundant config data. | [#110](https://github.com/alexanderwanyoike/showbiz/pull/110) `4d26ecc` |
| 55 / #105 | OpenRouter 4K spelling | **Qualified:** The unauthenticated OpenRouter catalog returned HTTP 200 and advertised Veo 3.1 resolutions 720p, 1080p and 4K. Its uppercase spelling is correct. | No new code required |

### Source PR #106

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 56 / #106 | Local inference HTTP deadline | **Fixed:** Scoped one-hour local inference deadline, binary URL downloads with base64 compatibility, preserved diagnostics/request IDs, same-origin auth, root URL validation, shared typed credential policy and no unadvertised end-frame forwarding. | [#147](https://github.com/alexanderwanyoike/showbiz/pull/147) `346bfa1` |
| 57 / #106 | Prompt-only local frame retakes blocked | **Fixed:** Capabilities and cost follow actual reference IDs rather than presence of an existing output picture. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 58 / #106 | Local connection/provider errors flattened | **Fixed:** Scoped one-hour local inference deadline, binary URL downloads with base64 compatibility, preserved diagnostics/request IDs, same-origin auth, root URL validation, shared typed credential policy and no unadvertised end-frame forwarding. | [#147](https://github.com/alexanderwanyoike/showbiz/pull/147) `346bfa1` |
| 59 / #106 | Large local video base64 decoding | **Fixed:** Scoped one-hour local inference deadline, binary URL downloads with base64 compatibility, preserved diagnostics/request IDs, same-origin auth, root URL validation, shared typed credential policy and no unadvertised end-frame forwarding. | [#147](https://github.com/alexanderwanyoike/showbiz/pull/147) `346bfa1` |
| 60 / #106 | Repeated API-key policy | **Fixed:** Scoped one-hour local inference deadline, binary URL downloads with base64 compatibility, preserved diagnostics/request IDs, same-origin auth, root URL validation, shared typed credential policy and no unadvertised end-frame forwarding. | [#147](https://github.com/alexanderwanyoike/showbiz/pull/147) `346bfa1` |
| 61 / #106 | Local base path duplicates v1 | **Fixed:** Scoped one-hour local inference deadline, binary URL downloads with base64 compatibility, preserved diagnostics/request IDs, same-origin auth, root URL validation, shared typed credential policy and no unadvertised end-frame forwarding. | [#147](https://github.com/alexanderwanyoike/showbiz/pull/147) `346bfa1` |
| 62 / #106 | Unreachable local end-frame payload | **Fixed:** Scoped one-hour local inference deadline, binary URL downloads with base64 compatibility, preserved diagnostics/request IDs, same-origin auth, root URL validation, shared typed credential policy and no unadvertised end-frame forwarding. | [#147](https://github.com/alexanderwanyoike/showbiz/pull/147) `346bfa1` |
| 63 / #106 | Keyless local status claims | **Resolved later:** PR111 labels credentials Key saved rather than claiming a connection. | [#111](https://github.com/alexanderwanyoike/showbiz/pull/111) `352d221` |

### Source PR #107

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 64 / #107 | Manual rate replaces other facets | **Fixed:** Custom rates resolve per matching facet with provider provenance on fallback. Exact scoped removal preserves other overrides and identifies generic shared rates. | [#150](https://github.com/alexanderwanyoike/showbiz/pull/150) `653f860` |
| 65 / #107 | Reset removes unrelated manual rates | **Fixed:** Custom rates resolve per matching facet with provider provenance on fallback. Exact scoped removal preserves other overrides and identifies generic shared rates. | [#150](https://github.com/alexanderwanyoike/showbiz/pull/150) `653f860` |
| 66 / #107 | Accounting errors discard output | **Fixed:** Receipt and finish-storage failures preserve successful media with typed, scoped warnings. Initial ledger creation still precedes generation. | [#123](https://github.com/alexanderwanyoike/showbiz/pull/123) `6127161` |
| 67 / #107 | Manual/published dates appear stale | **Fixed:** Manual/published dates remain explicit provenance; automatic stale-API warnings now apply only to provider caches. | [#151](https://github.com/alexanderwanyoike/showbiz/pull/151) `58ff607` |
| 68 / #107 | Image-token pricing constant unexplained | **Fixed:** The comment cites Google's pricing: a default 1K image uses 1,120 output tokens; other sizes differ. | [#148](https://github.com/alexanderwanyoike/showbiz/pull/148) `50f2da2` |
| 69 / #107 | Local provider inferred twice | **Fixed:** Local estimate copy derives from model provider rather than ID prefix. | [#148](https://github.com/alexanderwanyoike/showbiz/pull/148) `50f2da2` |
| 70 / #107 | Usage/Bible formatting omissions | **Fixed:** Generation usage and the changed Bible JSX were formatted in their owning fixes. | [#124](https://github.com/alexanderwanyoike/showbiz/pull/124); [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) |
| 71 / #107 | Failed frame leaves incomplete entry | **Fixed:** UI agent documents intentional incomplete asset/retry lifecycle in PR and Bible details docs. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |

### Source PR #108

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 72 / #108 | Catalog depends on process cwd | **Fixed:** Single explicit runtime catalog uses shared renderer/native validators and rejects unavailable/wrong-kind overrides; 187 focused tests/types pass; combined builds passed root | [#125](https://github.com/alexanderwanyoike/showbiz/pull/125) `fe9e2c2` |
| 73 / #108 | Catalog parse errors lose cause | **Fixed:** Single explicit runtime catalog uses shared renderer/native validators and rejects unavailable/wrong-kind overrides; 187 focused tests/types pass; combined builds passed root | [#125](https://github.com/alexanderwanyoike/showbiz/pull/125) `fe9e2c2` |
| 74 / #108 | Renderer/native catalog schema drift | **Fixed:** Single explicit runtime catalog uses shared renderer/native validators and rejects unavailable/wrong-kind overrides; 187 focused tests/types pass; combined builds passed root; scalar follow-up78 tests/types pass, final integrated build passed | [#125](https://github.com/alexanderwanyoike/showbiz/pull/125) `fe9e2c2` |

### Source PR #109

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 75 / #109 | Orphan settings drafts block board | **Fixed:** Agent reload removes drafts for missing shots or changed effective models; rejected generation reports an actionable error. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 76 / #109 | Stop Waiting loses prior/late take | **Fixed:** Stopping local waiting preserves prior status/media without changing native provider state; late completion reloads actual shot and takes. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 77 / #109 | Dead storyboard renderer wrappers | **Fixed:** Unused renderer wrappers removed; native/MCP commands remain intact. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 78 / #109 | End-frame pricing contract | **Resolved later:** has_end_frame is declared and consumed by provider pricing. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 79 / #109 | Global settings save blocks other shots | **Fixed:** Each shot has an independent pending request token and saving state; agent model/deletion invalidates late saves. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 80 / #109 | Load/save default fallback differs | **Fixed:** Load and save share enabled-model fallback resolution. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 81 / #109 | Historical test ordering/layout labels | **Qualified:** Historical commit phase/label/atomicity criticism cannot be corrected without prohibited history rewriting. Current repair commits keep RED, GREEN, refactoring, formatting and documentation separate; no amend or force push. | No new code required |
| 82 / #109 | Per-model settings persistence claim | **Fixed:** Docs explicitly describe the intentional single model-tagged slot, replacement on save, and defaults when model identity differs. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |

### Source PR #110

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 83 / #110 | Deleted selected location view retained | **Fixed:** Deleted selected location view falls back to a surviving primary while retaining location and prompt. Saved recipes also resolve surviving location pictures for Retake/cost/capability consistency. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 84 / #110 | Corrected retry creates duplicate entry | **Fixed:** Failed current drafts retain asset identity across name/prompt/recipe corrections; Clear ends retry identity. Remount has no retained local draft and incomplete library entry remains recoverable through Variation/Upload without text-matching new drafts. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 85 / #110 | Controlled/local Bible model ownership | **Fixed:** Preserved intentional standalone and document-controlled APIs; both use a shared Bible default. Existing model-session/local tests cover these production modes. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 86 / #110 | Repository screenshot storage cost | **Qualified:** Existing committed screenshots satisfy required accessible PR evidence; root chooses future artifact storage. | No new code required |
| 87 / #110 | Deletion text changes during exit | **Fixed:** Deletion target remains stable while Radix exit animation completes; regression observes real closed-state dialog DOM. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 88 / #110 | Draft action names/controls targets | **Fixed:** Action accessible names identify asset and retained draft; aria-controls targets exist while collapsed. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 89 / #110 | Verbose take thumbnail captions | **Resolved later:** Current take labels use compact Take N captions separately from accessible target names. | No new code required |

### Source PR #111

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 90 / #111 | Billing reconciliation blocks completion | **Fixed:** Background charge reconciliation does not block successful generated media; ordinary pending receipts are not failures. | [#126](https://github.com/alexanderwanyoike/showbiz/pull/126) |
| 91 / #111 | Failed live price loses usable cache | **Fixed:** Matching same-account cache fallback, endpoint-specific native keys, atomic account check, live/cached/refresh-unavailable labels. | [#151](https://github.com/alexanderwanyoike/showbiz/pull/151) `58ff607` |
| 92 / #111 | Unconfirmed reconciliation request storm | **Fixed:** The ledger loads from local storage before asynchronous provider reconciliation, with cooldown and credential-change retry behavior. | [#126](https://github.com/alexanderwanyoike/showbiz/pull/126) |
| 93 / #111 | Zero FAL estimate interpreted as free | **Qualified:** Official FAL docs do not define zero as no-history. Retain the provider zero as an estimate and explicitly warn it does not establish free future requests. | [#151](https://github.com/alexanderwanyoike/showbiz/pull/151) `58ff607` |
| 94 / #111 | FAL billable-unit assumptions | **Qualified:** Official unit_price method requires expected billable units. Token/megapixel/model-specific quantities and resolution/audio scaling are not established by unit label alone. Keep live unit metadata plus explicitly unadjusted historical per-call estimate; do not invent duration-specific rates. | [#151](https://github.com/alexanderwanyoike/showbiz/pull/151) `58ff607` |
| 95 / #111 | FAL endpoint cache collision | **Fixed:** Matching same-account cache fallback, endpoint-specific native keys, atomic account check, live/cached/refresh-unavailable labels. | [#151](https://github.com/alexanderwanyoike/showbiz/pull/151) `58ff607` |
| 96 / #111 | Document credential fallback | **Fixed:** MCP125 requires device reader and removes project credential fallback. | [#125](https://github.com/alexanderwanyoike/showbiz/pull/125) `fe9e2c2` |
| 97 / #111 | Reconciliation reported count race | **Fixed:** Billing reported counts use actual SQLite changes rather than attempted updates. | [#126](https://github.com/alexanderwanyoike/showbiz/pull/126) |
| 98 / #111 | Fresh provider price labelled cached | **Fixed:** Matching same-account cache fallback, endpoint-specific native keys, atomic account check, live/cached/refresh-unavailable labels. | [#151](https://github.com/alexanderwanyoike/showbiz/pull/151) `58ff607` |
| 99 / #111 | Historical provenance/dialog commit | **Qualified:** Historical grouping cannot be rewritten without forbidden amend/rebase; new work is focused atomic commits/PRs. | No new code required |

### Source PR #112

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 100 / #112 | Disabled command reason unreachable | **Fixed:** Focusable aria-disabled wrapper exposes real hover/keyboard tooltip while inner native command stays disabled;14 focused tests/types pass; final disclosure/delete constraints also verified; actual keyboard focus/visible tooltip screenshot embedded, precise controlled renderer QA/native fixture limits stated | [#142](https://github.com/alexanderwanyoike/showbiz/pull/142) `e136a72` |
| 101 / #112 | Asset model selector inaccessible | **Resolved later:** Current asset detail contains the effective generation model control. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 102 / #112 | Generation status disappears in library | **Fixed:** Both initial creation and picture-action requests show progress on the owning library card. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 103 / #112 | Unknown model label empty | **Resolved later:** Current metadata falls back to actual model ID or Not recorded. | No new code required |
| 104 / #112 | Duplicate ResizeObserver fixtures | **Fixed:** Duplicate ResizeObserver fixture stubs were removed from the maintained storyboard and Bible tests. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131); [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) |
| 105 / #112 | Historical broad UI commit | **Qualified:** Historical commit phase/label/atomicity criticism cannot be corrected without prohibited history rewriting. Current repair commits keep RED, GREEN, refactoring, formatting and documentation separate; no amend or force push. | No new code required |
| 106 / #112 | Disclosure exposes pressed and expanded | **Fixed:** Shot controls now exposes expanded+controls only; selected filmstrip shots retain legitimate pressed semantics; actual keyboard focus/visible tooltip screenshot embedded, precise controlled renderer QA/native fixture limits stated | [#142](https://github.com/alexanderwanyoike/showbiz/pull/142) `e136a72` |
| 107 / #112 | Draft dot absent from action name | **Fixed:** One library opener includes retained unsaved draft in its accessible name and receives focus on return. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 108 / #112 | Bible action JSX indentation | **Fixed:** Removed old duplicate popup/action markup; formatted the changed Bible workspace and dedicated asset-detail source without unrelated whole-application formatting. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 109 / #112 | Living UX test counts stale | **Fixed:** Living UX guides describe behavior; validation evidence stays with the PR. Concise pattern references follow user-supplied workspace instructions, not an attribution rule in repository AGENTS.md. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) |

### Source PR #113

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 110 / #113 | Discard races in-flight creation | **Fixed:** Discard invalidates pending creation callback, refreshes persisted result without navigating; stable local-draft useSyncExternalStore primitive retains native echo distinction; 19 tests/types pass; rendered Discard navigation verified once and screenshot embedded; controlled 15-second delayed successful native creation recovered without late navigation, persisted board reachable, screenshot embedded | [#141](https://github.com/alexanderwanyoike/showbiz/pull/141) `9ccf8f5` |
| 111 / #113 | Saved-generating deletion unexplained | **Fixed:** Saved generating status now explains disabled Delete just like local pending requests; actual keyboard focus/visible tooltip screenshot embedded, precise controlled renderer QA/native fixture limits stated | [#142](https://github.com/alexanderwanyoike/showbiz/pull/142) `e136a72` |
| 112 / #113 | Draft snapshot subscription can tear | **Fixed:** Discard invalidates pending creation callback, refreshes persisted result without navigating; stable local-draft useSyncExternalStore primitive retains native echo distinction; 19 tests/types pass; rendered Discard navigation verified once and screenshot embedded; controlled 15-second delayed successful native creation recovered without late navigation, persisted board reachable, screenshot embedded | [#141](https://github.com/alexanderwanyoike/showbiz/pull/141) `9ccf8f5` |
| 113 / #113 | Usage pagination defensive state | **Qualified:** Both owners confirm project-scoped pagination intentionally defends reusable route-param-driven UsagePage and stale async responses even though normal native file identity also remounts.126 tests cover pagination and retained same-scope ledger. | [#126](https://github.com/alexanderwanyoike/showbiz/pull/126) `e81c428` |
| 114 / #113 | History visibility leaks between shots | **Fixed:** Each shot retains disclosure state independently and newly received takes reveal their history. | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02` |
| 115 / #113 | Disabled frame-edit reason inaccessible | **Fixed:** UI131 supplies frameSaving/modelSaving reasons. Focusable aria-disabled wrapper exposes real hover/keyboard tooltip while inner native command stays disabled;14 focused tests/types pass; final disclosure/delete constraints also verified; actual keyboard focus/visible tooltip screenshot embedded, precise controlled renderer QA/native fixture limits stated | [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) `53bec02`; [#142](https://github.com/alexanderwanyoike/showbiz/pull/142) `e136a72` |

### Source PR #114

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 116 / #114 | Destroyed webContents read on close | **Resolved later:** PR118 captures the immutable webContents ID before BrowserWindow destruction; no duplicate fix required | [#118](https://github.com/alexanderwanyoike/showbiz/pull/118) `785e1b4` |
| 117 / #114 | Abandoned Alt gesture activates File | **Fixed:** Shared native shortcuts and mac destinations, editor focus, abandoned Alt reset, guarded File feedback, overlay geometry and navigator disclosure; 42 tests/types pass; actual rendered guarded File workflow verified and screenshot embedded, OS-specific manual limits stated | [#140](https://github.com/alexanderwanyoike/showbiz/pull/140) `8051930` |
| 118 / #114 | Guarded File entries give no reason | **Fixed:** Shared native shortcuts and mac destinations, editor focus, abandoned Alt reset, guarded File feedback, overlay geometry and navigator disclosure; 42 tests/types pass; actual rendered guarded File workflow verified and screenshot embedded, OS-specific manual limits stated | [#140](https://github.com/alexanderwanyoike/showbiz/pull/140) `8051930` |
| 119 / #114 | Duplicate macOS application menus | **Fixed:** Shared native shortcuts and mac destinations, editor focus, abandoned Alt reset, guarded File feedback, overlay geometry and navigator disclosure; 42 tests/types pass; actual rendered guarded File workflow verified and screenshot embedded, OS-specific manual limits stated | [#140](https://github.com/alexanderwanyoike/showbiz/pull/140) `8051930` |
| 120 / #114 | Shortcut definitions drift | **Fixed:** Shared native shortcuts and mac destinations, editor focus, abandoned Alt reset, guarded File feedback, overlay geometry and navigator disclosure; 42 tests/types pass; actual rendered guarded File workflow verified and screenshot embedded, OS-specific manual limits stated | [#140](https://github.com/alexanderwanyoike/showbiz/pull/140) `8051930` |
| 121 / #114 | View command loses editor focus | **Fixed:** Shared native shortcuts and mac destinations, editor focus, abandoned Alt reset, guarded File feedback, overlay geometry and navigator disclosure; 42 tests/types pass; actual rendered guarded File workflow verified and screenshot embedded, OS-specific manual limits stated | [#140](https://github.com/alexanderwanyoike/showbiz/pull/140) `8051930` |
| 122 / #114 | Fullscreen retains caption space | **Fixed:** Shared native shortcuts and mac destinations, editor focus, abandoned Alt reset, guarded File feedback, overlay geometry and navigator disclosure; 42 tests/types pass; actual rendered guarded File workflow verified and screenshot embedded, OS-specific manual limits stated | [#140](https://github.com/alexanderwanyoike/showbiz/pull/140) `8051930` |
| 123 / #114 | Historical style/merge labelling | **Qualified:** Historical style/merge labels remain immutable; current tests, implementation, refactoring and formatting are separate focused commits. Normal merge commits are permitted Git flow, not a data loss bug | No new code required |

### Source PR #115

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 124 / #115 | Linked Bible tab keeps wrong detail | **Fixed:** Linked tab changes clear incompatible selected asset state. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 125 / #115 | Read-only take preview blocked | **Fixed:** Readonly enlarged take previews remain available while mutation controls wait for generation. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 126 / #115 | Duplicate Bible card openers | **Fixed:** One library opener includes retained unsaved draft in its accessible name and receives focus on return. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 127 / #115 | Deletion focus uses text selectors | **Fixed:** Deletion focus restoration uses stable picture/back/new refs rather than label selectors. Existing take-delete/focus journeys pass. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |
| 128 / #115 | Bible verification history in guide | **Fixed:** The Bible asset guide describes the current workflow and omits obsolete test counts and verification narration. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) |
| 129 / #115 | Historical Bible style commits | **Qualified:** Historical commit phase/label/atomicity criticism cannot be corrected without prohibited history rewriting. Current repair commits keep RED, GREEN, refactoring, formatting and documentation separate; no amend or force push. | No new code required |
| 130 / #115 | Draft-dot label never announced | **Fixed:** One library opener includes retained unsaved draft in its accessible name and receives focus on return. | [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) `9ae75fb` |

### Source PR #116

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 131 / #116 | Cross-platform byte-exact icon gate | **Fixed:** Exact committed bytes checked only Linux CI; conversion causes retained; seven tests/Linux iconcheck pass; Linux packaging and installed artifact validation passed | [#130](https://github.com/alexanderwanyoike/showbiz/pull/130) `ba214b6` |
| 132 / #116 | Icon pipeline drops failure cause | **Fixed:** Exact committed bytes checked only Linux CI; conversion causes retained; seven tests/Linux iconcheck pass; Linux packaging and installed artifact validation passed | [#130](https://github.com/alexanderwanyoike/showbiz/pull/130) `ba214b6` |
| 133 / #116 | Potential duplicate AppMark IDs | **Qualified:** rg confirms only one AppMark, in Header; no current duplicate SVG definition instance. Normal Git merge cannot erase already merged ancestor commits. No hypothetical abstraction added. | [#130](https://github.com/alexanderwanyoike/showbiz/pull/130) `ba214b6` |
| 134 / #116 | Historical formatting-only spot check | **Qualified:** Reviewer explicitly confirmed the original large style commit is formatting only. No current behavior to repair; current formatting is confined to owned files | No new code required |

### Source PR #117

| Row / source | Finding | Disposition and resolution | Delivery evidence |
| --- | --- | --- | --- |
| 135 / #117 | Windows caption verification limitation | **Qualified:** Historical combined commit cannot be rewritten. Current caption geometry/focus/fullscreen changes are tested in the desktop-menu slice; actual Windows caption-button interaction remains a stated platform verification limit, not falsely claimed as manually exercised. | `6f39c3c` |

### Source PR #118

No additional actionable finding was recorded. The close fix already present in #118 is accounted for in source PR #114, row 116.

## Focused follow-up merge dependencies

All feature PRs target `dev`. No feature PR was merged into `dev` or `main` as part of this accounting. Follow the dependencies below rather than numerical order; the original baseline stack must land first. Frozen branch heads below identify completed code when a PR number is not yet published.

| Follow-up | Frozen head | Prerequisites | Focus |
| --- | --- | --- | --- |
| [#119](https://github.com/alexanderwanyoike/showbiz/pull/119) | `4886ea8` | #118 | Exclude deleted and unreferenced media from project packages |
| [#120](https://github.com/alexanderwanyoike/showbiz/pull/120) | `ff6dd59` | #118 | Fix MCP exports and bounded request handling |
| [#121](https://github.com/alexanderwanyoike/showbiz/pull/121) | `06d62a3` | #120 | Fix saved-data revision tracking and renderer IPC boundaries |
| [#122](https://github.com/alexanderwanyoike/showbiz/pull/122) | `088cb34` | #119 | fix: replace project packages safely after Save dialog confirmation |
| [#123](https://github.com/alexanderwanyoike/showbiz/pull/123) | `6127161` | #118 | Preserve generated media when accounting storage fails |
| [#124](https://github.com/alexanderwanyoike/showbiz/pull/124) | `ae4f389` | #122 | fix: recover abandoned usage only on validated project open |
| [#125](https://github.com/alexanderwanyoike/showbiz/pull/125) | `fe9e2c2` | #121 | Unify installed model validation and explicit application dependencies |
| [#126](https://github.com/alexanderwanyoike/showbiz/pull/126) | `e81c428` | #123 | Refresh provider charges without blocking media or the ledger |
| [#127](https://github.com/alexanderwanyoike/showbiz/pull/127) | `caff7c3` | #124 | fix: use one canonical identity for project file paths |
| [#128](https://github.com/alexanderwanyoike/showbiz/pull/128) | `537c947` | #125 | Authenticate MCP instance discovery and clean stale descriptors |
| [#129](https://github.com/alexanderwanyoike/showbiz/pull/129) | `6009aea` | #127 | fix: recover abandoned project locks and media caches safely |
| [#130](https://github.com/alexanderwanyoike/showbiz/pull/130) | `ba214b6` | #128 | Keep icon validation portable and retain source error context |
| [#131](https://github.com/alexanderwanyoike/showbiz/pull/131) | `53bec02` | #118 | Fix storyboard request and draft state ownership |
| [#132](https://github.com/alexanderwanyoike/showbiz/pull/132) | `77c831c` | #129 and #121 | fix: inspect read-only projects and save editable copies |
| [#133](https://github.com/alexanderwanyoike/showbiz/pull/133) | `13c370d` | #128 and #124 | Expose subject-scoped MCP usage and cost totals |
| [#134](https://github.com/alexanderwanyoike/showbiz/pull/134) | `475678e` | #133 | Identify failing media in package export and legacy conversion |
| [#135](https://github.com/alexanderwanyoike/showbiz/pull/135) | `8ae9922` | #136 and the reviewed implementation stack | docs: replace obsolete NLE guidance with current project architecture |
| [#136](https://github.com/alexanderwanyoike/showbiz/pull/136) | `a61d234` | #132 and #140 desktop-menu fixes | fix: open OS-associated projects through the document workflow |
| [#137](https://github.com/alexanderwanyoike/showbiz/pull/137) | `66f81c3` | #118 | Bundle Manrope correctly in production builds |
| [#138](https://github.com/alexanderwanyoike/showbiz/pull/138) | `3388d54` | #132 | Keep Recent Projects consistent after a saved rename |
| [#139](https://github.com/alexanderwanyoike/showbiz/pull/139) | `3c5fc0f` | #142 (including #131); combined baseline `288a799` | Remove whitespace from maintained desktop test fixtures |
| [#140](https://github.com/alexanderwanyoike/showbiz/pull/140) | `8051930` | #128 | Align desktop menu focus shortcuts and native caption geometry |
| [#141](https://github.com/alexanderwanyoike/showbiz/pull/141) | `9ccf8f5` | #140 | Preserve navigation intent when storyboard creation is discarded |
| [#142](https://github.com/alexanderwanyoike/showbiz/pull/142) | `e136a72` | #140 and #131 | Keep unavailable workspace commands understandable by keyboard |
| [#143](https://github.com/alexanderwanyoike/showbiz/pull/143) | `9ae75fb` | #131 | Keep Bible picture drafts and reference workflows consistent |
| [#144](https://github.com/alexanderwanyoike/showbiz/pull/144) | `fbd5086` | #130 and #147 | Retain third-party notices for Electron runtime bundles |
| [#145](https://github.com/alexanderwanyoike/showbiz/pull/145) | `edf969a` | #136 | fix: retain final save errors and complete project disposal safely |
| [#146](https://github.com/alexanderwanyoike/showbiz/pull/146) | `69800ea` | #133 and #148 | Keep generation quote provenance consistent with its frozen price basis |
| [#147](https://github.com/alexanderwanyoike/showbiz/pull/147) | `346bfa1` | #151 | Keep long local inference requests usable and preserve server diagnostics |
| [#148](https://github.com/alexanderwanyoike/showbiz/pull/148) | `50f2da2` | #147 and #144 | Recover existing provider jobs and preserve actionable errors and receipts |
| [#149](https://github.com/alexanderwanyoike/showbiz/pull/149) | `988467b` | #146 | Explain unsuccessful requests in unconfirmed generation estimates |
| [#150](https://github.com/alexanderwanyoike/showbiz/pull/150) | `653f860` | #126 | Keep custom model rates scoped to their matching generation settings |
| [#151](https://github.com/alexanderwanyoike/showbiz/pull/151) | `58ff607` | #150 | Retain matching provider price caches with honest endpoint and source provenance |

Billing owner's intended chain is #118 -> #123 -> #126 -> #150 -> #151 -> #147 -> #148 -> #146 -> #149. Runtime notice PR #144 follows #147 and is included before #148. All delivery PR identifiers are recorded.

## Additional integration fixes

- Production font loading was a demonstrated build defect found during final verification, outside the original 136 findings. [#137](https://github.com/alexanderwanyoike/showbiz/pull/137) moves the existing Fontsource import into Vite's entry-point asset graph, retains OFL notices, and verifies actual production font URLs/assets.
- [#142](https://github.com/alexanderwanyoike/showbiz/pull/142) at `e136a72` integrates #131's model-saving guard with the disabled-command wrapper: one prerequisite tooltip, model-saving priority, both inspector regression groups retained, and semantic/native-disabled/no-action assertions. Its 43 impacted tests and strict types pass; the subsequent combined suite passes all 1,421 tests.


## Additional verification fixes and limits

- [#137](https://github.com/alexanderwanyoike/showbiz/pull/137) repairs production-only Manrope asset URLs using the standard Vite entry-point CSS import. Actual rendered controls and emitted font responses were inspected; the OFL notice is included.
- [#144](https://github.com/alexanderwanyoike/showbiz/pull/144) collects notices from the actual main/preload/MCP bundle inputs. The installed package contains Undici's full MIT text. The existing lazy-val release supplies only MIT/author/repository metadata; the notice preserves those facts explicitly.
- The integrated title/disabled-control compatibility fix in #142 preserves both independent regression suites and the correct model-saving priority.
- The existing preview project and device settings were preserved while updating its renderer and native command transport. Its ledger has no generation records or fabricated QA charges. Controlled error, custom-rate and delayed-response fixtures stayed in a separate verification profile.
- A real anonymous OpenRouter price read was displayed as live, then reused as cached with its original URL and retrieval time. It generated no media. Native filesystem/SQLite tests and isolated failure fixtures cover the other provider/accounting branches.
- Native macOS/Windows interaction, paid cloud generation/actual monetary receipt smoke tests, and inference on a real local model were not exercised on this Linux host. Do not treat fixture coverage as paid-provider or hardware validation.
- Every implementation PR remains open against dev. No PR was merged and no protected-branch history was changed.
