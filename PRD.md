# PRD — BountyBrain

## 1. Contexto e motivação

Existe o **H1Brain** (`PatrikFehrenbach/h1-brain`): um MCP server que conecta um agente de IA à conta HackerOne do pesquisador, sincroniza programas/scopes/reports recompensados num SQLite local, e expõe uma tool `hack(handle)` que gera um briefing ofensivo cruzando scope atual, histórico pessoal de findings, padrões de weakness que já pagaram, e disclosures públicos.

Não existe equivalente maduro do mesmo padrão para **Intigriti, Bugcrowd e YesWeHack**. Ferramentas como `bbscope`, `bounty-targets-data` e `rix4uni/scope` resolvem só a fatia de **scope público agregado** — não guardam histórico pessoal de reports, não têm memória de conta, não geram briefing.

**BountyBrain** nasce para ser esse "cérebro" multi-plataforma: um MCP + skill, com schema unificado, começando por HackerOne (API madura) e YesWeHack (API real, mas com particularidades de auth), com Bugcrowd/Intigriti como adapters futuros.

## 2. Objetivo

Dar a um agente de IA (Pi, Claude Code, Claude Desktop, qualquer client MCP) acesso consultável e persistente a:

- programas acessíveis ao pesquisador em cada plataforma;
- scopes (in-scope / out-of-scope) por programa;
- reports pessoais recompensados (histórico próprio);
- uma tool de briefing (`hack(platform, handle)`) que cruza scope atual + histórico pessoal por programa.

Tudo **somente leitura** — nenhuma ação de escrita (comentário, mudança de status, submissão de report) em nenhuma plataforma. Isso é território humano, propositalmente fora do escopo do MCP.

## 3. Não-objetivos (explícitos, por decisão do grill)

- Não é um scraper de scope público agregando "todo mundo" (isso já existe: bbscope, bounty-targets-data). O foco é a conta autenticada do pesquisador.
- Sem base de disclosures públicas no MVP (feature do H1Brain que fica para uma Fase 2 explícita, não bloqueia o MVP).
- Sem escrita/comentário/report em nenhuma plataforma, em nenhuma fase.
- Sem login automatizado (email+senha+TOTP) para YesWeHack no MVP — decisão explícita de segurança.
- Sem publicação no npm por enquanto.
- Sem acoplamento a outro repositório (Raijū, mysecrettools) — projeto standalone.

## 4. Decisões de arquitetura (log do grill)

| # | Decisão |
|---|---------|
| 1 | MCP (engine com tools + SQLite) **+** skill (orquestração de uso/fluxo) — não só um ou outro. |
| 2 | Ordem de entrega do MVP: **HackerOne primeiro** (API estável, PAT simples) → **YesWeHack em seguida** → Bugcrowd/Intigriti como adapters futuros. |
| 3 | Autenticação YesWeHack: **Bearer token manual**, colado pelo usuário. Sem guardar senha/TOTP secret (evita ter o segundo fator inteiro em disco). |
| 4 | Detecção de token expirado: reativa via `401` da API + tool `check_auth(platform)` para checagem proativa + log local (fora do harness) da última vez que o token funcionou, para aprendermos o TTL real na prática (não documentado publicamente). |
| 5 | Repositório próprio, standalone: `/Users/wellpunk/Projects/bountybrain`. Open source, licença **MIT**. |
| 6 | Stack: **TypeScript**, usando o SDK oficial `@modelcontextprotocol/sdk` (padrão de fato do ecossistema MCP hoje). |
| 7 | Schema **unificado multi-plataforma** (`programs`, `scopes`, `reports` com coluna `platform`), com campo `raw_json` por registro para preservar fidelidade de dados específicos de cada plataforma sem forçar todo mundo no mesmo formato. |
| 8 | Superfície de tools: **sync prefixado por plataforma** (`hackerone_sync_programs`, `yeswehack_sync_scopes`, ...) porque a autenticação e paginação diferem de verdade; **busca/briefing unificados** com `platform?` opcional (`search_programs`, `search_scopes`, `search_reports`, `hack(platform, handle)`, `check_auth(platform)`) para permitir consulta cross-platform. |
| 9 | Sem base de disclosures públicas (H1Brain tem 3.600+ reports públicos pré-carregados) no MVP — vira **Fase 2** explícita, opcional, não bloqueia o core. |
| 10 | **Somente leitura.** Nenhuma tool de escrita (comentário, mudança de status, submissão) em nenhuma plataforma, em nenhuma fase prevista. |
| 11 | Credenciais em **um único arquivo** `~/.config/bountybrain/secrets.env`, prefixado por plataforma (`HACKERONE_USERNAME`, `HACKERONE_TOKEN`, `YESWEHACK_TOKEN`), permissão `600`, nunca versionado, nunca logado. |
| 12 | Skill mora **dentro do próprio repo**, em `skills/bug-bounty/bountybrain/SKILL.md`, seguindo o padrão do ecossistema `npx skills` (`mattpocock/skills`), para instalação cross-agent (`npx skills add <owner>/bountybrain`). |
| 13 | Testes: **unitários com mocks** das APIs (HackerOne/YesWeHack). Nenhuma credencial real em CI. Validação manual real (contra API de verdade) é checklist de release, não pipeline automatizado. |
| 14 | Distribuição: **sem publicar no npm por enquanto**. Uso via clone + build local + registro manual do MCP no client (Pi, Claude Desktop, Claude Code). Publicação no npm fica para quando HackerOne + YesWeHack estiverem estáveis e testados de verdade. |

## 5. Schema de dados (proposta)

```sql
-- programs: um programa de bug bounty em uma plataforma
CREATE TABLE programs (
  id TEXT PRIMARY KEY,             -- "{platform}:{handle}"
  platform TEXT NOT NULL,          -- 'hackerone' | 'yeswehack' | 'bugcrowd' | 'intigriti'
  handle TEXT NOT NULL,            -- slug/handle na plataforma
  name TEXT,
  offers_bounties INTEGER,
  submission_state TEXT,
  raw_json TEXT,                   -- payload bruto original da API
  synced_at TEXT
);

-- scopes: assets in/out of scope de um programa
CREATE TABLE scopes (
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

-- reports: reports pessoais recompensados/enviados pelo pesquisador
CREATE TABLE reports (
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

-- auth_state: última verificação de auth por plataforma (para TTL/observabilidade, nunca guarda o token)
CREATE TABLE auth_state (
  platform TEXT PRIMARY KEY,
  last_verified_at TEXT,
  last_failed_at TEXT,
  notes TEXT
);
```

## 6. Superfície de tools MCP (MVP)

### HackerOne (auth: username + PAT em `secrets.env`)
- `hackerone_sync_programs()`
- `hackerone_sync_scopes(handle)`
- `hackerone_sync_reports()` — reports pessoais recompensados

### YesWeHack (auth: Bearer token manual em `secrets.env`)
- `yeswehack_sync_programs()`
- `yeswehack_sync_scopes(handle)`
- `yeswehack_sync_reports()`

### Unificadas (cross-platform, `platform` opcional)
- `search_programs(platform?, query?, bounty_only?)`
- `search_scopes(platform?, program?, asset?, bounty_only?)`
- `search_reports(platform?, program?, weakness?, severity?)`
- `hack(platform, handle)` — briefing: scope atual + histórico pessoal naquele programa
- `check_auth(platform)` — verifica se o token/credencial configurado ainda é válido, sem gastar uma chamada de negócio

## 7. Fluxo de autenticação

**HackerOne**
1. Usuário gera PAT em `hackerone.com/settings/api_token/edit`.
2. Salva em `~/.config/bountybrain/secrets.env`:
   ```env
   HACKERONE_USERNAME=...
   HACKERONE_TOKEN=...
   ```
3. Tools funcionam direto, sem lógica de expiração conhecida (PAT é estável).

**YesWeHack**
1. Usuário loga manualmente (com 2FA) e obtém um Bearer token de sessão.
2. Salva em `~/.config/bountybrain/secrets.env`:
   ```env
   YESWEHACK_TOKEN=...
   ```
3. Se uma tool receber `401`, ou `check_auth('yeswehack')` falhar: o MCP retorna instrução clara pedindo para regenerar o token manualmente. **Nunca tenta logar sozinho.**
4. Cada verificação bem-sucedida atualiza `auth_state.last_verified_at`; cada falha atualiza `last_failed_at` — isso nos dá dado real de quanto tempo o token dura na prática, já que a plataforma não documenta TTL publicamente.

## 8. Estrutura do repositório

```text
bountybrain/
├── LICENSE                          # MIT
├── PRD.md                           # este documento
├── README.md
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts                    # entrypoint MCP
│   ├── db/
│   │   ├── schema.ts
│   │   └── client.ts
│   └── platforms/
│       ├── hackerone.ts
│       ├── yeswehack.ts
│       ├── bugcrowd.ts              # stub, Fase futura
│       └── intigriti.ts             # stub, Fase futura
├── test/
│   └── *.test.ts                    # unitários com mocks de API
└── skills/
    └── bug-bounty/
        └── bountybrain/
            └── SKILL.md
```

## 9. Roadmap

- **Fase 1 (MVP):** adapter HackerOne completo (sync programs/scopes/reports, read-only) + schema unificado + `hack()` + `check_auth()`.
- **Fase 2:** adapter YesWeHack completo (Bearer manual, detecção de expiração, log de TTL observado).
- **Fase 3:** base de disclosures públicas (opcional, processo separado de população do SQLite).
- **Fase 4:** adapters Bugcrowd e Intigriti.
- **Fase 5 (talvez):** publicação no npm, quando estável.

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Vazamento de credenciais (PAT/token) | Arquivo único fora do repo, permissão `600`, nunca logado, nunca no SQLite, `.gitignore` explícito. |
| TTL do token YesWeHack desconhecido | Log local de `last_verified_at`/`last_failed_at` para aprender o padrão real ao longo do uso. |
| Ação destrutiva acidental numa plataforma | Read-only por design — nenhuma tool de escrita existe no código, não é uma questão de permissão configurável. |
| Divergência de schema entre plataformas | Campo `raw_json` por registro preserva o dado bruto mesmo quando o schema comum não captura tudo. |
