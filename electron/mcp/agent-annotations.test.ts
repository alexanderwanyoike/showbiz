import { expect, it } from "vitest";
import { toolAnnotations } from "./server";
import { mcpTools } from "./tools";

const tool = (name: string) => {
  const found = mcpTools.find((entry) => entry.name === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
};

it("never presents a paid tool as read-only to MCP clients", () => {
  expect(toolAnnotations(tool("generate"))).toEqual({
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
  expect(toolAnnotations(tool("get_shots"))).toEqual({
    readOnlyHint: true,
    destructiveHint: false,
  });
  expect(toolAnnotations(tool("update_shot"))).toEqual({
    readOnlyHint: false,
    destructiveHint: false,
  });
});
