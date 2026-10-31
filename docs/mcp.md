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

1. Call `list_sessions` and explicitly choose the intended running instance with `attach_session`.
2. Call `read_context`. Read projects, storyboards, shots, bibles, assets and take trees by their stable IDs.
3. To edit, pass `expected_revision` from the latest response and a unique `request_id` along with the tool arguments. Fields use snake_case.
4. Retry uncertain results with exactly the same request ID and arguments. A different payload cannot reuse an ID. A conflict means the application changed; read it again before deciding what to do.

Writes are blocked while the UI has unsaved drafts or other active work. Selecting a take verifies it belongs to the requested shot. Reordering requires every shot exactly once. The app retains a bounded 128-request replay window for the current running instance; do not replay old requests after that window or across an application restart.

Tools cover project and storyboard creation/naming, bible guidance, characters/locations/other bible entries, shot prompts and duration, ordering, take inspection/selection and storyboard package export. Reads that return lists accept `offset` and `limit` (up to 100). `export_storyboard_package` requires the package feature from PR #99, uses the native save dialog and exports media only. It never places clips on an editor timeline.

This initial MCP boundary does not expose credentials, arbitrary HTTP requests, filesystem access, shell commands or destructive delete operations. Generation continues through the app's existing controls; automated generation and provider billing are separate capabilities.

## Local connection

Each running app publishes a descriptor under `$XDG_CONFIG_HOME/showbiz/mcp-sessions` (normally `~/.config/showbiz/mcp-sessions`). `SHOWBIZ_MCP_DIR` can select a different directory for isolated verification. On POSIX, the descriptor directory is owner-only and descriptor files are mode 0600. The application bridge uses a private Unix socket or Windows pipe and a random per-instance secret. Discovery omits credentials; failed attachment clears any previous target. Messages are bounded to 1 MiB and local calls time out after five seconds.

The implementation follows Forgecut's existing live-owner bridge and the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) stdio server pattern. The SDK owns MCP framing, discovery and tool schema validation. Node's HTTP-over-IPC facilities carry the private application calls. SDK Apache-2.0 and transitive dependency notices are collected into `mcp-LICENSES.txt` during the standalone build.
