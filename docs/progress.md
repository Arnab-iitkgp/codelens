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

## Phase 3 — Graph-Native Code Intelligence

> Decisions: D-008 (web-tree-sitter), D-011 (deterministic-first investigator),
> D-012 (canonical graph schema), D-013 (hybrid indexer with fallback),
> D-014 (tiered review modes for rate limits).
> Inspired by Graphify and `graphrag.md` vision document.

### Future Improvements & Backlog

| Task | Status | Notes |
| ---- | ------ | ----- |
| F.1 — Token limit mitigation | 🔴 Not started | Address `max completion tokens reached` Groq API limit (chunking diffs, switching default models, or streaming). |

### 3A — Database & Schema

| Task | Status | Notes |
| ---- | ------ | ----- |
| 3A.1 — Symbol model in Prisma | ✅ Done | `Symbol { qualifiedName, codeBody, kind, isTest, isExported, language, startLine, endLine }`. Unique on `(repoId, path, qualifiedName)`. |
| 3A.2 — Edge model in Prisma | ✅ Done | `Edge { kind, provenance (EXTRACTED/RESOLVED/INFERRED), weight }`. Indexed on `targetSymbolId` for "who calls this?" queries. |
| 3A.3 — Repository relations | ✅ Done | Add `symbols`, `edges`, `graphBuiltAt` to Repository model. Run migration. |

### 3B — Tree-sitter & Extraction

| Task | Status | Notes |
| ---- | ------ | ----- |
| 3B.1 — WASM parser init | ✅ Done | `module/ast/lib/parser.ts` — load `web-tree-sitter` + grammar `.wasm` files. Test in Next.js serverless environment. |
| 3B.2 — Language adapter interface | ✅ Done | `module/ast/lib/adapters/types.ts` — `LanguageAdapter { extractSymbols, extractImports, extractCalls }`. Language-agnostic core, language-specific adapters. |
| 3B.3 — TypeScript/JS adapter | ✅ Done | `module/ast/lib/adapters/typescript.ts` — `.scm` queries for functions, classes, methods, interfaces, imports, call expressions. Primary adapter. |
| 3B.4 — Python adapter | 🔴 Not started | `module/ast/lib/adapters/python.ts` — basic functions, classes, imports. Second priority, for Django/FastAPI eval PRs. |

### 3C — Symbol Resolution (3-tier)

| Task | Status | Notes |
| ---- | ------ | ----- |
| 3C.1 — Deterministic resolution | ✅ Done | `module/ast/lib/resolver.ts` — Identifies `import { X } from './y'` + `X.method()` as proven `CALLS` edges (provenance: `EXTRACTED`). |
| 3C.2 — Heuristic resolution | ✅ Done | Identifies `this.service.doThing()` as an `INFERRED` edge for agent hinting. |
| 3C.3 — Resolver pipeline | ✅ Done | `resolveGraphEdges()` connects facts across the repository in memory. |

### 3D — Hybrid Indexer

| Task | Status | Notes |
| ---- | ------ | ----- |
| 3D.1 — Language router in indexer | ✅ Done | Update `inngest/functions/index.ts` — route `.ts/.js/.py` to graph path, all others to existing chunk path. |
| 3D.2 — Graph indexing path | ✅ Done | Parse → extract → resolve → upsert Symbols + Edges to Prisma. |
| 3D.3 — Per-symbol embeddings | ✅ Done | Embed each Symbol's `codeBody` → Pinecone with metadata `{ type: 'symbol', symbolId, repoId, kind }`. |
| 3D.4 — Chunk fallback path | ✅ Done | Existing 500-token chunking for unsupported languages, with metadata `{ type: 'chunk' }`. |

### 3E — Review Engine Upgrade

| Task | Status | Notes |
| ---- | ------ | ----- |
| 3E.1 — Diff parsing | ✅ Done | `module/review/lib/investigator.ts` parses PR diff into added/modified symbols. |
| 3E.2 — Deterministic context gathering | ✅ Done | For each modified symbol, query Prisma for `getCallees` and `getCallers` (SQL path). |
| 3E.3 — Vector fallback gathering | ✅ Done | If symbol not in Graph, use Pinecone retrieval for the hunk (from Phase 1). |
| 3E.4 — ReAct Agent (Optional) | 🔴 Skipped | Using deterministic + fallback hybrid retrieval per D-011. |
| 3E.4 — Tiered review mode selector | ✅ Done | Auto-detects based on `AI_PROVIDER` (Groq uses fast mode, OpenAI/Google use standard mode). |
| 3E.5 — Hybrid retrieval merge | 🔴 Not started | Combine lexical (SQL ILIKE), vector (Pinecone), and graph (edge traversal) results. Dedupe by symbolId, rank by impact priority. (`graphrag.md` §13) |

## Phase 5 — Verify, Vote, Calibrate

| Task | Status | Notes |
| ---- | ------ | ----- |
| 5.1 — 3× adversarial verify with majority vote | ✅ Done | Three parallel `generateObject` calls with different lenses (correctness, security, runtime-reality). |
| 5.3 — Confidence score per finding | ✅ Done | `confidence = notRefuted / totalVotes`. Visible badge on inline comments. |

## UI / Observability

| Task | Status | Notes |
| ---- | ------ | ----- |
| Agent Trace UI | 🔴 Not started | Dashboard page showing pipeline execution: each agent step (Investigator tools called, Prosecutor findings, Defense verdicts), timing, token count, findings proposed/kept/dropped. |

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

### 2026-08-21 — Phase 3 Architecture Design (Graph-Native Code Intelligence)
- Deep-dived Graphify source code (`extract.py`, `analyze.py`, `resolution.py`) to understand production-grade code graph extraction
- Brainstormed: AST vs Semantic resolution complexity — concluded 3-tier resolution (deterministic → heuristic → optional native)
- Brainstormed: Edge schema design specifically for PR review (provenance, isTest, weight for impact ranking)
- Brainstormed: Regression detection pipeline — graph traversal provides evidence, LLM reasons about it
- Brainstormed: Rate limit concerns for free-tier APIs — redesigned Investigator from pure-agentic to **deterministic-first, agentic-optional**
- Created 4 new architectural decisions: D-012 (graph schema), D-013 (hybrid indexer), D-014 (tiered review modes), revised D-011 (deterministic-first investigator)
- Expanded Phase 3 task list from 6 tasks to 18 tasks across 5 sub-phases (3A–3E)
- Created comprehensive unified implementation plan artifact
- Updated `docs/decisions.md`, `docs/progress.md`
- **Next session:** Start Phase 3A — implement Symbol + Edge models in `schema.prisma` and run migration

---

## Blockers / Open Questions

- [ ] Need real public PR URLs with known bugs for eval test cases
- [ ] Verify `generateObject` support across Google, OpenAI, Groq providers
- [ ] Pinecone index dimension tied to embedding model (768-dim for text-embedding-004)
- [ ] `web-tree-sitter` WASM file serving in Next.js serverless — needs testing
- [ ] Pinecone migration strategy: side-by-side (`type: symbol` vs `type: chunk`) or wipe and re-index?
- [ ] Which Groq models reliably support `generateObject` structured output for the ReAct agent?

