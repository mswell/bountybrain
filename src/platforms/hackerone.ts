import type Database from "better-sqlite3";

export interface HackerOneProgramApiResponse {
  data?: unknown[];
  links?: {
    next?: string | null;
  };
}

export interface HackerOneProgramRow {
  id: string;
  platform: "hackerone";
  handle: string;
  name: string | null;
  offers_bounties: number | null;
  submission_state: string | null;
  raw_json: string;
  synced_at: string;
}

export interface SearchProgramsFilters {
  platform?: string;
  query?: string;
  bounty_only?: boolean;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const HACKERONE_PROGRAMS_URL = "https://api.hackerone.com/v1/hackers/programs";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanToInteger(value: unknown): number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

export function normalizeHackerOneProgram(raw: unknown, syncedAt: string): HackerOneProgramRow {
  const record = asRecord(raw);
  const attributes = asRecord(record.attributes);
  const relationships = asRecord(record.relationships);

  const handle =
    stringValue(attributes.handle) ??
    stringValue(record.handle) ??
    stringValue(record.id);

  if (!handle) {
    throw new Error("HackerOne program is missing required handle/id");
  }

  const name =
    stringValue(attributes.name) ??
    stringValue(record.name) ??
    handle;

  const offersBounties =
    booleanToInteger(attributes.offers_bounties) ??
    booleanToInteger(attributes.offers_bounty) ??
    booleanToInteger(relationships.structured_scopes);

  return {
    id: `hackerone:${handle}`,
    platform: "hackerone",
    handle,
    name,
    offers_bounties: offersBounties,
    submission_state: stringValue(attributes.submission_state) ?? stringValue(record.submission_state),
    raw_json: JSON.stringify(raw),
    synced_at: syncedAt,
  };
}

export function upsertHackerOnePrograms(
  db: Database.Database,
  rawPrograms: unknown[],
  syncedAt: string = new Date().toISOString(),
): HackerOneProgramRow[] {
  const rows = rawPrograms.map((program) => normalizeHackerOneProgram(program, syncedAt));
  const stmt = db.prepare(`
    INSERT INTO programs (id, platform, handle, name, offers_bounties, submission_state, raw_json, synced_at)
    VALUES (@id, @platform, @handle, @name, @offers_bounties, @submission_state, @raw_json, @synced_at)
    ON CONFLICT(id) DO UPDATE SET
      platform = excluded.platform,
      handle = excluded.handle,
      name = excluded.name,
      offers_bounties = excluded.offers_bounties,
      submission_state = excluded.submission_state,
      raw_json = excluded.raw_json,
      synced_at = excluded.synced_at
  `);

  const tx = db.transaction((items: HackerOneProgramRow[]) => {
    for (const item of items) stmt.run(item);
  });
  tx(rows);

  return rows;
}

export function searchPrograms(db: Database.Database, filters: SearchProgramsFilters = {}): HackerOneProgramRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.platform) {
    where.push("platform = @platform");
    params.platform = filters.platform;
  }

  if (filters.query) {
    where.push("(LOWER(handle) LIKE @query OR LOWER(COALESCE(name, '')) LIKE @query)");
    params.query = `%${filters.query.toLowerCase()}%`;
  }

  if (filters.bounty_only) {
    where.push("offers_bounties = 1");
  }

  const sql = `
    SELECT id, platform, handle, name, offers_bounties, submission_state, raw_json, synced_at
    FROM programs
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY platform ASC, handle ASC
  `;

  return db.prepare(sql).all(params) as HackerOneProgramRow[];
}

export class HackerOneClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly username: string,
    private readonly token: string,
    fetchImpl: FetchLike = fetch,
  ) {
    this.fetchImpl = fetchImpl;
  }

  async fetchPrograms(): Promise<unknown[]> {
    const programs: unknown[] = [];
    let nextUrl: string | null = HACKERONE_PROGRAMS_URL;

    while (nextUrl) {
      const res = await this.fetchImpl(nextUrl, {
        headers: {
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${this.username}:${this.token}`).toString("base64")}`,
        },
      });

      if (!res.ok) {
        throw new Error(`HackerOne programs request failed with HTTP ${res.status}`);
      }

      const body = (await res.json()) as HackerOneProgramApiResponse;
      if (Array.isArray(body.data)) programs.push(...body.data);
      nextUrl = body.links?.next ?? null;
    }

    return programs;
  }
}
