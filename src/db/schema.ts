// Unified multi-platform schema (see PRD.md section 5).
// Each table carries a `platform` column and preserves the raw API payload
// in `raw_json` so platform-specific fields are never silently lost.

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,             -- "{platform}:{handle}"
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  name TEXT,
  offers_bounties INTEGER,
  submission_state TEXT,
  raw_json TEXT,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS scopes (
  id TEXT PRIMARY KEY,             -- "{platform}:{program_handle}:{asset_identifier}"
  platform TEXT NOT NULL,
  program_handle TEXT NOT NULL,
  asset_identifier TEXT,
  asset_type TEXT,
  eligible_for_bounty INTEGER,
  eligible_for_submission INTEGER,
  max_severity TEXT,
  instruction TEXT,
  raw_json TEXT,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,             -- "{platform}:{report_id}"
  platform TEXT NOT NULL,
  program_handle TEXT,
  title TEXT,
  state TEXT,
  severity_rating TEXT,
  weakness_name TEXT,
  weakness_cwe TEXT,
  bounty_amount REAL DEFAULT 0,
  bounty_currency TEXT,
  vulnerability_information TEXT,
  created_at TEXT,
  bounty_awarded_at TEXT,
  disclosed_at TEXT,
  raw_json TEXT,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_state (
  platform TEXT PRIMARY KEY,       -- never stores the token/credential itself
  last_verified_at TEXT,
  last_failed_at TEXT,
  notes TEXT
);
`;
