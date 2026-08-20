# CodeLens — AI Agent Guide

> You are an AI coding assistant working on this project. Read this file
> completely before writing any code. This file is model-agnostic — the same
> rules apply whether you are Claude, Gemini, GPT, Llama, or any other model.

---

## Step 0: Orient yourself

Before doing ANYTHING, read these files in order:

1. **This file** — coding rules and workflow
2. **`docs/progress.md`** — what's done, what's in progress, what's next
3. **`docs/decisions.md`** — why we chose what we chose (don't re-litigate)
4. **`docs/architecture.md`** — how every component connects
5. **`REVIEW_ENGINE_PLAN.md`** — the full multi-phase roadmap
6. **The module-level `AGENTS.md`** in whatever directory you're editing

---

## What is this project?

**CodeLens** is an open-source, self-hostable AI code review engine for GitHub PRs.

Core thesis: **the pipeline carries the load, not the model.** We match paid-tool
quality using free/cheap models by making the LLM fill narrow, schema-constrained
roles on curated evidence.

## Stack

| Layer | Technology |
| ----- | ---------- |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Database | PostgreSQL via Prisma ORM (`prisma/schema.prisma`) |
| Vector store | Pinecone (`module/ai/lib/rag.ts`) |
| Background jobs | Inngest (`inngest/functions/`) |
| Auth | better-auth + GitHub OAuth |
| AI SDK | Vercel AI SDK (`ai` package), multi-provider |
| UI | shadcn/ui + Radix + Tailwind v4 |
| Package manager | bun (preferred) or npm |

## Project layout

```
docs/                 → Living docs (architecture, decisions, progress)
app/                  → Next.js App Router pages & API routes
module/               → Domain modules (ai, review, github, auth, ...)
inngest/functions/    → Background jobs (review, indexing)
eval/                 → Eval harness (test cases, runner, judge)
prisma/               → Prisma schema & migrations
lib/                  → Shared utilities (db, pinecone, auth config)
components/           → Shared React components (shadcn/ui)
```

---

## Mandatory Workflow (follow this every time)

### Before you code:

1. **Read `docs/progress.md`** — know what phase we're in and what's next.
2. **Read `docs/decisions.md`** — check if a relevant decision already exists.
3. **Read the module-level `AGENTS.md`** for the code you're about to touch.
4. **If the task requires an architectural choice**, add a decision entry to
   `docs/decisions.md` BEFORE implementing.

### While you code:

5. **Follow the conventions below** — every single one, no exceptions.
6. **Make small, focused changes** — one concern per commit/change.
7. **Don't touch unrelated code** — resist the urge to "clean up" nearby code.

### After you code:

8. **Update `docs/progress.md`** — mark tasks done, add session log entry.
9. **If you made a new decision**, ensure it's in `docs/decisions.md`.
10. **If the architecture changed**, update `docs/architecture.md`.
11. **Run eval if you touched the pipeline** — `bun eval:run` then `bun eval:judge`.

---

## Non-Negotiable Conventions

### 1. Schema-first LLM calls
Every LLM call producing structured data MUST use `generateObject` with a Zod
schema. Never parse free-form text. This is the core architectural principle.

### 2. Single review entry point
Both Inngest and eval call `runReview()` from `module/review/lib/engine.ts`.
NEVER create parallel review paths.

### 3. Provider-agnostic
Never hardcode a specific AI provider. Use `getLanguageModel()` and
`getEmbeddingModel()` from `module/ai/lib/models.ts`. Users pick via env vars.

### 4. Inngest step isolation
Each `step.run()` block must be independently retryable and idempotent.
External I/O = separate step. Pure transforms can be combined.

### 5. Eval gates every pipeline change
After any pipeline change, run `bun eval:run` then `bun eval:judge`. If numbers
don't improve or regress, the change doesn't ship. Document deltas in progress.md.

### 6. Don't skip phases
Phases execute in strict order. Don't implement Phase 3 features while Phase 0
is incomplete. See `docs/progress.md` for current phase.

### 7. Preserve existing comments and docs
Don't delete existing comments, docstrings, or documentation unless they are
factually wrong due to your code change.

### 8. No Deprecated Functions
Never use deprecated functions, APIs, or libraries. If your IDE flags a function as deprecated, find the modern replacement in the official docs before committing code.

### 9. Track Eval History
After running \`bun eval:judge\`, you MUST record the new precision/recall/efficiency metrics in \`docs/eval-history.md\`. We need a running ledger of how every change impacts the pipeline's intelligence.

---

## Commands

```bash
bun run dev          # Start Next.js dev server
bun eval:run         # Run eval cases through the review engine
bun eval:judge       # LLM-judge scores the eval run
bunx prisma migrate  # Run database migrations
bunx prisma generate # Regenerate Prisma client
```

---

## Build Scope (current)

Phase 0 → 0.5 → 1 (partial) → 3 → 5 + Agent Trace UI.
Skipped (consciously): 1.5, 2, 4.5, 7, 8. See `docs/decisions.md` D-007.

## Known Problems (don't rediscover these)

| Problem | Location | Planned fix |
| ------- | -------- | ----------- |
| Whole-file embeddings (8k truncation) | `module/ai/lib/rag.ts:46` | Phase 3: per-symbol embeddings via `web-tree-sitter` |
| No symbol index / code graph | — | Phase 3: tree-sitter parsing + Prisma Symbol/Edge tables (see D-008) |
| No large PR handling | `module/review/lib/engine.ts` | Phase 0.7: file-level parallel review (see D-010) |
| Index built once, never refreshed | `inngest/functions/index.ts` | Out of scope (Phase 7) |
| Extension-only file filtering | `module/github/lib/github.ts:173` | Phase 0.7 (noise filtering) |
| Review posted as single comment | `module/github/lib/github.ts:234` | Phase 0.3 |
| No adversarial verification | — | Phase 0.4 (single) → Phase 5 (3× vote) |
| Prompt returns markdown blob | `module/review/lib/engine.ts` | Phase 0.2 |

---

## Environment Variables

Key ones (see `.env` for full list):
- `AI_PROVIDER` — `google` | `openai` | `groq`
- `AI_MODEL_ID` — model identifier for the chosen provider
- `AI_EMBEDDING_PROVIDER` — `google` | `openai` | `huggingface`
- `DATABASE_URL` — PostgreSQL connection string
- `PINECONE_API_KEY` — Pinecone vector DB key

---

## Per-Module Context Files

Read the `AGENTS.md` in the directory you're editing:
- `module/review/AGENTS.md` — review pipeline rules
- `module/ai/AGENTS.md` — provider abstraction & RAG rules
- `module/github/AGENTS.md` — GitHub API layer rules
- `inngest/AGENTS.md` — background job conventions
- `eval/AGENTS.md` — eval harness usage
