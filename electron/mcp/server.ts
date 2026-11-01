import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { mcpTools } from "./tools";
import { callBridge, listSessions, sessionDirectory } from "./sessions";
import type { BridgeResult, LocalSession } from "./contract";

function toolResult(result: BridgeResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    isError: !result.ok,
  };
}
export function createMcpServer(directory = sessionDirectory()) {
  const server = new McpServer(
    { name: "showbiz", version: "1.0.0" },
    {
      instructions:
        "List sessions and explicitly attach to the intended Showbiz instance. Read context before edits. Mutations require expected_revision and a unique request_id. Retry uncertain results with identical arguments and request_id. Showbiz owns all project data. Exports contain media only and never place clips in an editor timeline.",
    },
  );
  let selected: LocalSession | undefined;
  server.registerTool(
    "list_sessions",
    {
      description:
        "List running Showbiz instances without attaching or exposing credentials.",
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      toolResult({
        ok: true,
        value: (await listSessions(directory)).map(({ id, pid }) => ({
          instance_id: id,
          pid,
        })),
      }),
  );
  server.registerTool(
    "attach_session",
    {
      description:
        "Explicitly choose the running Showbiz instance to work with.",
      inputSchema: z.strictObject({ instance_id: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    async ({ instance_id }) => {
      selected = undefined;
      const found = (await listSessions(directory)).find(
        (session) => session.id === instance_id,
      );
      if (!found)
        return toolResult({
          ok: false,
          error: { code: "NOT_FOUND", message: "Showbiz instance not found" },
        });
      const context = await callBridge(found, {
        tool: "read_context",
        args: {},
      });
      if (context.ok) selected = found;
      return toolResult(context);
    },
  );
  for (const definition of mcpTools) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.schema,
        annotations: {
          readOnlyHint: !definition.mutates,
          destructiveHint: false,
        },
      },
      async (args, context) =>
        toolResult(
          selected
            ? await callBridge(selected, { tool: definition.name, args }, {timeoutMs: definition.requestTimeoutMs, signal: context.mcpReq.signal})
            : {
                ok: false,
                error: {
                  code: "NOT_ATTACHED",
                  message:
                    "List sessions and attach to the intended Showbiz instance first",
                },
              },
        ),
    );
  }
  return server;
}
