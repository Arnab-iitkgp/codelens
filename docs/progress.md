# CodeLens — Progress Tracker

> Living document. Update after every work session.
> AI agents: read this FIRST to know where we are.

---

## Current Focus

**Phase 0 — Stop the Bleeding** → Next task: **0.2 (Structured JSON findings)**

---

## Phase 0 — Stop the Bleeding

| Task | Status | Notes |
| ---- | ------ | ----- |
| 0.1 — Diff-based retrieval | ✅ Done | `retrieveContextForDiff()` in `rag.ts` |
| 0.2 — Structured JSON findings | ✅ Done | Switched `engine.ts` to `generateObjectWithFallback` + Zod schema. Returns both structured data and fallback markdown string. |
| 0.3 — Inline PR comments | ✅ Done | Replaced `issues.createComment` with `pulls.createReview`. Added 422 error fallback to general comment. |
| 0.4 — Adversarial verify pass | ✅ Done | Second LLM call inside `engine.ts` using `verifySchema` to refute findings. |
| 0.5 — Existence checks | ✅ Done | Validate file and line number in PR's changed-files list using `parse-diff`. |
| 0.6 — Repo profile stub | ✅ Done | Added `architectureProfile: String?` to Prisma and injected it into the engine prompt. |
| 0.7 — Large PR chunking | 🔴 Not started | Split large diffs by file, review in parallel per-file-group, merge findings. Option B: walkthrough generated from structure scan while per-file reviews run in parallel. |

## Phase 0.5 — Eval Harness

| Task | Status | Notes |
| ---- | ------ | ----- |
| Runner + Judge | ✅ Done | `eval/run.ts`, `eval/judge.ts` |
| Test cases | ✅ Done | Initial set of 12 synthetic/curated cases implemented. Real-world PRs (Django, FastAPI) deferred to later phases. |
| Baseline run | 🔴 Not started | Run across 4 models, document day-zero numbers |
| Control set (FP rate) | 🔴 Not started | 3-5 clean PRs |

## Phase 1 — Architecture Awareness (partial scope)

| Task | Status | Notes |
| ---- | ------ | ----- |
| 1.2 — Repo profile generator | ✅ Done | Sample 20 files via GitHub Tree API, feed into `generateObject` with `profileSchema`, and save as markdown string to DB. |
| 1.3 — Inject profile into prompt | ✅ Done | Included natively via `buildPrompt` in `engine.ts` during Phase 0.6. |

## Phase 3 — Code Intelligence (tree-sitter)

> Decision D-008: Build our own using `web-tree-sitter` (npm), inspired by
> Graphify (109K★) and Aider's repo map. Native to our Node.js stack, integrated
> with Prisma. See `docs/decisions.md` for rationale.

| Task | Status | Notes |
| ---- | ------ | ----- |
| 3.1 — tree-sitter setup + symbol extraction | 🔴 Not started | `web-tree-sitter` + TS/JS/Python grammars. `.scm` query files for definitions, references, imports. Output: `{ name, kind, signature, startLine, endLine, body }[]` per file. |
| 3.2 — Symbol + Edge tables in Prisma | 🔴 Not started | `Symbol { repoId, path, name, kind, startLine, endLine, signature, body, language }`, `Edge { fromSymbol, toSymbol, kind: 'calls'\|'imports'\|'inherits' }` |
| 3.3 — Per-symbol embeddings in Pinecone | 🔴 Not started | Replace whole-file vectors with one vector per symbol. Metadata: `{repoId, path, symbol, kind, startLine, endLine}` |
| 3.4 — Diff-driven symbol lookup at review time | 🔴 Not started | Parse changed hunks → find modified symbols → fetch their definitions + callers from graph → inject as labeled context. |
| 3.5 — Existence checks against symbol table | 🔴 Not started | Verify cited symbols exist before posting findings. |
| 3.6 — ReAct Agent Loop (Investigator) | 🔴 Not started | Implement `generateObject` where the LLM reasons about the diff and calls tools to request specific symbols from the graph. |

## Phase 5 — Verify, Vote, Calibrate

| Task | Status | Notes |
| ---- | ------ | ----- |
| 5.1 — 3× adversarial verify with majority vote | 🔴 Not started | Three parallel `generateObject` calls with different lenses (correctness, security, runtime-reality). |
| 5.3 — Confidence score per finding | 🔴 Not started | `confidence = notRefuted / totalVotes`. Visible badge on inline comments. |

## UI / Observability

| Task | Status | Notes |
| ---- | ------ | ----- |
| Agent Trace UI | 🔴 Not started | Dashboard page showing pipeline execution: each agent step, timing, token count, findings proposed/kept/dropped. |

## Phases NOT in scope (conscious decision)

- Phase 1.5 (skill/rules export) — doesn't demo well
- Phase 2 (gitleaks/semgrep) — nice-to-have, not priority for CV
- Phase 4 (reference graph) — merged into Phase 3 (we build edges during tree-sitter extraction)
- Phase 4.5 (repo audit mode) — too much UI/infra
- Phase 7 (re-indexing) — operational concern
- Phase 8 (heavy analyzers) — too much infra

---

## Session Log

### 2026-08-20 — Planning & context files
- Created project context files (AGENTS.md at root + per-module)
- Created docs/architecture.md, docs/decisions.md, docs/progress.md
- Audited current codebase against REVIEW_ENGINE_PLAN.md
- Researched tree-sitter feasibility for code intelligence
  - Studied Graphify (109K★, tree-sitter + graph, Python CLI)
  - Studied Aider's repo map (tree-sitter + PageRank)
  - Decided: build our own with `web-tree-sitter` (npm-native, Prisma-integrated)
- Decided: Phase 5 (3× verify + vote) IS in scope — it's ~50 lines of code
- Decided: large PR handling via file-level parallel review (Option B: structure scan for walkthrough, parallel per-file reviews)
- Revised scope: Phases 0, 0.5, 1(partial), 3, 5 + Agent Trace UI
- **Next session:** Start Phase 0.2 — structured JSON findings with Zod schema

### 2026-08-20 — Implementation of Phase 0 & Phase 1
- Completed Phase 0.2: Migrated to Vercel AI SDK `generateObject` with strict Zod schema for structured JSON findings.
- Completed Phase 0.3: Migrated from issue comments to inline GitHub PR reviews with a 422 error circuit breaker.
- Completed Phase 0.4: Implemented adversarial "defense" agent loop to refute false positives.
- Completed Phase 0.5: Implemented deterministic Existence Checks using `parse-diff` to validate file paths and line numbers.
- Upgraded Eval Harness: Added AI Provider fallback logic (Groq -> Google -> OpenAI) and rate-limit delays for stable testing.
- Completed Phase 0.6 & 1: Added `architectureProfile` to Prisma, built a heuristic GitHub Tree file sampler (scoring config and src files), and wired up a new Inngest background job to auto-generate architectural conventions.
- **Next session:** Decide between Phase 0.7 (Large PR Chunking) or Phase 3 (Tree-Sitter WASM code intelligence).

---

## Blockers / Open Questions

- [ ] Need real public PR URLs with known bugs for eval test cases
- [ ] Verify `generateObject` support across Google, OpenAI, Groq providers
- [ ] Pinecone index dimension tied to embedding model (768-dim for text-embedding-004)
- [ ] `web-tree-sitter` WASM file serving in Next.js serverless — needs testing
