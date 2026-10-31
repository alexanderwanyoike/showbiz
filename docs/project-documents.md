# Project documents

Showbiz opens one `.showbiz` project document at a time. Start with New Project, Open Project or a recent file. New Project opens the native save dialog before entering the workspace. The sidebar contains the open project's bible and storyboards. Close Project returns to the start window.

A project is stored as a SQLite application document with a Showbiz application ID, alongside its media:

```text
Morning.showbiz
Morning.showbiz.media/
```

Keep the file and companion folder together when moving or backing up a project. Use Save As to create an independent copy and switch to it. Save As copies the media, uses SQLite's consistent snapshot operation and refuses to overwrite another project or its media folder. Renaming the project inside Showbiz changes its display name; Save As chooses another filename.

Completed edits save directly into the open project file through SQLite transactions. Save confirms that the current document has no pending work. Unfinished forms must be applied or cancelled before closing or switching documents. Generation, exports and pending saves also block a switch. Failed opens, cancelled dialogs and failed copies keep the current document available. A lock prevents two Showbiz instances from editing the same file. A stale lock is recovered when its owning process no longer exists.

API keys stay in application settings. Appearance stays on the device. Recent projects are file shortcuts, not a second project library. If recent history is damaged, the start window reports it and Open Project remains available.

## Existing projects

The start window's conversion section lists projects from the previous application library. Choose one and save a new `.showbiz` file. Conversion retains the selected project's bible, storyboards, shots, takes and referenced media. The old library stays untouched. Other projects and application credentials are removed from the new document, including deleted database page contents. Missing or unsafe media references fail conversion without publishing a partial project.

`.showbiz` is the editable project document. `.sbz` remains the separate media-only storyboard handoff to Forgecut.

## Implementation pattern

This uses [SQLite's documented application-file pattern](https://www.sqlite.org/appfileformat.html), its [application ID](https://www.sqlite.org/fileformat.html#application_id), and [VACUUM INTO snapshots](https://www.sqlite.org/lang_vacuum.html). The file plus companion media layout follows Forgecut's existing project/media workflow. [Electron menus](https://www.electronjs.org/docs/latest/api/menu) provide native File commands and platform accelerators; a renderer File menu supports browser verification. Existing SQLite and Electron licences remain applicable; no additional storage library is introduced.
