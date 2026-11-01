# Project documents

Showbiz opens one `.showbiz` project document at a time. Start with New Project, Open Project or a recent file. New Project opens the native save dialog before entering the workspace. The sidebar contains the open project's bible and storyboards. Close Project returns to the start window.

A project is one self-contained SQLite application document with a Showbiz application ID. The `.showbiz` file holds both project records and embedded images, videos and takes. Copy or back up that one file. There is no companion media folder.

Use Save As to create an independent copy and switch to it. Save As uses SQLite's consistent snapshot operation and safely replaces a closed existing destination after the save dialog confirmation. A temporary package is validated before publication; failed activation restores the previous destination. Renaming the project inside Showbiz changes its display name; Save As chooses another filename.

Completed edits and their media save together in SQLite transactions. Large media is stored in bounded 8 MiB chunks. Only changed media is rewritten. Playback uses extracted files in a private application cache, recreated from the document when opened and removed on close. That cache is disposable and is never needed to move the project. Ownership metadata lives outside the extracted media subtree, so restoration cannot remove it. Startup removes caches owned by confirmed dead process incarnations and retains live, unmarked legacy or unverifiable owners. Save flushes any pending cache changes into the document. Failed saves roll back the records and recover the last saved media.

Unfinished forms must be applied or cancelled before closing or switching documents. Generation, exports and pending saves also block a switch. Failed opens, cancelled dialogs and failed copies keep the current document available. A lock prevents two Showbiz instances from editing the same file. Locks record a process-start identity and ownership token. Confirmed dead owners are recovered; live or unverifiable owners are retained, with the exact lock path shown in the error.

Current-schema projects in read-only locations can be inspected and exported. Mutations require Save As to an editable copy; the navigator labels that mode. Older read-only schemas must first be copied to a writable location for migration.

API keys stay in application settings. Appearance stays on the device. Recent projects are file shortcuts, not a second project library. If recent history is damaged, the start window reports it and Open Project remains available.

## Existing projects

The start window's conversion section lists projects from the previous application library. Choose one and save a new `.showbiz` file. Conversion retains the selected project's bible, storyboards, shots, takes and referenced media. The old library stays untouched. Other projects and application credentials are removed from the new document, including deleted database page contents. Missing or unsafe media references fail conversion without publishing a partial project.

`.showbiz` is the editable project document. `.sbz` remains the separate media-only storyboard handoff to Forgecut.

## Implementation pattern

This uses [SQLite's documented application-file pattern](https://www.sqlite.org/appfileformat.html), its [application ID](https://www.sqlite.org/fileformat.html#application_id), and [VACUUM INTO snapshots](https://www.sqlite.org/lang_vacuum.html). Embedded media follows the [SQLite Archive pattern](https://www.sqlite.org/sqlar.html) with custom chunk tables for bounded memory use. This is a Showbiz application format, not SQLAR-compatible storage. The integrated File menu uses the same guarded document controller in desktop and browser views. Windows and Linux use an integrated menu with shared platform accelerators; macOS retains its native application menu without duplicating it in the renderer. Existing SQLite and Electron licences remain applicable; no additional storage library is introduced.

## Storyboard workspace

Shot review uses a full-width preview with a horizontal shot strip below. One project navigator can be shown or hidden from the titlebar in any project workspace; it provides Storyboards, Bible and Usage & billing. Shot controls open on demand. They sit beside the canvas in a wide window and overlay it in a narrow window. Export has one entry point with ZIP and Forgecut SBZ choices.

This layout is informed by [Storyboarder's canvas and board strip](https://wonderunit.com/storyboarder/), [Krita's storyboard docker](https://docs.krita.org/en/reference_manual/dockers/storyboard_docker.html), and [GNOME's utility-pane guidance](https://developer.gnome.org/hig/patterns/containers/utility-panes.html). These are interaction references; no reference application code or artwork was copied. Muzo and Auto Digger inform the restrained materials, compact controls and appearance preferences rather than the pane arrangement.

## Storage limits

Saving queries record-referenced media paths, checks file stamps and synchronously embeds changed chunks on the main thread. It no longer recursively scans unrelated cache files, but a large project or changed video can still delay the UI. Chunking bounds each allocation; it does not make the whole save asynchronous. Rollback can also re-extract saved media. Profile this before moving SQLite/media work to a worker rather than assuming small-fixture timings describe large projects.

Cache cleanup is conservative. Legacy workspaces without ownership metadata cannot be proven abandoned automatically. A failed OS ownership probe retains a lock/cache rather than risking active work. A cache is never required to back up or share a valid self-contained project.

## Lock reclamation

Abandoned-lock replacement is serialized with an adjacent `.showbiz.lock.guard` directory, using atomic `mkdir` acquisition as in [proper-lockfile](https://github.com/moxystudio/node-proper-lockfile) (MIT; design reference only, no copied source). Competing opens fail with the guard path instead of deleting another process's fresh lock. The guard normally exists only during acquisition. If the process crashes during that short operation, close every Showbiz instance before manually removing the named guard. Unverifiable ownership is never reclaimed automatically.

The document database closes before its ownership lock is released, so another writer cannot enter while the previous connection is still open. Ownership tokens are checked on release. This process's platform start identity is read once and reused; other processes are still verified independently. A malformed cache owner marker is reported with its path while cleanup continues for other caches.
