# CodeLens — System Architecture

> Last updated: 2026-08-20

## 1. High-Level Overview

CodeLens is an AI-powered GitHub PR review engine. When a PR is opened on a
connected repo, a webhook fires, triggering a background job that:

1. Fetches the PR diff from GitHub
2. Retrieves relevant codebase context from a vector store
3. Sends the diff + context to an LLM for analysis
4. Posts review comments back on the PR

```
┌──────────────┐    webhook     ┌──────────────┐    event     ┌──────────────┐
│   GitHub     │ ──────────────>│  Next.js API │ ──────────>  │   Inngest    │
│   (PR open)  │                │  /api/webhooks│             │  (bg jobs)   │
└──────────────┘                └──────────────┘              └──────┬───────┘
                                                                     │
                           ┌─────────────────────────────────────────┤
                           │                                         │
                           ▼                                         ▼
                    ┌──────────────┐                          ┌──────────────┐
                    │  runReview() │                          │   Pinecone   │
                    │  (engine.ts) │◄─── retrieves context ──│ (vector DB)  │
                    └──────┬───────┘                          └──────────────┘
                           │
                           ▼
                    ┌──────────────┐         ┌──────────────┐
                    │  LLM Call    │         │  PostgreSQL  │
                    │  (AI SDK)    │         │  (Prisma)    │
                    └──────┬───────┘         └──────▲───────┘
                           │                        │
                           ▼                        │
                    ┌──────────────┐    stores       │
                    │  Post to     │────review──────►│
                    │  GitHub PR   │
                    └──────────────┘
```

## 2. Component Map

### 2.1 Web Layer (`app/`)

```
app/
├── (auth)/              → Login/signup pages (better-auth + GitHub OAuth)
├── api/
│   ├── webhooks/github/ → PR webhook receiver → fires Inngest events
│   ├── auth/            → better-auth API routes
│   └── inngest/         → Inngest serve endpoint
├── dashboard/           → Authenticated user dashboard (repos, reviews, settings)
├── demo/                → Public demo page (rate-limited, no auth)
├── page.tsx             → Landing page
└── layout.tsx           → Root layout (providers, fonts, theme)
```

### 2.2 Domain Modules (`module/`)

Each module owns a domain concern. Structure: `module/<name>/lib/` for logic,
`module/<name>/action/` for Next.js server actions.

| Module | Responsibility | Key files |
| ------ | -------------- | --------- |
| `ai` | LLM provider abstraction, embeddings, RAG retrieval | `lib/models.ts`, `lib/rag.ts` |
| `review` | Review pipeline orchestration | `lib/engine.ts` |
| `github` | GitHub API (Octokit): repos, PRs, diffs, webhooks, comments | `lib/github.ts` |
| `auth` | Authentication config (better-auth) | `lib/` |
| `dashboard` | Dashboard server actions | `action/index.ts` |
| `repository` | Repository CRUD + connection flow | `action/` |
| `payment` | Polar.sh payment integration | `action/` |
| `settings` | User settings management | `action/` |

### 2.3 Background Jobs (`inngest/functions/`)

| Function | Trigger | Pipeline |
| -------- | ------- | -------- |
| `generateReview` | `pr.review.requested` | fetch diff → `runReview()` → post comment → store in DB |
| `indexRepo` | `repository.connected` | fetch all files → embed each → upsert to Pinecone |
| `generateDemoReview` | `demo.review.requested` | same as review but rate-limited, no repo context |

### 2.4 Data Layer

**PostgreSQL (Prisma):**
- `User` → `Account` (GitHub OAuth tokens)
- `User` → `Repository` → `Review`
- `UserUsage` (rate limiting / plan enforcement)
- `DemoReview`, `DemoAttempt` (public demo rate limiting)

**Pinecone (Vector DB):**
- One vector per file (repoId + path as metadata)
- Queried per-hunk during review for relevant context
- Indexed once at repo connect (no re-indexing yet)

## 3. Data Flow: PR Review (detailed)

```
1. GitHub sends POST /api/webhooks/github
   └── payload: { action: "opened", pull_request: { number, title, body, ... } }

2. Webhook handler extracts { owner, repo, prNumber, userId }
   └── fires Inngest event: "pr.review.requested"

3. Inngest picks up event → generateReview function
   ├── Step 1 "fetch-pr-diff":
   │   ├── Look up user's GitHub token from DB
   │   └── Call GitHub API for PR diff + metadata
   │
   ├── Step 2 "run-review-engine":
   │   └── runReview({ diff, title, description, repoId })
   │       ├── Parse diff into hunks (parseUnifiedDiff)
   │       ├── Embed each hunk → query Pinecone → get relevant file blobs
   │       ├── Build prompt: system instruction + context + diff
   │       └── Call LLM via generateTextWithFallback()
   │           └── Tries primary provider → google → groq → openai (circuit breaker)
   │
   ├── Step 3 "post-comment":
   │   └── postReviewComment() → issues.createComment (single comment, NOT inline)
   │
   └── Step 4 "store-review-db":
       └── prisma.review.create({ repositoryId, prNumber, review: markdownBlob })
```

## 4. Data Flow: Repository Indexing

```
1. User connects a repo in the dashboard
   └── fires Inngest event: "repository.connected"

2. Inngest → indexRepo function
   ├── Step 1 "fetch-files":
   │   ├── Get repo tree via git.getTree (recursive)
   │   ├── Filter: skip binaries, node_modules, lock files (extension-based only)
   │   └── Fetch each blob's content via git.getBlob (concurrency: 10)
   │
   ├── Step 2 "index-codebase":
   │   ├── For each file: embed "File: {path}\n\n{content}" (truncated 8000 chars)
   │   └── Upsert vectors to Pinecone in batches of 100
   │
   └── Step 3 "update-repo-metadata":
       └── Update repository.indexedFileCount in DB
```

## 5. Authentication Flow

```
User → GitHub OAuth (better-auth) → Account created with accessToken
     → accessToken stored in Account table
     → Used for all GitHub API calls (both user-initiated and background jobs)
```

## 6. Provider Abstraction (AI layer)

```
              ┌─────────────────────────────────┐
              │  getLanguageModel()              │
              │  reads AI_PROVIDER env var       │
              ├──────────┬──────────┬────────────┤
              │  google  │  openai  │   groq     │
              └──────────┴──────────┴────────────┘

              ┌─────────────────────────────────┐
              │  getEmbeddingModel()             │
              │  reads AI_EMBEDDING_PROVIDER     │
              ├──────────┬──────────┬────────────┤
              │  google  │  openai  │ huggingface│
              └──────────┴──────────┴────────────┘

generateTextWithFallback():
  try primary → try google → try groq → try openai → throw
  (circuit breaker pattern — zero-downtime failover)
```

## 7. Planned Target Architecture

### 7.1 Multi-Agent Review Pipeline (D-011, D-014)

```
PR webhook → fetch diff
  │
  ├──► [ORCHESTRATOR] Detect large PR → split by file if needed
  │    ├── Filter noise files (lock, generated, snapshots)
  │    ├── Structure scan (file names + hunk headers) → walkthrough (parallel)
  │    └── Dispatch per-file-group review agents (parallel)
  │
  ├──► [INVESTIGATOR] Deterministic-first, optionally agentic (D-011)
  │    │
  │    │  ALWAYS (zero LLM cost):
  │    ├── Parse diff → identify modified line ranges
  │    ├── SQL: which Symbols overlap these ranges?
  │    ├── SQL: getCallers(symbol) — "who depends on this?"
  │    ├── SQL: getCallees(symbol) — "what does this call?"
  │    ├── Pinecone: vector search for semantically similar code
  │    ├── Rank by impact table (production callers > tests)
  │    │
  │    │  OPTIONAL (full mode only, 1-2 extra LLM calls):
  │    ├── ReAct loop: LLM reasons about evidence gaps
  │    └── Calls graph tools for additional context (max 3 iterations)
  │
  ├──► [PROSECUTOR] Generate structured findings (generateObject + Zod)
  │    └── One finding at a time on curated evidence, not "review the whole diff"
  │
  ├──► [DEFENSE] Adversarial verify (D-009, D-014)
  │    ├── full/standard mode: 3× verify with majority vote
  │    │   ├── Lens 1: Correctness — "Is this actually a bug?"
  │    │   ├── Lens 2: Security — "Is this a real vulnerability?"
  │    │   ├── Lens 3: Runtime-reality — "Would this actually fail in production?"
  │    │   └── Default to refuted on tie. Confidence = notRefuted / 3.
  │    └── fast mode: 1× verify (existing adversarial logic)
  │
  ├──► [JUDGE] Deterministic gates
  │    ├── Existence check: file must be in PR's changed-files list
  │    ├── Line check: startLine must be inside a changed hunk
  │    ├── Symbol check: cited symbols must exist in the symbol table
  │    └── Dedup: merge findings by (file, line, category)
  │
  └──► Post inline PR comments via pulls.createReview API
       └── Each finding = one inline comment with severity + confidence badge
```

### 7.2 Review Mode Tiers (D-014)

| Mode | LLM Calls | When | Graph Context? |
| ---- | --------- | ---- | -------------- |
| `fast` | 2 (Prosecutor + 1× Defense) | Weak models, free-tier rate limits | ✅ Yes (SQL) |
| `standard` | 4 (Prosecutor + 3× Defense) | Medium models (Gemini Flash, Llama 8B) | ✅ Yes (SQL) |
| `full` | 5-6 (ReAct + Prosecutor + 3× Defense) | Strong models (Gemini Pro, Llama 70B+) | ✅ Yes (SQL + agent) |

All modes benefit from the Code Knowledge Graph. The graph traversal is pure SQL — zero LLM cost. Only the verification/agentic passes scale with model budget.

### 7.3 Code Intelligence Layer — Hybrid Indexer (D-008, D-013)

```
At indexing time (repository.connected):

  Files fetched from GitHub
    │
    ├── Language router
    │   │
    │   ├── .ts/.tsx/.js/.jsx/.py → GRAPH PATH
    │   │   │
    │   │   ├── web-tree-sitter parses each file
    │   │   │
    │   │   ├── Language adapter extracts raw facts:
    │   │   │   ├── Symbols: functions, classes, methods, interfaces
    │   │   │   ├── Imports: import statements with source paths
    │   │   │   └── Calls: call expressions with identifiers
    │   │   │
    │   │   ├── 3-Tier Resolver stitches cross-file edges:
    │   │   │   ├── Tier 1 — Deterministic (import + call = proven edge)
    │   │   │   ├── Tier 2 — Heuristic (constructor injection → inferred)
    │   │   │   └── Tier 3 — Native analysis (optional, future)
    │   │   │
    │   │   ├── Store in Prisma:
    │   │   │   ├── Symbol { qualifiedName, codeBody, kind, isTest, isExported }
    │   │   │   └── Edge { kind, provenance, weight }
    │   │   │
    │   │   └── Store in Pinecone:
    │   │       └── One vector per Symbol (metadata: { type: 'symbol', symbolId })
    │   │
    │   └── all other extensions → CHUNK PATH (fallback)
    │       ├── Split into 500-token text chunks
    │       └── Store in Pinecone (metadata: { type: 'chunk', path })
    │
    └── Update repository.graphBuiltAt timestamp

At review time:

  Diff hunks → identify modified symbols (line range overlap with Symbol table)
    │
    ├── Lexical: SQL ILIKE on Symbol.name for exact identifiers
    ├── Vector: Pinecone search for semantically similar symbols/chunks
    ├── Graph: Edge table traversal — callers, callees, implementors
    │
    └── Merge, deduplicate by symbolId, rank by impact priority
        └── Feed top ~10 as labeled evidence to the Prosecutor
```

### 7.4 Graph Schema (D-012)

```
Symbol (nodes)
  ├── qualifiedName    "PaymentService.charge"
  ├── codeBody         Full source text of the symbol
  ├── kind             function | class | method | interface | ...
  ├── isTest           Deprioritize in impact ranking
  ├── isExported       Public API surface marker
  └── language         typescript | python | ...

Edge (relationships)
  ├── kind             CALLS | IMPORTS | EXTENDS | IMPLEMENTS | CONTAINS | TESTS | USES
  ├── provenance       EXTRACTED | RESOLVED | INFERRED
  └── weight           Impact ranking (1.0 = direct caller, 0.5 = indirect)
```

### 7.5 Supported Languages

| Language | Grammar | Adapter | Resolution Quality |
| -------- | ------- | ------- | ------------------ |
| TypeScript / TSX | `tree-sitter-typescript` WASM | Full | Tier 1 + Tier 2 |
| JavaScript / JSX | `tree-sitter-javascript` WASM | Full | Tier 1 + Tier 2 |
| Python | `tree-sitter-python` WASM | Basic | Tier 1 |
| All others | N/A | Fallback to text chunking | N/A |

## 8. What Is NOT In Scope

| Component | Why skipped |
| --------- | ----------- |
| Skill/rules export (Phase 1.5) | Doesn't demo well in interviews |
| Deterministic analyzers (Phase 2) | Nice-to-have, not priority for CV impact |
| Repo audit mode (Phase 4.5) | Too much UI/infra for the timeline |
| Re-indexing on push (Phase 7) | Operational concern, not impressive for CV |
| Heavy analyzers in Docker (Phase 8) | Too much infra |
| Tier 3 native analysis (tsc, pyright) | Future optimization, not v1 |
