# BountyBrain

MCP server that syncs your bug bounty programs, scopes, and rewarded reports
across HackerOne, YesWeHack, and (future) Bugcrowd/Intigriti into a local
SQLite "brain" — read-only, no writes back to any platform.

See [`PRD.md`](./PRD.md) for the full product/architecture rationale.

## Status

Early scaffolding. No platform adapters or MCP tools are implemented yet
beyond a health check (`ping`). See [issue #1](https://github.com/mswell/bountybrain/issues/1)
for the roadmap.

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

## Development

```sh
npm run dev     # run src/server.ts directly via tsx
npm test        # run the vitest suite
```

## License

MIT — see [`LICENSE`](./LICENSE).
