import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

describe("server startup", () => {
  let dir = "";
  let child: ChildProcessWithoutNullStreams | undefined;

  afterEach(() => {
    if (child && child.exitCode === null) child.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
    child = undefined;
    dir = "";
  });

  it("does not crash at startup when secrets.env has unsafe permissions", async () => {
    dir = mkdtempSync(join(tmpdir(), "bountybrain-server-"));
    const configDir = join(dir, ".config", "bountybrain");
    mkdirSync(configDir, { recursive: true });
    const secretsFile = join(configDir, "secrets.env");
    writeFileSync(secretsFile, "HACKERONE_TOKEN=super-secret-value\n");
    chmodSync(secretsFile, 0o644);

    const tsx = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
    child = spawn(tsx, ["src/server.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: dir },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(stderr).not.toContain("super-secret-value");
    expect(child.exitCode).toBeNull();
  });
});
