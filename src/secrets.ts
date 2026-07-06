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

const DEFAULT_SECRETS_PATH = `${process.env.HOME ?? ""}/.config/bountybrain/secrets.env`;

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
