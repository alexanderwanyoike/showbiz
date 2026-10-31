import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "./server";
serveStdio(() => createMcpServer(), { onerror: (error) => console.error(error) });
