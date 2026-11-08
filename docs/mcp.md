# Agent access through MCP

Keep Showbiz running. The MCP adapter connects to that live application; the Electron process remains the owner of SQLite and project media. Agent edits refresh the visible workspace.

## Run from a checkout

Use Node.js 22 or later:

```bash
yarn install
yarn build:electron
yarn mcp
```

Configure your MCP client to launch `node` with the absolute path to `dist-electron/showbiz-mcp.cjs`. For example, a client accepting `mcpServers` entries can use:

```json
{
  "mcpServers": {
    "showbiz": {
      "command": "node",
      "args": ["/absolute/path/to/showbiz/dist-electron/showbiz-mcp.cjs"]
    }
  }
}
```

Packaged builds include the same standalone adapter and its dependency licences under `resources/mcp/`, outside ASAR. Copy the adapter to a stable location when using a temporarily mounted AppImage. The adapter has no runtime dependency on the source checkout or its node_modules.

## Workflow

First create or open a `.showbiz` file through the app. Project tools then address only that open document. The legacy `create_project` tool belongs to library-based builds; it does not create project files.

1. Call `list_sessions` and explicitly choose the intended running instance with `attach_session`.
2. Call `read_context`. Read projects, storyboards, shots, bibles, assets and take trees by their stable IDs.
3. To edit, pass `expected_revision` from the latest response and a unique `request_id` along with the tool arguments. Fields use snake_case.
4. Retry uncertain results with exactly the same request ID and arguments. A different payload cannot reuse an ID. A conflict means the application changed; read it again before deciding what to do.

Writes are blocked while the UI has unsaved drafts or other active work. Selecting a take verifies it belongs to the requested shot. Reordering requires every shot exactly once. Switching project files expires the replay cache and invalidates stale edit revisions. The app retains a bounded 128-request replay window for the current running instance; do not replay old requests after that window or across an application restart.

`get_generation_models` reads the installed model IDs, provider identities, capabilities and defaults. `get_generation_price` reads the device's saved, cached or bundled rate and source; a missing rate remains unknown. OpenRouter metadata refreshes through the app's generation controls or when an agent asks for a quote.

Use `update_storyboard_models` with both `image_model` and `video_model` to change defaults. `set_shot_models` changes either shot override independently: omit a field to preserve it, or pass null to inherit the storyboard default. These writes use the same revision, request replay and unsaved-work safeguards as other edits. Model configuration JSON is packaged with the app and discovery omits transport credentials and endpoints.

Tools cover project naming, storyboard creation/naming, bible guidance, characters/locations/other bible entries, shot prompts and duration, ordering, take inspection/selection and storyboard package export. Reads that return lists accept `offset` and `limit` (up to 100). `export_storyboard_package` uses the native save dialog and exports ZIP or SBZ media packages. It never places clips on an editor timeline.

This MCP boundary does not expose credentials, arbitrary HTTP requests, filesystem access, shell commands or destructive delete operations. Agents generate only through quotes and jobs within the budget you grant, and the app writes every receipt itself. Agents can read usage and saved pricing.

## Agent budget

You can grant an agent a spending budget in Showbiz. Open Usage & billing and choose Agent budget. Enter the amount in USD, optionally a lower per-request limit, how long it lasts (1 hour, 1 day or 1 week), and optionally the only models the agent may use. Granting again replaces the earlier budget. While a budget is active, a banner across the project workspace shows what is left and when it ends, with Revoke.

The budget and its job ledger belong to this device, not to a project file. (Project files share the database schema, so they contain an empty ledger table that Showbiz never uses.) It covers whichever project is open, is never written into a `.showbiz` document or export, and a copied project carries no spending rights. `get_agent_budget` is the only budget tool. It reads the remaining amount, per-request cap, expiry and allowed models, and returns `NO_BUDGET` when nothing is granted, the budget expired or you revoked it. No MCP tool creates, raises, extends or revokes a budget. Agents can read the budget, ask for quotes against it and submit quoted generations, which spend from it.

## Quotes

`quote_generation` prices a generation before anything is spent. For a Bible entry, pass `target: "bible_asset"`, the entry's `asset_id`, an installed image `model_id` from `get_generation_models`, and one of these operations, which match the Bible's own controls:

- `generate` with a `prompt`: a new picture from the prompt alone.
- `retake` with an optional `prompt`: stays on-model by composing from the entry's current picture, or for a frame from its recipe's characters and location view, using the prompt that made it unless you pass one. An entry without pictures is generated from the prompt alone. Composition needs a model that supports it and uses at most 10 pictures. A frame whose characters or location have no picture yet is refused rather than composed without them, and a job never composes from fewer pictures than its quote.
- `edit` with `source_variant_id` (one of the entry's takes) and the instruction as `prompt`. Editing needs a model that supports it.

The result becomes the entry's current picture, as in the app. For a shot's start frame, pass `target: "shot_start_frame"` and the `shot_id` with `generate` and a `prompt`, or `edit` with `source_take_id` (one of the shot's start frame takes) and the instruction as `prompt`. Shots use their own image model or the storyboard default, as the storyboard does; change it with `set_shot_models`. The new picture becomes the shot's current start frame take.

For a shot's video, pass `target: "shot_video"`, `operation: "generate"` and the `shot_id`. The quote uses what the storyboard's Generate Video uses: the shot's video model, its saved video settings, its video prompt (set with `update_shot`), the start frame for image-to-video, and the end frame when the model supports one. `set_shot_video_settings` saves duration, resolution, aspect ratio and audio for a model, as the shot's video settings panel does; settings the model cannot use fall back to its defaults, and the quote shows what will be used. Changing the shot after quoting (its prompt, settings or frames) makes the quote stale, and a job never runs with other frames than were quoted. Video jobs take minutes; poll `get_generation_job`, whose result carries the new `video_take_id`. `get_media_preview` with `video_take_id` returns three frames (start, middle and end) of a video take.

`set_shot_frame` (free, a normal guarded edit) puts a take of a Bible frame into a shot's start frame, as a new take, or into its end frame, exactly as the storyboard's frame picker does. End frames are made this way rather than generated directly: compose a frame in the Bible, then set it. To make a new frame, call `create_bible_frame` with a prompt, up to nine character IDs and optionally a location and one of its views, exactly as the frame composer records them, then quote a `retake` of the new frame. The quote freezes the resolved prompt and reference pictures; changing them before submitting makes the quote stale. Showbiz asks its open window for the same estimate the app's own controls show for that model, including a live provider price check where the provider offers one, so quoting can take several seconds.

A quote returns a `quote_id`, the minimum and maximum amount, the frozen price basis with its source and when it was checked, whether that price is stale, whether the estimate excludes input charges, a fingerprint of what was priced, and the budget left. It expires after ten minutes, can back at most one submission, and is lost when Showbiz restarts. The agent chooses the image model for Bible pictures, as the app lets you choose one in the Bible. A quote that refreshes a provider price saves it to the device price cache, which counts as a change, so read context again before an edit that needs `expected_revision`.

Quotes are refused with these codes:

- `PRICE_UNKNOWN`: no rate is available, the rate does not match the settings, or a provider's historical estimate is zero. An unknown price is never treated as free. Local models need a custom rate saved in the app, and an explicit rate of zero is accepted.
- `NO_BUDGET`, `MODEL_NOT_ALLOWED`, `OVER_REQUEST_CAP`, `OVER_BUDGET`: the request falls outside the budget you granted.
- `NOT_FOUND`, `INVALID_INPUT`: the Bible entry or source picture is not in the open project, `generate` was asked for a frame, the model is not an installed image model or cannot edit or compose as needed, a retake has no prompt, a frame's character or location has no picture, or a composition would need more than 10 pictures.
- `IO_ERROR`: the window returned a price plan that does not match the request.
- `UNAVAILABLE`: no Showbiz window or project is open, or the window did not answer.

## Generation jobs

`submit_generation` takes a `quote_id` and a `request_id` you choose. It does not use `expected_revision`, because the quote already fixes what will be generated; if the Bible entry, model or project changed since quoting, it returns `QUOTE_STALE`. Showbiz first writes a job to a ledger on this device, holding the quote's maximum against the budget, and only then asks its window to generate. The job runs through the same code as the app's Generate button: the same usage record, provider request ID and receipt checks, and the picture becomes the entry's new primary take, as a new take does in the app. Usage & billing marks these requests as Agent.

Retrying `submit_generation` with the same `request_id` and quote returns the same job and never submits a second paid request, while the first call is still running, after a timeout and after Showbiz restarts. The same `request_id` with another quote is refused. Each job also uses its own usage record identity, which the usage table refuses to start twice.

Only one paid job runs at a time (`JOB_LIMIT`, reported before `BUSY`). `submit_generation` is announced to MCP clients as a tool that reaches outside services and is not read-only, so clients that ask before such tools can ask you. While it runs, Showbiz counts it as generation work, so other agent edits return `BUSY` and the open project cannot be switched or closed. Submissions are refused while you have unsaved edits.

`get_media_preview` shows the agent a Bible take (`bible_variant_id`) or a shot image take (`image_take_id`) as a JPEG of at most 512 pixels, returned as MCP image content, so it can judge a result before choosing it. `set_bible_variant_status` approves a take, optionally making it the entry's current picture as Use this take does in the app, or rejects one. The current picture cannot be rejected; make another take current first. Approving without making a take current leaves the current picture as it is. The app itself has no reject control and does not show a take's status, so a take an agent rejects still appears in the Bible. It uses the same revision, request replay and unsaved-work safeguards as other edits.

`get_generation_job` reports `accepted`, `running`, `completed`, `failed` or `interrupted`, the new picture's `variant_id`, the held amount, and `charge_status`: `estimated` while the quoted maximum is held, `confirmed` once the provider reports the charge, or `released` when the provider was never called. `list_generation_jobs` pages a project's jobs, newest first.

The held amount becomes the confirmed charge once it is known. Until then the full quoted maximum stays held, also for failed and interrupted jobs, because a provider can charge for a request that failed. A hold is released only when the job never reached the provider, for example when a provider key is missing. A job still running when Showbiz quits, or when its window reloads or crashes, is marked `interrupted` and keeps its hold. If the window does not confirm that it started a job, the job is marked `interrupted` and keeps its hold, because the window may still be generating; a later report from the window can still complete it. Charges that providers confirm after a job finished are read before every budget decision. If a confirmed charge is higher than its quote, the budget is frozen and the banner says so; grant a new budget to continue.

## Local connection

Each running app publishes a descriptor under `$XDG_CONFIG_HOME/showbiz/mcp-sessions` (normally `~/.config/showbiz/mcp-sessions`). `SHOWBIZ_MCP_DIR` can select a different directory for isolated verification. On POSIX, the descriptor directory is owner-only and descriptor files are mode 0600. The application bridge uses a private Unix socket or Windows pipe and a random per-instance secret. Discovery omits credentials; failed attachment clears any previous target. Messages are bounded to 1 MiB. Normal local requests have a five-second inactivity timeout; native exports allow five minutes for the save dialog and media writing. A timeout or cancelled client wait does not cancel work already running in Showbiz. For edits and exports, retry using the same request ID and arguments to retrieve the eventual success or failure without repeating the operation. Reads have no request ID and can be repeated.

Discovery checks a bearer-authenticated instance-health response rather than treating a live process ID as proof. The echoed ID and PID detect stale descriptors; the private, owner-only socket directory and secret protect access to the server. Descriptor sockets must use Showbiz's local namespace, never a remote Windows pipe or an arbitrary Unix socket. Confirmed stale owned descriptors and their known private socket directories are removed; an unresponsive or unauthenticated endpoint is excluded without deleting its socket. Windows named pipes use the same bearer secret, but POSIX mode bits do not establish a Windows ACL. Keep the descriptor directory inside a private user profile and restrict its Windows permissions when choosing `SHOWBIZ_MCP_DIR`.

Reads remain available during an agent edit or export. A concurrent write returns `BUSY` instead of waiting in an unbounded queue. Retrying an active request returns `PENDING`; once it finishes, the same request ID returns the cached terminal result, including an operation failure, without repeating the operation.

The implementation follows a live application owner bridge and the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) stdio server pattern. The SDK owns MCP framing, discovery and tool schema validation. Node's HTTP-over-IPC facilities carry the private application calls. SDK Apache-2.0 and transitive dependency notices are collected into `mcp-LICENSES.txt` during the standalone build.

The app and MCP adapter must share the same temporary directory (`TMPDIR` on POSIX). Discovery rejects sockets outside that directory rather than probing or deleting an untrusted path.
