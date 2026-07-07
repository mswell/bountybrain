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

export interface HackerOneScopeRow {
  id: string;
  platform: "hackerone";
  program_handle: string;
  asset_identifier: string;
  asset_type: string | null;
  eligible_for_bounty: number | null;
  eligible_for_submission: number | null;
  max_severity: string | null;
  instruction: string | null;
  raw_json: string;
  synced_at: string;
}

export interface SearchScopesFilters {
  platform?: string;
  program?: string;
  asset?: string;
  bounty_only?: boolean;
}

export interface HackerOneReportRow {
  id: string;
  platform: "hackerone";
  program_handle: string | null;
  title: string | null;
  state: string | null;
  severity_rating: string | null;
  weakness_name: string | null;
  weakness_cwe: string | null;
  bounty_amount: number;
  bounty_currency: string | null;
  vulnerability_information: string | null;
  created_at: string | null;
  bounty_awarded_at: string | null;
  disclosed_at: string | null;
  raw_json: string;
  synced_at: string;
}

export interface SearchReportsFilters {
  platform?: string;
  program?: string;
  weakness?: string;
  severity?: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const HACKERONE_PROGRAMS_URL = "https://api.hackerone.com/v1/hackers/programs";
const HACKERONE_REPORTS_URL = "https://api.hackerone.com/v1/hackers/me/reports";

function hackerOneScopesUrl(handle: string): string {
  return `https://api.hackerone.com/v1/hackers/programs/${handle}/structured_scopes`;
}

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

export function normalizeHackerOneScope(
  raw: unknown,
  programHandle: string,
  syncedAt: string,
): HackerOneScopeRow {
  const record = asRecord(raw);
  const attributes = asRecord(record.attributes);

  const assetIdentifier = stringValue(attributes.asset_identifier);
  if (!assetIdentifier) {
    throw new Error("HackerOne structured scope is missing required asset_identifier");
  }

  return {
    id: `hackerone:${programHandle}:${assetIdentifier}`,
    platform: "hackerone",
    program_handle: programHandle,
    asset_identifier: assetIdentifier,
    asset_type: stringValue(attributes.asset_type),
    eligible_for_bounty: booleanToInteger(attributes.eligible_for_bounty),
    eligible_for_submission: booleanToInteger(attributes.eligible_for_submission),
    max_severity: stringValue(attributes.max_severity),
    instruction: stringValue(attributes.instruction),
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

export function upsertHackerOneScopes(
  db: Database.Database,
  programHandle: string,
  rawScopes: unknown[],
  syncedAt: string = new Date().toISOString(),
): HackerOneScopeRow[] {
  const rows = rawScopes.map((scope) => normalizeHackerOneScope(scope, programHandle, syncedAt));
  const stmt = db.prepare(`
    INSERT INTO scopes (
      id, platform, program_handle, asset_identifier, asset_type,
      eligible_for_bounty, eligible_for_submission, max_severity, instruction, raw_json, synced_at
    )
    VALUES (
      @id, @platform, @program_handle, @asset_identifier, @asset_type,
      @eligible_for_bounty, @eligible_for_submission, @max_severity, @instruction, @raw_json, @synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      platform = excluded.platform,
      program_handle = excluded.program_handle,
      asset_identifier = excluded.asset_identifier,
      asset_type = excluded.asset_type,
      eligible_for_bounty = excluded.eligible_for_bounty,
      eligible_for_submission = excluded.eligible_for_submission,
      max_severity = excluded.max_severity,
      instruction = excluded.instruction,
      raw_json = excluded.raw_json,
      synced_at = excluded.synced_at
  `);

  const tx = db.transaction((items: HackerOneScopeRow[]) => {
    for (const item of items) stmt.run(item);
  });
  tx(rows);

  return rows;
}

export function searchScopes(db: Database.Database, filters: SearchScopesFilters = {}): HackerOneScopeRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.platform) {
    where.push("platform = @platform");
    params.platform = filters.platform;
  }

  if (filters.program) {
    where.push("program_handle = @program");
    params.program = filters.program;
  }

  if (filters.asset) {
    where.push("LOWER(asset_identifier) LIKE @asset");
    params.asset = `%${filters.asset.toLowerCase()}%`;
  }

  if (filters.bounty_only) {
    where.push("eligible_for_bounty = 1");
  }

  const sql = `
    SELECT id, platform, program_handle, asset_identifier, asset_type,
           eligible_for_bounty, eligible_for_submission, max_severity, instruction, raw_json, synced_at
    FROM scopes
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY platform ASC, program_handle ASC, asset_identifier ASC
  `;

  return db.prepare(sql).all(params) as HackerOneScopeRow[];
}

export function normalizeHackerOneReport(raw: unknown, syncedAt: string): HackerOneReportRow {
  const record = asRecord(raw);
  const attributes = asRecord(record.attributes);
  const relationships = asRecord(record.relationships);

  const reportId = stringValue(record.id);
  if (!reportId) {
    throw new Error("HackerOne report is missing required report id");
  }

  // Extract nested relationships
  const severityData = asRecord(asRecord(relationships.severity).data);
  const severityAttrs = asRecord(severityData.attributes);

  const weaknessData = asRecord(asRecord(relationships.weakness).data);
  const weaknessAttrs = asRecord(weaknessData.attributes);

  const programData = asRecord(asRecord(relationships.program).data);
  const programAttrs = asRecord(programData.attributes);

  // Sum bounties
  const bountiesRel = asRecord(relationships.bounties);
  const bountiesArray = Array.isArray(bountiesRel.data) ? bountiesRel.data : [];
  let bountyAmount = 0;
  let bountyCurrency: string | null = null;
  for (const b of bountiesArray) {
    const bAttrs = asRecord(asRecord(b).attributes);
    const amount = parseFloat(String(bAttrs.amount ?? "0")) + parseFloat(String(bAttrs.bonus_amount ?? "0"));
    bountyAmount += amount;
    if (!bountyCurrency) bountyCurrency = stringValue(bAttrs.awarded_currency);
  }

  return {
    id: `hackerone:${reportId}`,
    platform: "hackerone",
    program_handle: stringValue(programAttrs.handle),
    title: stringValue(attributes.title),
    state: stringValue(attributes.state),
    severity_rating: stringValue(severityAttrs.rating),
    weakness_name: stringValue(weaknessAttrs.name),
    weakness_cwe: stringValue(weaknessAttrs.external_id),
    bounty_amount: bountyAmount,
    bounty_currency: bountyCurrency,
    vulnerability_information: stringValue(attributes.vulnerability_information),
    created_at: stringValue(attributes.created_at),
    bounty_awarded_at: stringValue(attributes.bounty_awarded_at),
    disclosed_at: stringValue(attributes.disclosed_at),
    raw_json: JSON.stringify(raw),
    synced_at: syncedAt,
  };
}

export function upsertHackerOneReports(
  db: Database.Database,
  rawReports: unknown[],
  syncedAt: string = new Date().toISOString(),
): HackerOneReportRow[] {
  const rows = rawReports.map((report) => normalizeHackerOneReport(report, syncedAt));
  const stmt = db.prepare(`
    INSERT INTO reports (
      id, platform, program_handle, title, state, severity_rating,
      weakness_name, weakness_cwe, bounty_amount, bounty_currency,
      vulnerability_information, created_at, bounty_awarded_at, disclosed_at, raw_json, synced_at
    )
    VALUES (
      @id, @platform, @program_handle, @title, @state, @severity_rating,
      @weakness_name, @weakness_cwe, @bounty_amount, @bounty_currency,
      @vulnerability_information, @created_at, @bounty_awarded_at, @disclosed_at, @raw_json, @synced_at
    )
    ON CONFLICT(id) DO UPDATE SET
      platform = excluded.platform,
      program_handle = excluded.program_handle,
      title = excluded.title,
      state = excluded.state,
      severity_rating = excluded.severity_rating,
      weakness_name = excluded.weakness_name,
      weakness_cwe = excluded.weakness_cwe,
      bounty_amount = excluded.bounty_amount,
      bounty_currency = excluded.bounty_currency,
      vulnerability_information = excluded.vulnerability_information,
      created_at = excluded.created_at,
      bounty_awarded_at = excluded.bounty_awarded_at,
      disclosed_at = excluded.disclosed_at,
      raw_json = excluded.raw_json,
      synced_at = excluded.synced_at
  `);

  const tx = db.transaction((items: HackerOneReportRow[]) => {
    for (const item of items) stmt.run(item);
  });
  tx(rows);

  return rows;
}

export function searchReports(db: Database.Database, filters: SearchReportsFilters = {}): HackerOneReportRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.platform) {
    where.push("platform = @platform");
    params.platform = filters.platform;
  }

  if (filters.program) {
    where.push("program_handle = @program");
    params.program = filters.program;
  }

  if (filters.weakness) {
    where.push("LOWER(COALESCE(weakness_name, '')) LIKE @weakness");
    params.weakness = `%${filters.weakness.toLowerCase()}%`;
  }

  if (filters.severity) {
    where.push("severity_rating = @severity");
    params.severity = filters.severity;
  }

  const sql = `
    SELECT id, platform, program_handle, title, state, severity_rating,
           weakness_name, weakness_cwe, bounty_amount, bounty_currency,
           vulnerability_information, created_at, bounty_awarded_at, disclosed_at, raw_json, synced_at
    FROM reports
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC
  `;

  return db.prepare(sql).all(params) as HackerOneReportRow[];
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

  async fetchReports(): Promise<unknown[]> {
    const reports: unknown[] = [];
    let nextUrl: string | null = HACKERONE_REPORTS_URL;

    while (nextUrl) {
      const res = await this.fetchImpl(nextUrl, {
        headers: {
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${this.username}:${this.token}`).toString("base64")}`,
        },
      });

      if (!res.ok) {
        throw new Error(`HackerOne reports request failed with HTTP ${res.status}`);
      }

      const body = (await res.json()) as HackerOneProgramApiResponse;
      if (Array.isArray(body.data)) reports.push(...body.data);
      nextUrl = body.links?.next ?? null;
    }

    return reports;
  }

  async fetchScopes(handle: string): Promise<unknown[]> {
    const scopes: unknown[] = [];
    let nextUrl: string | null = hackerOneScopesUrl(handle);

    while (nextUrl) {
      const res = await this.fetchImpl(nextUrl, {
        headers: {
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${this.username}:${this.token}`).toString("base64")}`,
        },
      });

      if (!res.ok) {
        throw new Error(`HackerOne structured scopes request failed with HTTP ${res.status}`);
      }

      const body = (await res.json()) as HackerOneProgramApiResponse;
      if (Array.isArray(body.data)) scopes.push(...body.data);
      nextUrl = body.links?.next ?? null;
    }

    return scopes;
  }
}
