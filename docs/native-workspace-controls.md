# Native workspace controls

The project file, its storyboards, individual shots and Bible entries have different owners. A setting belongs next to the object it changes. A control that creates a new generated picture says so before it submits work.

| Owner | Controls |
| --- | --- |
| Application | Provider credentials, appearance and updates |
| Open project | Project settings in the document navigator; New, Open, Save, Save As and Close in File |
| Storyboard collection | Search, new storyboard and each storyboard's action menu |
| Bible view | Section tabs and a generation model for new Bible pictures and retakes |
| Bible entry | Selected reference picture, take selection, retake, variation, picture edit and deletion |
| Draft | Explicit Generate, Clear or Cancel actions; failed requests retain their input |

Project naming is an explicit Save/Cancel dialog beside the project identity. The former pencil beside the Storyboards and Bible view titles changed the project name and was removed. Renaming a project does not rename its file; File > Save As owns the file name and location.

The Bible model is remembered while the same project file remains open. Moving between the Bible and a storyboard preserves the selection. It affects future Bible image operations; it is separate from storyboard model defaults. The selection resets when another project file opens and is not stored as a project default.

Bible sections use the established Radix tabs pattern with keyboard navigation and selected-state semantics. Character, location and frame forms remain mounted while switching sections, so their drafts stay independent. The Frames section can be linked with `?view=bible&bibleTab=frames`. Frame references are optional, and their selections count as draft work. Clear only resets the current section's draft. Failed generation preserves names, prompts, reference recipes and edit instructions. Retrying an incomplete entry uses its existing identity so failed requests do not create duplicate entries.

Picture actions identify the target entry or take. A selected reference has a pressed state. Full-picture viewing uses the existing Radix dialog pattern, including Escape and focus return. Deletions use a confirmation dialog, and a failed deletion remains open with its error for retry. Storyboard actions are visible and keyboard accessible, instead of hiding a destructive button until pointer hover.

Internal navigation uses React Router's public `createHashRouter` and `useBlocker` pattern. Hash URLs remain compatible with packaged `file://` applications. The original workspace stays mounted until the user chooses Stay or Discard and continue, including browser Back. Same-Bible section changes preserve the drafts and do not prompt. Clearing or saving a draft removes the block. Explicit discard also resets drafts owned by a project view that stays mounted while its view changes. Native project-file switching continues to use the existing application-work guards.

The layout follows Apple's toolbar ownership guidance and NN/g's recognition and disclosure principles. The changes keep the existing native materials and typography rather than adding decorative website chrome. No implementation code was copied from these references.

- [Apple toolbar guidelines](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- [NN/g recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/)
- [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- [React Router navigation blocking](https://reactrouter.com/how-to/navigation-blocking)
- [React Router hash router](https://reactrouter.com/api/data-routers/createHashRouter)
