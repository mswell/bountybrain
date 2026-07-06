import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import {
  HackerOneClient,
  normalizeHackerOneProgram,
  normalizeHackerOneScope,
  searchPrograms,
  searchScopes,
  upsertHackerOnePrograms,
  upsertHackerOneScopes,
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

});

describe("HackerOne scope sync/search", () => {
  it("normalizes HackerOne structured-scope payloads and preserves raw JSON", () => {
    const row = normalizeHackerOneScope(
      {
        id: "57",
        type: "structured-scope",
        attributes: {
          asset_identifier: "api.example.com",
          asset_type: "URL",
          eligible_for_bounty: true,
          eligible_for_submission: true,
          max_severity: "critical",
          instruction: null,
        },
      },
      "acme",
      now,
    );

    expect(row).toMatchObject({
      id: "hackerone:acme:api.example.com",
      platform: "hackerone",
      program_handle: "acme",
      asset_identifier: "api.example.com",
      asset_type: "URL",
      eligible_for_bounty: 1,
      eligible_for_submission: 1,
      max_severity: "critical",
      instruction: null,
      synced_at: now,
    });
    expect(JSON.parse(row.raw_json)).toMatchObject({ id: "57" });
  });

  it("rejects payloads without a usable asset identifier", () => {
    expect(() =>
      normalizeHackerOneScope({ attributes: { asset_type: "URL" } }, "acme", now),
    ).toThrow("missing required asset_identifier");
  });

  it("upserts scopes and supports combined search filters", () => {
    const db = createDb(":memory:");

    upsertHackerOneScopes(
      db,
      "acme",
      [
        {
          id: "1",
          attributes: {
            asset_identifier: "api.example.com",
            asset_type: "URL",
            eligible_for_bounty: true,
            eligible_for_submission: true,
            max_severity: "critical",
          },
        },
        {
          id: "2",
          attributes: {
            asset_identifier: "docs.example.com",
            asset_type: "URL",
            eligible_for_bounty: false,
            eligible_for_submission: true,
            max_severity: "low",
          },
        },
      ],
      now,
    );

    upsertHackerOneScopes(
      db,
      "other",
      [
        {
          id: "3",
          attributes: {
            asset_identifier: "api.other.com",
            asset_type: "URL",
            eligible_for_bounty: true,
            eligible_for_submission: true,
            max_severity: "high",
          },
        },
      ],
      now,
    );

    expect(searchScopes(db, { platform: "hackerone" })).toHaveLength(3);
    expect(searchScopes(db, { program: "acme" }).map((row) => row.asset_identifier)).toEqual([
      "api.example.com",
      "docs.example.com",
    ]);
    expect(searchScopes(db, { asset: "api" }).map((row) => row.asset_identifier)).toEqual([
      "api.example.com",
      "api.other.com",
    ]);
    expect(searchScopes(db, { bounty_only: true }).map((row) => row.asset_identifier)).toEqual([
      "api.example.com",
      "api.other.com",
    ]);
    expect(searchScopes(db, { program: "acme", asset: "docs", bounty_only: true })).toEqual([]);

    db.close();
  });
});

describe("HackerOne program fetch", () => {
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

  it("fetches structured scopes for a program handle with basic auth and pagination", async () => {
    const requested: string[] = [];
    const client = new HackerOneClient("alice", "token", async (input, init) => {
      requested.push(input);
      expect(init?.headers).toMatchObject({
        accept: "application/json",
        authorization: `Basic ${Buffer.from("alice:token").toString("base64")}`,
      });

      const page = input.endsWith("page=2")
        ? { data: [{ id: "second" }], links: { next: null } }
        : {
            data: [{ id: "first" }],
            links: {
              next: "https://api.hackerone.com/v1/hackers/programs/acme/structured_scopes?page=2",
            },
          };

      return new Response(JSON.stringify(page), { status: 200 });
    });

    const scopes = await client.fetchScopes("acme");

    expect(scopes).toEqual([{ id: "first" }, { id: "second" }]);
    expect(requested).toEqual([
      "https://api.hackerone.com/v1/hackers/programs/acme/structured_scopes",
      "https://api.hackerone.com/v1/hackers/programs/acme/structured_scopes?page=2",
    ]);
  });
});
