import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema.js";

/**
 * Opens (or creates) the BountyBrain SQLite database at `path` and applies
 * the unified schema. Pass ":memory:" for an ephemeral/test database.
 */
export function createDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return db;
}
