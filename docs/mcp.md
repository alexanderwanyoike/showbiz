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

`get_generation_models` reads the installed model IDs, provider identities, capabilities and defaults. `get_generation_price` reads the device's saved, cached or bundled rate and source; a missing rate remains unknown. OpenRouter metadata refresh happens through the app's generation controls.

Use `update_storyboard_models` with both `image_model` and `video_model` to change defaults. `set_shot_models` changes either shot override independently: omit a field to preserve it, or pass null to inherit the storyboard default. These writes use the same revision, request replay and unsaved-work safeguards as other edits. Model configuration JSON is packaged with the app and discovery omits transport credentials and endpoints.

Tools cover project naming, storyboard creation/naming, bible guidance, characters/locations/other bible entries, shot prompts and duration, ordering, take inspection/selection and storyboard package export. Reads that return lists accept `offset` and `limit` (up to 100). `export_storyboard_package` uses the native save dialog and exports ZIP or SBZ media packages. It never places clips on an editor timeline.

This initial MCP boundary does not expose credentials, arbitrary HTTP requests, filesystem access, shell commands or destructive delete operations. Generation continues through the app controls; agent tools do not submit paid requests or write receipts. Agents can read usage and saved pricing.

## Agent budget

You can grant an agent a spending budget in Showbiz. Open Usage & billing and choose Agent budget. Enter the amount in USD, optionally a lower per-request limit, how long it lasts (1 hour, 1 day or 1 week), and optionally the only models the agent may use. Granting again replaces the earlier budget. While a budget is active, a banner across the project workspace shows what is left and when it ends, with Revoke.

The budget belongs to this device, not to a project file. It covers whichever project is open, is never written into a `.showbiz` document or export, and a copied project carries no spending rights. `get_agent_budget` is the only budget tool. It reads the remaining amount, per-request cap, expiry and allowed models, and returns `NO_BUDGET` when nothing is granted, the budget expired or you revoked it. No MCP tool creates, raises, extends or revokes a budget. Agents can read the budget and ask for quotes against it, but cannot spend it yet; submitting a quoted generation is not available in this release.

## Quotes

`quote_generation` prices a generation before anything is spent. For a Bible entry picture, pass `target: "bible_asset"`, `operation: "generate"`, the entry's `asset_id`, a `prompt` and an installed image `model_id` from `get_generation_models`. Showbiz asks its open window for the same estimate the app's own controls show for that model, including a live provider price check where the provider offers one, so quoting can take several seconds.

A quote returns a `quote_id`, the minimum and maximum amount, the frozen price basis with its source and when it was checked, whether that price is stale, whether the estimate excludes input charges, a fingerprint of what was priced, and the budget left. The agent chooses the image model for Bible pictures, as the app lets you choose one in the Bible. Frames are made by composing Bible references, so a frame entry cannot be quoted as a plain prompt picture. It expires after ten minutes, can back at most one submission, and is lost when Showbiz restarts.

Quotes are refused with these codes:

- `PRICE_UNKNOWN`: no rate is available, the rate does not match the settings, or a provider's historical estimate is zero. An unknown price is never treated as free. Local models need a custom rate saved in the app, and an explicit rate of zero is accepted.
- `NO_BUDGET`, `MODEL_NOT_ALLOWED`, `OVER_REQUEST_CAP`, `OVER_BUDGET`: the request falls outside the budget you granted.
- `NOT_FOUND`, `INVALID_INPUT`: the Bible entry is not in the open project, it is a frame, or the model is not an installed image model.
- `IO_ERROR`: the window returned a price plan that does not match the request.
- `UNAVAILABLE`: no Showbiz window or project is open, or the window did not answer.

## Local connection

Each running app publishes a descriptor under `$XDG_CONFIG_HOME/showbiz/mcp-sessions` (normally `~/.config/showbiz/mcp-sessions`). `SHOWBIZ_MCP_DIR` can select a different directory for isolated verification. On POSIX, the descriptor directory is owner-only and descriptor files are mode 0600. The application bridge uses a private Unix socket or Windows pipe and a random per-instance secret. Discovery omits credentials; failed attachment clears any previous target. Messages are bounded to 1 MiB. Normal local requests have a five-second inactivity timeout; native exports allow five minutes for the save dialog and media writing. A timeout or cancelled client wait does not cancel work already running in Showbiz. For edits and exports, retry using the same request ID and arguments to retrieve the eventual success or failure without repeating the operation. Reads have no request ID and can be repeated.

Discovery checks a bearer-authenticated instance-health response rather than treating a live process ID as proof. The echoed ID and PID detect stale descriptors; the private, owner-only socket directory and secret protect access to the server. Descriptor sockets must use Showbiz's local namespace, never a remote Windows pipe or an arbitrary Unix socket. Confirmed stale owned descriptors and their known private socket directories are removed; an unresponsive or unauthenticated endpoint is excluded without deleting its socket. Windows named pipes use the same bearer secret, but POSIX mode bits do not establish a Windows ACL. Keep the descriptor directory inside a private user profile and restrict its Windows permissions when choosing `SHOWBIZ_MCP_DIR`.

Reads remain available during an agent edit or export. A concurrent write returns `BUSY` instead of waiting in an unbounded queue. Retrying an active request returns `PENDING`; once it finishes, the same request ID returns the cached terminal result, including an operation failure, without repeating the operation.

The implementation follows a live application owner bridge and the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) stdio server pattern. The SDK owns MCP framing, discovery and tool schema validation. Node's HTTP-over-IPC facilities carry the private application calls. SDK Apache-2.0 and transitive dependency notices are collected into `mcp-LICENSES.txt` during the standalone build.

The app and MCP adapter must share the same temporary directory (`TMPDIR` on POSIX). Discovery rejects sockets outside that directory rather than probing or deleting an untrusted path.
