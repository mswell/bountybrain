# BountyBrain

MCP server that syncs your bug bounty programs, scopes, and rewarded reports
across HackerOne, YesWeHack, and (future) Bugcrowd/Intigriti into a local
SQLite "brain" — read-only, no writes back to any platform.

See [`PRD.md`](./PRD.md) for the full product/architecture rationale.

## Status

Early HackerOne tracer bullet. The server currently has:

- `ping`
- `check_auth`
- `hackerone_sync_programs`
- `search_programs`
- `hackerone_sync_scopes`
- `search_scopes`

See [issue #1](https://github.com/mswell/bountybrain/issues/1) for the roadmap.

## Requirements

- Node.js >= 18

## Install

```sh
git clone https://github.com/mswell/bountybrain.git
cd bountybrain
npm install
npm run build
```

Not published to npm — install from source.

## Configuration

Credentials are read from a single file, never committed to the repo:

```sh
mkdir -p ~/.config/bountybrain
$EDITOR ~/.config/bountybrain/secrets.env
chmod 600 ~/.config/bountybrain/secrets.env
```

```env
HACKERONE_USERNAME=...
HACKERONE_TOKEN=...
YESWEHACK_TOKEN=...
```

The server refuses to read this file if its permissions are looser than `600`.
Secrets are never logged and never persisted to the SQLite database.

## Running

```sh
npm start
```

Registers as a standard stdio MCP server — add it to your MCP client
(Pi, Claude Desktop, Claude Code, etc.) config pointing at `dist/server.js`.

## Tools

### `check_auth`

Validates configured platform credentials and records the result in the local
SQLite `auth_state` table without storing any credential values.

Inputs:

- `platform` required string. Currently supported: `hackerone`

For HackerOne, this performs a lightweight read-only request to
`GET /hackers/programs?page[size]=1`. It does not call any write-capable
HackerOne endpoint.

### `hackerone_sync_programs`

Read-only sync of the authenticated researcher's accessible HackerOne programs
into the local SQLite `programs` table.

Requirements:

- `HACKERONE_USERNAME` in `~/.config/bountybrain/secrets.env`
- `HACKERONE_TOKEN` in `~/.config/bountybrain/secrets.env`
- `secrets.env` mode set to `600`

This tool only reads from HackerOne. It does not write, comment, change status,
submit reports, or mutate any platform-side data.

### `search_programs`

Searches locally synced programs. It does not call HackerOne.

Inputs:

- `platform` optional string, for example `hackerone`
- `query` optional substring matched against handle or name
- `bounty_only` optional boolean

Example filter:

```json
{
  "platform": "hackerone",
  "query": "acme",
  "bounty_only": true
}
```

### `hackerone_sync_scopes`

Read-only sync of a HackerOne program's in-scope/out-of-scope assets (structured
scopes) into the local SQLite `scopes` table.

Inputs:

- `handle` required string — the HackerOne program handle, e.g. `acme`

Requirements: same `HACKERONE_USERNAME`/`HACKERONE_TOKEN`/`600` permissions as
`hackerone_sync_programs`. Read-only — does not write, comment, or mutate any
platform-side data.

### `search_scopes`

Searches locally synced scopes. It does not call HackerOne.

Inputs:

- `platform` optional string, for example `hackerone`
- `program` optional exact match on program handle
- `asset` optional substring matched against the asset identifier
- `bounty_only` optional boolean

Example filter:

```json
{
  "program": "acme",
  "asset": "api",
  "bounty_only": true
}
```

## Manual Validation Checklist

Before release, run one live read-only validation against a real HackerOne
researcher account:

1. Create `~/.config/bountybrain/secrets.env` with `HACKERONE_USERNAME` and
   `HACKERONE_TOKEN`.
2. Run `chmod 600 ~/.config/bountybrain/secrets.env`.
3. Run `npm run build`.
4. Start the MCP server with `npm start` through a local MCP client.
5. Call `check_auth` with `platform = "hackerone"` and confirm it returns
   `valid: true`.
6. Confirm the SQLite `auth_state` row has `last_verified_at` set and does not
   contain the HackerOne token in `notes`.
7. Call `hackerone_sync_programs`.
8. Call `search_programs` with no filters and confirm program rows are returned.
9. Call `search_programs` with `platform`, `query`, and `bounty_only` filters
   independently and combined.
10. Confirm the SQLite `programs.raw_json` field preserves the source payload.
11. Call `hackerone_sync_scopes` with a real program handle.
12. Call `search_scopes` with no filters and confirm scope rows are returned.
13. Call `search_scopes` with `platform`, `program`, `asset`, and `bounty_only`
    filters independently and combined.
14. Confirm the SQLite `scopes.raw_json` field preserves the source payload.

Do not use production automation credentials in CI. The automated test suite
uses mocked HackerOne API responses only.

## Development

```sh
npm run dev     # run src/server.ts directly via tsx
npm test        # run the vitest suite
```

## License

MIT — see [`LICENSE`](./LICENSE).
