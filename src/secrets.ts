import { existsSync, readFileSync, statSync } from "node:fs";

/**
 * Thrown when the secrets file exists but has looser permissions than 0600.
 * The message never includes file content — only the path and expected mode.
 */
export class SecretsPermissionError extends Error {
  constructor(path: string) {
    super(`Refusing to read ${path}: expected file mode 600, run "chmod 600 ${path}"`);
    this.name = "SecretsPermissionError";
  }
}

export const DEFAULT_SECRETS_PATH = `${process.env.HOME ?? ""}/.config/bountybrain/secrets.env`;

export type RequiredSecretsResult =
  | { ok: true; secrets: Record<string, string> }
  | { ok: false; message: string };

/**
 * Loads platform-prefixed secrets (e.g. HACKERONE_TOKEN, YESWEHACK_TOKEN)
 * from a KEY=VALUE env file. Returns {} if the file does not exist.
 * Refuses to read (throws SecretsPermissionError) if permissions are looser
 * than 600. Never logs the file content, including in thrown errors.
 */
export function loadSecrets(path: string = DEFAULT_SECRETS_PATH): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o600) {
    throw new SecretsPermissionError(path);
  }

  const contents = readFileSync(path, "utf8");
  const secrets: Record<string, string> = {};

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) secrets[key] = value;
  }

  return secrets;
}

/**
 * Tool-facing secrets loader: returns a clear error for missing or unsafe
 * credentials so one platform integration cannot crash the entire MCP server.
 */
export function loadRequiredSecrets(keys: string[], path: string = DEFAULT_SECRETS_PATH): RequiredSecretsResult {
  let secrets: Record<string, string>;
  try {
    secrets = loadSecrets(path);
  } catch (err) {
    if (err instanceof SecretsPermissionError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }

  const missing = keys.filter((key) => !secrets[key]);
  if (missing.length > 0) {
    return { ok: false, message: `Missing ${missing.join(" or ")} in ${path}` };
  }

  return { ok: true, secrets };
}
