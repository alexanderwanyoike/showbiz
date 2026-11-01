# Storyboard workflow audit

The storyboard is a planning document. Its toolbar owns storyboard-wide commands; the inspector owns the selected shot; generation uses the shot's saved inputs and settings. The canvas remains a media view.

## Scope and action review

| Area | Finding | Result |
| --- | --- | --- |
| Storyboard name and defaults | Defaults appeared inside each shot and name editing was unreachable. | One Storyboard settings dialog in the board toolbar stages the name and both defaults, with Save/Cancel and one atomic update. |
| Shot model selection | Short Default/Shot labels obscured inheritance and could imply changing existing media. | Each choice states Uses storyboard default or Shot override, always names its provider, and explains that it applies to new takes. |
| Frame editing | The image model override had no reachable edit action. | Edit frame targets the selected take; unsupported models and unversioned frames explain how to proceed. New takes preserve their source. |
| Model menu | The keyboard highlight initially selected the first list item rather than the saved model. | The active item starts at the current value, the persisted choice has an accessible current state, and accepting it causes no redundant save. |
| Video output settings | One page-level state leaked duration and other choices between shots and disappeared on reopen. | Each shot saves one settings slot tagged with model identity. Another model uses its defaults; saving those settings replaces the prior tagged slot. Failed attempts remain visible as unsaved drafts, with Retry/Discard and generation blocked. |
| Generation action | Collapsing settings hid the primary action; long input forms pushed its cost offscreen. | Input/history scroll independently. Cost and Generate remain in a bounded action footer. |
| Frame prerequisites | Generate could be enabled without a model's required frames. | The button is disabled with a specific missing-input explanation; required end-frame controls open automatically. |
| Frame source | A start frame could be added but never removed, preventing a return to text-to-video. | Remove clears the frame selection and current-take marker, preserving media and history. The estimate follows the same input mode as generation. |
| Unsupported frames | An unsupported end-frame section offered little useful action. | Unused saved frames are explicitly identified and removable; prompt-only models do not offer ineffective frame editing. |
| Empty frame library | A disabled picker told users to go elsewhere without an action. | A direct Create a frame in the Bible link opens the Frames workspace. Choosing/uploading remains visually secondary to Generate. |
| Prompt assistance | From Image and Enhance did not describe the operation or provider dependency. | Describe frame and Improve prompt name the action. Google AI (Gemini) and separate charges are explicit. |
| Stop Waiting | Stopping local observation could invite another paid request while the first still ran. | Provider work/charge implications are explicit; local waiting preserves the existing take and status, duplicate generation stays disabled until the request finishes, and late results reload the shot. |
| Shot sequence | Vertical up/down labels contradicted horizontal movement; video-only posters used mismatched identities. | Controls say earlier/later; posters track the actual video source. |
| Shot deletion | The icon immediately deleted and ignored a rejected backend result. | A destructive confirmation explains scope and preserves a failed attempt for retry. Running requests cannot be deleted. |
| Playback | The canvas play button and scrubber were unnamed, and global shortcuts reached into dialogs. | Media controls have names; dialog/menu/form/disclosure keyboard input takes precedence. |
| Inspector visibility | A canvas overlay competed with the media and duplicated its control. | One toolbar toggle opens the inspector; its close button returns focus to that toggle. |
| Take history | Image/video selection buttons lacked action/current-state names. | Use image/video take controls expose their active state and retain take history separately from future generation settings. History visibility is remembered per shot and new takes reveal their history. |
| Board summary | Total duration summed legacy planned values rather than actual generated media. | The board reports the shot count, leaving actual playback duration with the selected media. |
| Export | ZIP and SBZ are distinct destinations for the same operation. | The existing single Export menu remains scoped to the current storyboard; neither format builds an editor timeline. |

## Research and established patterns

The hierarchy follows [Apple's toolbar guidance](https://developer.apple.com/design/human-interface-guidelines/toolbars): title/navigation and content-wide commands belong in the toolbar, while selected-object details belong to an inspector. [Xcode's inspector model](https://help.apple.com/xcode/mac/current/en.lproj/dev63ccb4d06.html) is the relevant native selected-object pattern.

[NN/G's progressive disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/) informs the separation of secondary configuration from the primary Generate action. Disclosure does not change ownership: a storyboard-wide setting does not become a shot setting because it sits in an inspector collapse.

Model menus use cmdk's documented default selection API; no third-party implementation code was copied. Existing Showbiz materials, accents and component primitives are preserved.

## Validation

Behavioral tests cover staged/cancelled/failed settings saves, atomic updates, shot A/B isolation, model identity, SQLite reopen, failed draft recovery, generation prerequisites, input-mode estimates, local-waiting duplicate protection, deletion retry, frame-selection preservation, current model focus, take selection and media keyboard scope. Rendered verification and screenshots are recorded in the PR under Tested after integration.
