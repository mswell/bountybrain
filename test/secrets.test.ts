import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRequiredSecrets, loadSecrets, SecretsPermissionError } from "../src/secrets.js";

describe("loadSecrets", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("parses platform-prefixed KEY=VALUE pairs from a 600 file", () => {
    dir = mkdtempSync(join(tmpdir(), "bountybrain-secrets-"));
    const file = join(dir, "secrets.env");
    writeFileSync(
      file,
      ["HACKERONE_USERNAME=alice", "HACKERONE_TOKEN=abc123", "# a comment", "", "YESWEHACK_TOKEN=xyz"].join("\n")
    );
    chmodSync(file, 0o600);

    const secrets = loadSecrets(file);

    expect(secrets).toEqual({
      HACKERONE_USERNAME: "alice",
      HACKERONE_TOKEN: "abc123",
      YESWEHACK_TOKEN: "xyz",
    });
  });

  it("returns an empty object when the file does not exist", () => {
    dir = mkdtempSync(join(tmpdir(), "bountybrain-secrets-"));
    const file = join(dir, "missing.env");

    expect(loadSecrets(file)).toEqual({});
  });

  it("refuses to load a file with permissions looser than 600", () => {
    dir = mkdtempSync(join(tmpdir(), "bountybrain-secrets-"));
    const file = join(dir, "secrets.env");
    writeFileSync(file, "HACKERONE_TOKEN=abc123");
    chmodSync(file, 0o644);

    expect(() => loadSecrets(file)).toThrow(SecretsPermissionError);
  });

  it("never includes the raw file content in the permission error message", () => {
    dir = mkdtempSync(join(tmpdir(), "bountybrain-secrets-"));
    const file = join(dir, "secrets.env");
    writeFileSync(file, "HACKERONE_TOKEN=super-secret-value");
    chmodSync(file, 0o644);

    try {
      loadSecrets(file);
      throw new Error("expected loadSecrets to throw");
    } catch (err) {
      expect(String((err as Error).message)).not.toContain("super-secret-value");
    }
  });

  it("returns a tool-facing error when required secrets are missing", () => {
    dir = mkdtempSync(join(tmpdir(), "bountybrain-secrets-"));
    const file = join(dir, "secrets.env");
    writeFileSync(file, "HACKERONE_USERNAME=alice");
    chmodSync(file, 0o600);

    expect(loadRequiredSecrets(["HACKERONE_USERNAME", "HACKERONE_TOKEN"], file)).toEqual({
      ok: false,
      message: `Missing HACKERONE_TOKEN in ${file}`,
    });
  });

  it("turns unsafe secret-file permissions into a tool-facing error", () => {
    dir = mkdtempSync(join(tmpdir(), "bountybrain-secrets-"));
    const file = join(dir, "secrets.env");
    writeFileSync(file, "HACKERONE_TOKEN=super-secret-value");
    chmodSync(file, 0o644);

    const result = loadRequiredSecrets(["HACKERONE_TOKEN"], file);

    expect(result.ok).toBe(false);
    expect(result.message).toContain(`Refusing to read ${file}`);
    expect(result.message).not.toContain("super-secret-value");
  });
});
