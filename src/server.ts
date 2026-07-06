#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDb } from "./db/client.js";

const server = new McpServer({
  name: "bountybrain",
  version: "0.1.0",
});

// Trivial health tool. Platform sync/search/briefing tools are added by
// later slices (see PRD.md section 6) — this scaffold intentionally
// registers no business tools yet.
server.registerTool(
  "ping",
  {
    description: "Health check for the BountyBrain MCP server.",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: "pong" }],
  })
);

async function main() {
  const dbPath = `${process.env.HOME ?? "."}/.config/bountybrain/bountybrain.db`;
  mkdirSync(dirname(dbPath), { recursive: true });
  createDb(dbPath);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("BountyBrain server failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
