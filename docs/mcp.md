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

## Local connection

Each running app publishes a descriptor under `$XDG_CONFIG_HOME/showbiz/mcp-sessions` (normally `~/.config/showbiz/mcp-sessions`). `SHOWBIZ_MCP_DIR` can select a different directory for isolated verification. On POSIX, the descriptor directory is owner-only and descriptor files are mode 0600. The application bridge uses a private Unix socket or Windows pipe and a random per-instance secret. Discovery omits credentials; failed attachment clears any previous target. Messages are bounded to 1 MiB. Normal local requests have a five-second inactivity timeout; native exports allow five minutes for the save dialog and media writing. A timeout or cancelled client wait does not cancel work already running in Showbiz. For edits and exports, retry using the same request ID and arguments to retrieve the eventual success or failure without repeating the operation. Reads have no request ID and can be repeated.

Reads remain available during an agent edit or export. A concurrent write returns `BUSY` instead of waiting in an unbounded queue. Retrying an active request returns `PENDING`; once it finishes, the same request ID returns the cached terminal result, including an operation failure, without repeating the operation.

The implementation follows a live application owner bridge and the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) stdio server pattern. The SDK owns MCP framing, discovery and tool schema validation. Node's HTTP-over-IPC facilities carry the private application calls. SDK Apache-2.0 and transitive dependency notices are collected into `mcp-LICENSES.txt` during the standalone build.
