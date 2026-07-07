import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import {
  HackerOneClient,
  normalizeHackerOneProgram,
  normalizeHackerOneReport,
  normalizeHackerOneScope,
  searchPrograms,
  searchReports,
  searchScopes,
  upsertHackerOnePrograms,
  upsertHackerOneReports,
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

  it("fetches researcher's own reports with basic auth and pagination", async () => {
    const requested: string[] = [];
    const client = new HackerOneClient("alice", "token", async (input, init) => {
      requested.push(input);
      expect(init?.headers).toMatchObject({
        accept: "application/json",
        authorization: `Basic ${Buffer.from("alice:token").toString("base64")}`,
      });

      const page = input.endsWith("page=2")
        ? { data: [{ id: "200" }], links: { next: null } }
        : { data: [{ id: "100" }], links: { next: "https://api.hackerone.com/v1/hackers/me/reports?page=2" } };

      return new Response(JSON.stringify(page), { status: 200 });
    });

    const reports = await client.fetchReports();

    expect(reports).toEqual([{ id: "100" }, { id: "200" }]);
    expect(requested).toEqual([
      "https://api.hackerone.com/v1/hackers/me/reports",
      "https://api.hackerone.com/v1/hackers/me/reports?page=2",
    ]);
  });
});

describe("HackerOne report sync/search", () => {
  it("normalizes HackerOne API report payloads and preserves raw JSON", () => {
    const row = normalizeHackerOneReport(
      {
        id: "12345",
        type: "report",
        attributes: {
          title: "IDOR on /api/users",
          state: "resolved",
          vulnerability_information: "Steps to reproduce...",
          created_at: "2025-01-01T00:00:00.000Z",
          bounty_awarded_at: "2025-02-01T00:00:00.000Z",
          disclosed_at: "2025-03-01T00:00:00.000Z",
        },
        relationships: {
          severity: { data: { attributes: { rating: "high" } } },
          weakness: { data: { attributes: { name: "Insecure Direct Object Reference", external_id: "CWE-639" } } },
          bounties: { data: [{ attributes: { amount: "1000.00", bonus_amount: "0.00", awarded_currency: "USD" } }] },
          program: { data: { attributes: { handle: "acme" } } },
        },
      },
      now,
    );

    expect(row).toMatchObject({
      id: "hackerone:12345",
      platform: "hackerone",
      program_handle: "acme",
      title: "IDOR on /api/users",
      state: "resolved",
      severity_rating: "high",
      weakness_name: "Insecure Direct Object Reference",
      weakness_cwe: "CWE-639",
      bounty_amount: 1000,
      bounty_currency: "USD",
      vulnerability_information: "Steps to reproduce...",
      created_at: "2025-01-01T00:00:00.000Z",
      bounty_awarded_at: "2025-02-01T00:00:00.000Z",
      disclosed_at: "2025-03-01T00:00:00.000Z",
      synced_at: now,
    });
    expect(JSON.parse(row.raw_json)).toMatchObject({ id: "12345" });
  });

  it("rejects payloads without a usable report id", () => {
    expect(() => normalizeHackerOneReport({ attributes: { title: "No ID" } }, now)).toThrow(
      "missing required report id",
    );
  });

  it("upserts reports and supports combined search filters", () => {
    const db = createDb(":memory:");

    upsertHackerOneReports(
      db,
      [
        {
          id: "100",
          attributes: { title: "XSS in search", state: "resolved", created_at: "2025-01-01T00:00:00.000Z" },
          relationships: {
            severity: { data: { attributes: { rating: "medium" } } },
            weakness: { data: { attributes: { name: "Cross-site Scripting", external_id: "CWE-79" } } },
            bounties: { data: [{ attributes: { amount: "500.00", bonus_amount: "0.00", awarded_currency: "USD" } }] },
            program: { data: { attributes: { handle: "acme" } } },
          },
        },
        {
          id: "200",
          attributes: { title: "SSRF via webhooks", state: "resolved", created_at: "2025-02-01T00:00:00.000Z" },
          relationships: {
            severity: { data: { attributes: { rating: "critical" } } },
            weakness: { data: { attributes: { name: "Server-Side Request Forgery", external_id: "CWE-918" } } },
            bounties: { data: [{ attributes: { amount: "3000.00", bonus_amount: "0.00", awarded_currency: "USD" } }] },
            program: { data: { attributes: { handle: "other-corp" } } },
          },
        },
      ],
      now,
    );

    // All reports
    expect(searchReports(db, { platform: "hackerone" })).toHaveLength(2);
    // Filter by program
    expect(searchReports(db, { program: "acme" }).map((r) => r.title)).toEqual(["XSS in search"]);
    // Filter by weakness (substring match)
    expect(searchReports(db, { weakness: "request forgery" }).map((r) => r.title)).toEqual(["SSRF via webhooks"]);
    // Filter by severity
    expect(searchReports(db, { severity: "critical" }).map((r) => r.title)).toEqual(["SSRF via webhooks"]);
    // Combined filters that match nothing
    expect(searchReports(db, { program: "acme", severity: "critical" })).toEqual([]);

    db.close();
  });
});
