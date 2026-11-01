# Bible asset details

Characters, locations and frames each have one library opener for their dedicated detail workspace. Its accessible name identifies retained unsaved picture drafts. The previous editor popover is removed.

The workspace contains the current image, take history, recorded prompt/model/source and existing generation actions. Creation controls are hidden while inspecting an entry; their independent drafts remain available on return. Large previews, take controls and price queries render only for the active entry.

Take selection uses stable creation order instead of the backend's primary-first return order. Selecting a picture keeps its number and keyboard focus. Take preview and delete controls are separate 28px buttons. Read-only previews remain available while a new picture is generating; the owning library entry shows progress. Mutation controls are disabled while saving; failed mutations preserve the saved selection. Cancelled deletion and inline editing return focus to their opener. Deleting the current take retains a reachable focus target.

The next-generation estimate is grouped with the model and generation actions. It does not imply a confirmed charge for an existing picture. Provider pricing, billing reconciliation, storage schemas and native commands are unchanged.

A failed first picture retains its creation entry while the current draft is corrected, including name and frame-reference changes. Clear draft ends that retry identity. View changes and background refreshes retain drafts; a deliberate route discard or component remount ends the local draft. Its already-created incomplete entry remains in the library and can be resumed with Variation or Upload, without matching a new draft to an old entry by name.

Location references use surviving pictures. If a selected view is deleted, the current recipe and saved-frame retakes fall back to the location's current primary picture. A frame with no reference pictures uses text generation, including on local models; its estimate and capability checks use that same input mode.

The Bible supports a document-controlled generation model and an intentionally tested standalone local mode. Both share one Bible default; this control affects future Bible operations rather than storyboard defaults or existing takes.

## Patterns

This follows the existing Showbiz shot workspace's main preview, take browser and scoped controls. It uses the established Bible draft/controller ownership and existing Radix dialogs for focused preview and deletion confirmation. The separate take buttons follow native command composition rather than nesting interactive controls inside the selection button. Surface and control styling continues the application's Auto Digger-inspired material system; no third-party component implementation was copied.

## Verification

Maintained regressions cover linked-tab selection, independent drafts, retry identity after corrections, deliberate remount recovery, deleted location references, local model capability gates, pending-library status, read-only preview, accessible draft disclosures and deletion exit/focus. Current test/build results and rendered evidence belong in the relevant PR under Tested.

Actual-renderer verification uses a disposable self-contained project with uploaded local sample pictures: five character takes, three location takes and four takes for one frame. All three entry types open detail sections. Manual checks cover creation-draft retention, variation-draft retention across library/detail visits, native take selection/order/focus, full-image preview and Escape focus, take-delete confirmation and cancellation, frame prompt reuse, and inline variation cancellation focus.

A missing-key variation request preserves the draft, current picture and five existing takes. The real project ledger remains empty; no provider response or charge is fabricated and no paid generation is performed. Uploaded sample provenance remains labelled as uploaded, with an unrecorded model rather than an invented one.

Screenshots show native light/dark at 1280x720 and the actual renderer in a 760x640 iframe. The compact workspace scrolls from preview/takes to metadata/actions. The iframe verifies renderer layout, not operating system window resizing.

The packaged Linux desktop build is launched separately with a temporary Chromium profile; its native process and command bridge are verified. The existing desktop project is left open and unchanged. Caption-button clicks, native dragging/resizing and Windows/macOS appearance cannot be manually exercised with the available browser controls.
