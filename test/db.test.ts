import { describe, it, expect } from "vitest";
import { createDb } from "../src/db/client.js";

describe("db client", () => {
  it("applies the schema and allows inserting/reading a program row", () => {
    const db = createDb(":memory:");

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO programs (id, platform, handle, name, offers_bounties, submission_state, raw_json, synced_at)
       VALUES (@id, @platform, @handle, @name, @offers_bounties, @submission_state, @raw_json, @synced_at)`
    ).run({
      id: "hackerone:acme",
      platform: "hackerone",
      handle: "acme",
      name: "Acme Corp",
      offers_bounties: 1,
      submission_state: "open",
      raw_json: JSON.stringify({ handle: "acme" }),
      synced_at: now,
    });

    const row = db
      .prepare("SELECT * FROM programs WHERE id = ?")
      .get("hackerone:acme") as Record<string, unknown>;

    expect(row.handle).toBe("acme");
    expect(row.platform).toBe("hackerone");

    db.close();
  });

  it("creates scopes, reports, and auth_state tables", () => {
    const db = createDb(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toEqual(["auth_state", "programs", "reports", "scopes"]);

    db.close();
  });
});
