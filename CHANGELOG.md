# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- HackerOne report sync and search: `hackerone_sync_reports` fetches the
  authenticated researcher's personal reports from the HackerOne API and
  upserts them into the local `reports` table; `search_reports` queries them
  by `platform`, `program`, `weakness` (substring), and `severity` (exact),
  independently or combined. Closes #5.

- HackerOne scope sync and search: `hackerone_sync_scopes(handle)` fetches a
  program's structured scopes (in-scope/out-of-scope assets) from the
  HackerOne API and upserts them into the local `scopes` table; `search_scopes`
  queries them by `platform`, `program`, `asset` substring, and
  `bounty_only`, independently or combined. Closes #4.

### Security

- Bumped `vitest` devDependency from `^2.1.0` to `^3.2.6`, pulling in patched
  transitive `vite` (`5.4.21` → `7.3.6`) and `esbuild` (`0.21.5` → `0.28.1`).
  Resolves 5 Dependabot alerts: esbuild dev-server CORS (#1), vite path
  traversal in `.map` handling (#2), vite `server.fs.deny` bypass on Windows
  (#4), vite/launch-editor NTLMv2 hash disclosure on Windows (#5), and the
  critical vitest UI arbitrary file read/exec issue (#3). `npm audit` reports
  0 vulnerabilities after the bump.
