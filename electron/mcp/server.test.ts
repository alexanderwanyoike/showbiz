import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { expect, it } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { startLocalBridge } from "./local-bridge";
import { createMcpServer } from "./server";
import { createMcpSession } from "./session";

it("requires attachment and reaches the live app through the official SDK without exposing credentials", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "showbiz-mcp-sdk-"));
  const names: string[] = [];
  const owner = createMcpSession(async (command, args) => {
    if (command === "create_project") {
      names.push(String(args?.name));
      return { id: "project-1", name: args?.name };
    }
    if (command === "get_projects") return names.map((name) => ({ name }));
    throw new Error("Unexpected command");
  });
  const bridge = await startLocalBridge(owner.call, directory);
  const server = createMcpServer(directory);
  const client = new Client({ name: "showbiz-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    expect(
      (await client.callTool({ name: "get_projects", arguments: {} })).isError,
    ).toBe(true);
    const listing = await client.callTool({
      name: "list_sessions",
      arguments: {},
    });
    expect(JSON.stringify(listing)).toContain(bridge.session.id);
    expect(JSON.stringify(listing)).not.toContain(bridge.session.secret);
    if (process.getuid)
      expect(
        (await stat(path.join(directory, `${bridge.session.id}.json`))).mode %
          0o1000,
      ).toBe(0o600);
    expect(
      (
        await client.callTool({
          name: "attach_session",
          arguments: { instance_id: bridge.session.id },
        })
      ).isError,
    ).toBe(false);
    const created = await client.callTool({
      name: "create_project",
      arguments: {
        name: "From an agent",
        expected_revision: 0,
        request_id: "create",
      },
    });
    expect(created.isError).toBe(false);
    expect(names).toEqual(["From an agent"]);
    const failedAttachment = await client.callTool({
      name: "attach_session",
      arguments: { instance_id: "missing-instance" },
    });
    expect(failedAttachment.isError).toBe(true);
    expect(
      (await client.callTool({ name: "get_projects", arguments: {} })).isError,
    ).toBe(true);
    expect(
      (await client.listTools()).tools.some(
        (tool) => tool.name === "get_api_key",
      ),
    ).toBe(false);
  } finally {
    await client.close();
    await server.close();
    await bridge.close();
    await rm(directory, { recursive: true, force: true });
  }
});
