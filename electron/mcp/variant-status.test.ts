import { expect, it, vi } from "vitest";
import { createMcpSession } from "./session";
import { mcpTools } from "./tools";

it("approves or rejects a Bible take through the same native command as the app", async () => {
  const dispatch = vi.fn(async () => ({ id: "v1", status: "approved", is_primary: true }));
  const session = createMcpSession(dispatch);
  expect(mcpTools.find((tool) => tool.name === "set_bible_variant_status")).toMatchObject({
    mutates: true,
    command: "update_bible_asset_variant_status",
  });
  expect(
    await session.call({
      tool: "set_bible_variant_status",
      args: { variant_id: "v1", status: "approved", is_primary: true, expected_revision: 0, request_id: "approve-1" },
    }),
  ).toMatchObject({ ok: true });
  expect(dispatch).toHaveBeenCalledWith("update_bible_asset_variant_status", {
    id: "v1",
    status: "approved",
    isPrimary: true,
  });
  expect(
    await session.call({
      tool: "set_bible_variant_status",
      args: { variant_id: "v1", status: "candidate", is_primary: false, expected_revision: 0, request_id: "x" },
    }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
});
