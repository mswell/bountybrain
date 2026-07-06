import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import {
  HackerOneClient,
  normalizeHackerOneProgram,
  searchPrograms,
  upsertHackerOnePrograms,
} from "../src/platforms/hackerone.js";

const now = "2026-07-06T00:00:00.000Z";

describe("HackerOne program sync/search", () => {
  it("normalizes HackerOne API program payloads and preserves raw JSON", () => {
    const row = normalizeHackerOneProgram(
      {
        id: "acme",
        attributes: {
          handle: "acme",
          name: "Acme Corp",
          offers_bounties: true,
          submission_state: "open",
        },
      },
      now,
    );

    expect(row).toMatchObject({
      id: "hackerone:acme",
      platform: "hackerone",
      handle: "acme",
      name: "Acme Corp",
      offers_bounties: 1,
      submission_state: "open",
      synced_at: now,
    });
    expect(JSON.parse(row.raw_json)).toMatchObject({ id: "acme" });
  });

  it("rejects payloads without a usable handle or id", () => {
    expect(() => normalizeHackerOneProgram({ attributes: { name: "No Handle" } }, now)).toThrow(
      "missing required handle/id",
    );
  });

  it("upserts programs and supports combined search filters", () => {
    const db = createDb(":memory:");

    upsertHackerOnePrograms(
      db,
      [
        {
          id: "acme",
          attributes: { handle: "acme", name: "Acme Corp", offers_bounties: true, submission_state: "open" },
        },
        {
          id: "docs-only",
          attributes: { handle: "docs-only", name: "Docs Only", offers_bounties: false, submission_state: "open" },
        },
      ],
      now,
    );

    upsertHackerOnePrograms(
      db,
      [
        {
          id: "acme",
          attributes: { handle: "acme", name: "Acme Updated", offers_bounties: true, submission_state: "open" },
        },
      ],
      "2026-07-07T00:00:00.000Z",
    );

    expect(searchPrograms(db, { platform: "hackerone" })).toHaveLength(2);
    expect(searchPrograms(db, { query: "updated" }).map((row) => row.handle)).toEqual(["acme"]);
    expect(searchPrograms(db, { bounty_only: true }).map((row) => row.handle)).toEqual(["acme"]);
    expect(searchPrograms(db, { platform: "hackerone", query: "docs", bounty_only: true })).toEqual([]);

    db.close();
  });

  it("fetches all HackerOne programs with basic auth and pagination", async () => {
    const requested: string[] = [];
    const client = new HackerOneClient("alice", "token", async (input, init) => {
      requested.push(input);
      expect(init?.headers).toMatchObject({
        accept: "application/json",
        authorization: `Basic ${Buffer.from("alice:token").toString("base64")}`,
      });

      const page = input.endsWith("page=2")
        ? { data: [{ id: "second" }], links: { next: null } }
        : { data: [{ id: "first" }], links: { next: "https://api.hackerone.com/v1/hackers/programs?page=2" } };

      return new Response(JSON.stringify(page), { status: 200 });
    });

    const programs = await client.fetchPrograms();

    expect(programs).toEqual([{ id: "first" }, { id: "second" }]);
    expect(requested).toEqual([
      "https://api.hackerone.com/v1/hackers/programs",
      "https://api.hackerone.com/v1/hackers/programs?page=2",
    ]);
  });
});
