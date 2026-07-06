#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { createDb } from "./db/client.js";
import { HackerOneClient, searchPrograms, searchScopes, upsertHackerOnePrograms, upsertHackerOneScopes } from "./platforms/hackerone.js";
import { loadSecrets } from "./secrets.js";

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
  const db = createDb(dbPath);
  const secrets = loadSecrets();

  server.registerTool(
    "hackerone_sync_programs",
    {
      description: "Read-only sync of the authenticated researcher's accessible HackerOne programs into SQLite.",
      inputSchema: {},
    },
    async () => {
      const username = secrets.HACKERONE_USERNAME;
      const token = secrets.HACKERONE_TOKEN;
      if (!username || !token) {
        return {
          content: [
            {
              type: "text",
              text: "Missing HACKERONE_USERNAME or HACKERONE_TOKEN in ~/.config/bountybrain/secrets.env",
            },
          ],
          isError: true,
        };
      }

      const client = new HackerOneClient(username, token);
      const rawPrograms = await client.fetchPrograms();
      const rows = upsertHackerOnePrograms(db, rawPrograms);

      return {
        content: [{ type: "text", text: JSON.stringify({ synced: rows.length }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "search_programs",
    {
      description: "Search locally synced bug bounty programs. Read-only; never calls a platform API.",
      inputSchema: {
        platform: z.string().optional(),
        query: z.string().optional(),
        bounty_only: z.boolean().optional(),
      },
    },
    async ({ platform, query, bounty_only }) => {
      const rows = searchPrograms(db, { platform, query, bounty_only });
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    },
  );

  server.registerTool(
    "hackerone_sync_scopes",
    {
      description:
        "Read-only sync of a HackerOne program's in-scope/out-of-scope assets into SQLite.",
      inputSchema: {
        handle: z.string().min(1),
      },
    },
    async ({ handle }) => {
      const username = secrets.HACKERONE_USERNAME;
      const token = secrets.HACKERONE_TOKEN;
      if (!username || !token) {
        return {
          content: [
            {
              type: "text",
              text: "Missing HACKERONE_USERNAME or HACKERONE_TOKEN in ~/.config/bountybrain/secrets.env",
            },
          ],
          isError: true,
        };
      }

      const client = new HackerOneClient(username, token);
      const rawScopes = await client.fetchScopes(handle);
      const rows = upsertHackerOneScopes(db, handle, rawScopes);

      return {
        content: [{ type: "text", text: JSON.stringify({ synced: rows.length }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "search_scopes",
    {
      description: "Search locally synced bug bounty scopes. Read-only; never calls a platform API.",
      inputSchema: {
        platform: z.string().optional(),
        program: z.string().optional(),
        asset: z.string().optional(),
        bounty_only: z.boolean().optional(),
      },
    },
    async ({ platform, program, asset, bounty_only }) => {
      const rows = searchScopes(db, { platform, program, asset, bounty_only });
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("BountyBrain server failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
