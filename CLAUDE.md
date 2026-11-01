# Showbiz

AI video storyboard desktop application. Users create or open one self-contained `.showbiz` project, build a reference bible, generate image and video takes, and export storyboard media for editing elsewhere. Showbiz has no NLE or movie-assembly workflow.

## Rules

1. Research before acting. Read relevant source, domain documentation, tests, provider documentation and review feedback before changing behavior.
2. Use TDD for TypeScript changes. Run the meaningful failing regression first, commit the test, implement the smallest passing change in another commit, and keep later refactoring separate.
3. Use clear names, small cohesive modules, explicit typed Results for expected failures, and existing conventions. Do not add unused abstractions, silent catches or production `any`.
4. Always use yarn.
5. Run `yarn build:frontend` and `yarn build:electron`. Packaging changes require `yarn build` too. Exercise finished workflows manually where feasible; visual PRs need actual rendered screenshots under Tested.
6. Feature branches originate from `dev`; feature PRs target `dev`. Promote `dev` to `main` through a release PR. Never merge without explicit authorization, amend commits or force-push tags.
7. Keep PRs focused and commits atomic. Do not rewrite published history to repair old commit structure.

## Product boundaries

- File workflow: New Project, Open Project, Recent, Save, Save As and Close Project. A project contains its records and referenced media. Device credentials and preferences stay outside the package.
- Bible: characters, locations and scene frames with takes, uploads, variations and edits. Each selected asset has its own detail workspace.
- Storyboard: a preview, horizontal shot strip and optional shot controls. Image/video defaults belong to storyboard settings; each shot can override them independently.
- Generation: text or frame inputs according to model capabilities. Image and video takes preserve generation history. Local inference and OpenRouter use the same model/transport boundary as other providers.
- Usage: preflight quotes, provenance and recorded outcomes. Reported charges are distinct from estimates and unknown charges; provider billing availability varies.
- Handoff: one Export menu offers ZIP or Forgecut `.sbz`. Packages contain current shot media and `storyboard.json`. Forgecut imports these as media without placing them on a timeline.
- MCP: agents attach to a running instance, read context, and edit the same project through validated native commands. Unsaved UI work blocks agent mutations. The MCP adapter does not expose credential reads or generation HTTP access.

## Architecture

React 19 and Vite render inside Electron. HashRouter supports packaged `file://` paths. The main process owns SQLite, project files, media, native HTTP requests, package export, application work and updates. The renderer owns editing state, model transport orchestration and presentation.

`electron/preload.ts` exposes `window.showbiz`. `src/lib/bridge.ts` normalizes IPC failures; `src/lib/backend-api.ts` supplies typed command wrappers. Preserve existing command names and JSON shapes when extending the bridge. API requests cross the main-process `http_request` JSON proxy, so provider integrations use JSON endpoints rather than multipart uploads.

The legacy SQLite library at `{appDataDir}/data/showbiz.db` holds device settings and projects awaiting conversion. An open `.showbiz` SQLite document holds one editable project's records, usage and embedded media. Append-only migrations live in `electron/migrations/`; legacy timeline tables remain for compatibility, not as an active editing feature. Do not edit or rename shipped migrations.

Media is embedded in bounded chunks and extracted to a disposable private workspace for playback. Only record-referenced paths are saved. The renderer reads bytes over IPC and caches `blob:` URLs through `electron-media-url.ts`; in-place overwrites must invalidate that cache. Do not replace this with `protocol.handle` streaming.

Storyboard export resolves ordered shot identities to paths in the main process and streams ZIP output through `yazl`, then renames the completed temporary package. No ffmpeg runtime or bundled ffmpeg binaries are required by Showbiz.

## Source map

```text
src/
  App.tsx, main.tsx                  Application shell and HashRouter
  pages/WorkspacePage.tsx            New/Open/Recent and legacy conversion
  pages/ProjectPage.tsx              Storyboard library and bible workspace
  pages/StoryboardPage.tsx           Shot review, settings, generation and drafts
  pages/UsagePage.tsx                Project request ledger and charge refresh
  contexts/ProjectDocumentContext.tsx
  components/ProjectNavigator.tsx    One collapsible project navigator
  components/ProjectBibleView.tsx    Bible library and creation workspace
  components/BibleAssetEntry.tsx     Selected asset details and actions
  components/Shot*.tsx               Preview, strip, controls and model overrides
  components/ApplicationMenu.tsx     Integrated desktop menu
  components/SettingsDialog.tsx      Device, provider and appearance settings
  lib/backend-api.ts, bridge.ts      Typed native command boundary
  lib/electron-media-url.ts          Blob media cache
  lib/generation-*.ts                Accounting, quotes and charge reconciliation
  lib/models/providers/             Installed image/video JSON configurations
  lib/models/transports/            Provider API adapters
  hooks/useApplicationWork.ts        Native work and local draft state

electron/
  main.ts, preload.ts                Electron assembly and bridge
  db.ts, migrations/                 SQLite schema and migration runner
  project-runtime.ts                Device/document command routing
  project-documents.ts               Project lifecycle and transactional saves
  project-document-media.ts          Embedded media synchronization/extraction
  project-cache.ts, process-owner.ts Cache ownership and stale recovery
  command-map.ts, commands/          Validated native domain operations
  storyboard-package.ts             ZIP/SBZ media handoff
  mcp/                              Instance discovery and bounded agent tools
  desktop-shell.ts, work-runtime.ts  Caption controls and guarded shutdown

shared/                             Cross-process domain types and schemas
components/ui/                      Shared Radix/shadcn controls
scripts/                            Development, MCP bundling and release tools
build/icons/                        Generated platform icon assets
```

## Models, accounting and credentials

Model JSON is discovered at build time in the renderer and read from the explicit installed catalog in the main process. Both boundaries share validation. IDs remain strings because the catalog is extensible; native mutations validate availability and image/video kind rather than treating arbitrary strings as valid models. Supported transports and capabilities determine which controls and input modes appear.

Generation records freeze the estimate basis independently from later provider receipts. Some APIs expose live prices or actual per-request charges; others only support published rates or user-entered estimates. Do not label a published snapshot or estimate as a confirmed charge. Do not seed preview billing with fabricated prices or charges.

Credentials currently live as plain text in device SQLite settings, excluded from project packages and MCP. OS-backed credential encryption is a separate security change; do not claim keyring protection exists. Local endpoints and cloud providers have different authentication and capability requirements.

## Verification and limits

- `yarn typecheck`: strict TypeScript checks.
- `yarn vitest run <files> --maxWorkers=1`: focused renderer/native regressions.
- `yarn test`: icon checks, icon tests, the full Vitest suite and distribution tests.
- `yarn build:frontend`, `yarn build:electron`: production bundles.
- `yarn build`: electron-builder packages in `dist-package/`.

Native tests use real SQLite and temporary files where persistence matters. Renderer tests use Vitest/Testing Library. Provider request/response fixtures are not live paid-provider smoke tests. State exactly which workflows and platforms were manually exercised.

Project persistence still queries referenced paths, checks their file stamps and synchronously writes changed chunks on the main thread. Large changed media can block the UI; bounded chunks limit allocation, not total work. See `docs/project-documents.md` for read-only handling, cache recovery and storage limits.

Feature PRs run tests. Release promotion PRs and tags also build platform packages; inspect `.github/workflows/ci.yml` before describing CI coverage. Tags on `main` create draft release artifacts. Release titles use the version number.
