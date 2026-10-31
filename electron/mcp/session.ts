import { createHash } from "node:crypto";
import { z } from "zod";
import { mcpTools } from "./tools";

export type McpResult =
  | { ok: true; value: { revision: number; data: unknown } }
  | { ok: false; error: { code: string; message: string } };
type Invoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;
const requestSchema = z.strictObject({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});
const failure = (code: string, message: string): McpResult => ({
  ok: false,
  error: { code, message },
});
const isMutation = (command: string) =>
  !command.startsWith("get_") &&
  ![
    "http_request",
    "read_context",
    "show_export_save_dialog",
    "export_timeline_video",
    "export_storyboard_package",
  ].includes(command);
function containsVersion(
  nodes: unknown,
  shotId: string,
  versionId: string,
): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node: unknown) => {
    if (typeof node !== "object" || node === null || !("version" in node))
      return false;
    const version = node.version;
    if (
      typeof version === "object" &&
      version !== null &&
      "id" in version &&
      "shot_id" in version &&
      version.id === versionId &&
      version.shot_id === shotId
    )
      return true;
    return (
      "children" in node && containsVersion(node.children, shotId, versionId)
    );
  });
}
export function createMcpSession(
  dispatch: Invoke,
  changed: () => void = () => {},
  canEdit: () => boolean = () => true,
) {
  let revision = 0;
  let tail = Promise.resolve();
  const cache = new Map<string, { fingerprint: string; result: McpResult }>();
  const invoke: Invoke = async (command, args) => {
    const result = await dispatch(command, args);
    if (isMutation(command)) revision++;
    if (
      [
        "create_project_document",
        "open_project_document",
        "close_project_document",
        "save_project_document_as",
        "import_legacy_project",
      ].includes(command) &&
      typeof result === "object" &&
      result !== null &&
      "ok" in result &&
      result.ok === true
    )
      cache.clear();
    return result;
  };
  async function execute(input: unknown): Promise<McpResult> {
    const request = requestSchema.safeParse(input);
    if (!request.success)
      return failure("INVALID_INPUT", "Invalid tool request");
    const definition = mcpTools.find((tool) => tool.name === request.data.tool);
    if (!definition)
      return failure("INVALID_INPUT", "This operation is not exposed to MCP");
    const parsed = definition.schema.safeParse(request.data.args);
    if (!parsed.success) return failure("INVALID_INPUT", parsed.error.message);
    const args = parsed.data as Record<string, unknown>;
    const requestId =
      typeof args.request_id === "string" ? args.request_id : undefined;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(request.data))
      .digest("hex");
    if (requestId) {
      const previous = cache.get(requestId);
      if (previous)
        return previous.fingerprint === fingerprint
          ? previous.result
          : failure(
              "INVALID_INPUT",
              "The request ID was already used with different input",
            );
      if (!canEdit())
        return failure(
          "BUSY",
          "Finish or discard unsaved edits in Showbiz before changing project data through MCP.",
        );
      if (args.expected_revision !== revision)
        return failure(
          "CONFLICT",
          "Showbiz changed. Read context and reconsider the edit.",
        );
    }
    try {
      let data: unknown;
      const nativeArgs = definition.args(args);
      if (definition.command === "update_shot") {
        nativeArgs.updatesJson = JSON.stringify(nativeArgs.updates);
        delete nativeArgs.updates;
      }
      if (definition.command === "reorder_shots") {
        const shots = z.array(z.object({ id: z.string() })).parse(
          await dispatch("get_shots", {
            storyboardId: nativeArgs.storyboardId,
          }),
        );
        const ids = z.array(z.string()).parse(nativeArgs.shotIds);
        if (
          ids.length !== shots.length ||
          new Set(ids).size !== ids.length ||
          shots.some((shot) => !ids.includes(shot.id))
        )
          return failure(
            "INVALID_INPUT",
            "Reordering requires every shot exactly once",
          );
      }
      if (definition.command.startsWith("switch_to_")) {
        const command =
          definition.command === "switch_to_version"
            ? "get_image_versions"
            : "get_video_versions";
        if (
          !containsVersion(
            await dispatch(command, { shotId: nativeArgs.shotId }),
            String(nativeArgs.shotId),
            String(nativeArgs.versionId),
          )
        )
          return failure(
            "INVALID_INPUT",
            "The selected take does not belong to this shot",
          );
      }
      if (definition.command === "read_context") data = { revision };
      else data = await invoke(definition.command, nativeArgs);
      const nativeFailure = z
        .object({
          ok: z.literal(false),
          error: z.object({ code: z.string(), message: z.string() }),
        })
        .safeParse(data);
      if (nativeFailure.success)
        return failure(
          nativeFailure.data.error.code,
          nativeFailure.data.error.message,
        );
      if (Array.isArray(data))
        data = {
          items: data.slice(
            Number(args.offset ?? 0),
            Number(args.offset ?? 0) + Number(args.limit ?? 100),
          ),
          total: data.length,
        };
      const result: McpResult = { ok: true, value: { revision, data } };
      if (requestId) {
        cache.set(requestId, { fingerprint, result });
        if (cache.size > 128) cache.delete(cache.keys().next().value!);
        try {
          changed();
        } catch (cause) {
          console.warn(
            "An agent edit was saved but the window could not be refreshed:",
            cause,
          );
        }
      }
      return result;
    } catch (cause) {
      return failure(
        "OPERATION_FAILED",
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  }
  return {
    invoke,
    call(input: unknown): Promise<McpResult> {
      const operation = tail.then(() => execute(input));
      tail = operation.then(() => {});
      return operation;
    },
  };
}
