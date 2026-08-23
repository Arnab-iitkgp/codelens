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
| 0.7 — Large PR chunking | ✅ Done | Implemented `chunkDiff` in `engine.ts` to split diffs by `diff --git` and review chunks in parallel to avoid token limits. |

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
| F.1 — Token limit mitigation | ✅ Done | Addressed `max completion tokens reached` Groq API limits by chunking large PR diffs directly in `runReview`. |

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
| 3B.4 — Python adapter | ✅ Done | `module/ast/lib/adapters/python.ts` — basic functions, classes, imports. Second priority, for Django/FastAPI eval PRs. |

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
| Agent Trace UI | ✅ Done | Dashboard page showing pipeline execution: each agent step (Investigator tools called, Prosecutor findings, Defense verdicts), timing, token count, findings proposed/kept/dropped. |

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

### 2026-08-21 — Python AST Adapter & Types Refactoring
- Completed Phase 3B.4: Created `module/ast/lib/adapters/python.ts` using `tree-sitter-python`.
- Refactored `module/ast/lib/parser.ts` to dynamically load and cache multiple WASM language files.
- Updated `inngest/functions/index.ts` to route Python (`.py`) files to the new graph extraction adapter.
- Fixed strict TypeScript / ESLint issues across the codebase by replacing `any` bypassing with strict native types from `@types/parse-diff`.
- Excluded test fixture directories from the core build to ensure flawless Next.js production builds.
- **Next session:** Verify extraction natively on a Python repository.

### 2026-08-23 — Auto-Fix Agent & Split-Brain Architecture
- Designed and integrated the **Agentic Auto-Fix Pipeline** for autonomous bug remediation.
- Built the `AutoFixButton` client component and injected it into the Agent Trace UI dashboard.
- Extended GitHub webhook handling in `route.ts` to support `@codelens fix` mentions on PR inline comments (handling multi-line range selections flawlessly).
- Implemented **D-015: Split-Brain Provider Routing**.
- Centralized Vertex AI (GCP) configurations globally in `models.ts` with a resilient 4-Layer Circuit Breaker (`google-vertex` → `google-standard` → `groq` → `openai`).
- Configured the Auto-Fix Agent to utilize high-intelligence Pro models (`AI_AGENT_MODEL_ID`), keeping bulk reviews fast and cheap.
- Fixed critical edge-case bugs in OAuth parsing and Webhook line ranges.
- **Next session:** Focus on running the Eval Harness, or finalizing the Hybrid Retrieval Merge (Phase 3E.5).

### 2026-08-23 — Auto-Fix Path Hardening (PR → click → suggestion)
- Traced the full Auto-Fix flow end to end (webhook → review → trace UI → agent → suggestion comment) and fixed every defect found on it.
- **Fixed the agent's tool schemas (root cause of agent unreliability).** All five tools declared `parameters:`, which AI SDK v7 does not read — `tool()` is an identity function, so `inputSchema` was `undefined` and `asSchema(undefined)` substituted `{properties:{}, additionalProperties:false}`. Every tool was advertised to Gemini as taking **zero** arguments, and `additionalProperties:false` meant any argument the model did send failed validation (`InvalidToolInputError`). Renamed to `inputSchema:`; verified with `scratch/test-tool-schema.ts`.
- Removed all 6 `@ts-ignore` and 5 `as any` casts from `agent-fixer.ts` — they were symptoms of the misnamed field, not a real zod-version mismatch (zod 4.2.1 + AI SDK v7 is a supported pair). `tsc --noEmit` and `eslint` are both clean.
- Replaced deprecated `result.response.messages` with `result.responseMessages` (AGENTS.md rule #8) and typed the loop's message array as `ModelMessage[]`.
- **The agent now knows which lines it is replacing.** `runAgenticFixer` takes `startLine`/`endLine`, and the system prompt carries an explicit Patch Contract: the snippet replaces exactly that range, preserves `startLine`'s indentation, and contains no fences or diff markers. Previously the line range was used only to *place* the comment and never shown to the agent, so the snippet could not match the range GitHub replaces.
- `propose_patch` now strips stray code fences — a fence in the snippet would terminate the ` ```suggestion ` block early and corrupt the comment.
- **Closed an authorization hole (D-017).** `executeAutoFix` was an exported `"use server"` action with no session check that acted with the repo owner's GitHub token. Split into `module/ai/lib/auto-fix.ts` (logic, no authz) + a thin auth-checked action; the webhook calls the lib directly since it has no session.
- Fixed `semantic_search` blindness: it queried Pinecone with the repository CUID only, which matches graph symbols but never plain text files (indexed under `owner/repo`). Now queries both namespaces and merges.
- Fixed a 422 source when posting: `commits[commits.length - 1].sha` from the paginated `pulls.listCommits` is not the head commit on PRs with >30 commits. Now reads `pulls.get().head.sha`.
- Trace UI now passes claim + evidence + suggested direction + affected callers to the agent instead of the bare claim, so it doesn't re-derive what the review already proved.
- Repaired `docs/decisions.md`: commit `2f81b1a` overwrote D-015's heading when inserting D-016, orphaning D-015's body under D-016.
- Updated `docs/agent_architecture.md` to match the code (model id, hand-rolled loop vs `maxSteps`, `fixedSnippet` contract, dual-namespace search, authz boundary) and recorded that `ENABLE_AGENTIC_FIXER` is documented but not implemented.
- **Next session:** the outstanding items below — `verifyFindings` receives the full diff instead of the chunk (`engine.ts:396`), the `@codelens fix` webhook passes a placeholder instead of the real finding (`route.ts:35`), and the webhook does not verify `x-hub-signature-256`. Then the Phase 0.5 baseline eval run.

### 2026-08-23 — Per-Role Provider Chains (D-018)
- Replaced the global `GCP_ENABLED` switch with **per-role env chains**: `AI_REVIEW_CHAIN`, `AI_AGENT_CHAIN`, `AI_EMBEDDING_CHAIN`, each an ordered list of `door:model` pairs. A "door" is the credential path — Vertex and AI Studio are two doors to the same Google models.
- **All three roles now have failover.** Previously only review calls did; the agent had no try/catch at all and embeddings returned `null` per file. `runWithChain(role, fn)` walks the layers for everything.
- The agent fails over **per run**, not per call — a half-finished investigation against a dead provider is worthless, and swapping models mid-conversation mixes two different tool-calling behaviours.
- Fixed the bug class where **fallback layers silently served a different model than configured** (`provider === primaryProvider && AI_MODEL_ID`). Every layer now names its own model; a parse error throws instead of substituting a default.
- Enforced the invariant that **every embedding layer must name the same model.** Different models produce incomparable vectors, so a mixed chain would silently corrupt the index rather than degrade. HuggingFace therefore cannot be an embedding *fallback* — a different vector space is a migration.
- Truncation now comes from `MODEL_FACTS` per model instead of a hardcoded `slice(0, 8000)` — the mismatch that let mpnet's 384-token cap silently discard ~85% of every file.
- **Embedding failures are now loud.** `indexCodebase` / `indexGraphSymbols` report `⚠️ N/M FAILED — the index is incomplete` and return `{total, indexed, failed}`. Previously a dropped embedding vanished while `indexedFileCount` still reported full coverage.
- Capability probe (`scratch/check-embedding-models.ts`) established that **`gemini-embedding-001` is the only embedding ID that resolves on both Google doors** (3072 native, honours `outputDimensionality`). `gemini-embedding-2-preview` is absent on Vertex; `text-embedding-004/005` are absent on AI Studio. This is what makes the embedding failover safe.
- Agent capability probe (`scratch/check-agent-door.ts`) confirmed **`groq:openai/gpt-oss-120b` completes the full ReAct loop in ~9s** respecting the line budget — so losing the Vertex door means *degraded*, not *disabled*.
  - Required `read_file` to accept optional `startLine`/`endLine` (the model asked for them, and it fixes the 1281-line context bloat that blew the 15s Vercel timeout).
  - Required treating malformed tool calls as recoverable — Groq validates tool arguments server-side and rejects the whole request, where Gemini passed them through unvalidated.
- **Caught a bug in my own earlier fence-stripping:** it deleted a legitimate closing ` ``` ` from a README patch. Markdown files are now exempt, and elsewhere a lone fence line is dropped only because ` ``` ` can never be valid source code.
- Verified: all 4 invariants reject correctly, legacy env derives an equivalent chain, `DISABLE_CIRCUIT_BREAKER` collapses to one layer, and a live run with a deliberately dead Vertex layer failed over to Groq and completed the fix. `tsc`, `eslint` and `next build` all clean.
- Repaired `docs/decisions.md` (commit `2f81b1a` had overwritten D-015's heading). Added D-017, D-018, `docs/env_migration.md`.
- **Next session:** create the 3072-dim Pinecone index, re-index all repos on Vertex, then re-run the demo indexer. Then agent capability tier → UI.

---

## Outstanding on the Auto-Fix / review path (found 2026-08-23, not yet fixed)

| Issue | Location | Impact |
| ----- | -------- | ------ |
| `verifyFindings` gets `input` (full diff), not `diffChunk` | `module/review/lib/engine.ts:396` | Defeats chunking during the 3× verify pass on large PRs. If a verify call throws, `verifySingleLens` returns `[]` → every finding scores 0 votes → all findings silently dropped and the trace page shows everything "Rejected". |
| `@codelens fix` passes a placeholder finding | `app/api/webhooks/github/route.ts:35` | The agent is told only the file path, never the bug. Should read the parent comment body via `in_reply_to_id`. |
| Webhook does not verify `x-hub-signature-256` | `app/api/webhooks/github/route.ts` | Anyone who can POST to the endpoint can trigger reviews, re-indexing, and Auto-Fix runs. |
| `performExistenceChecks` collapses `endLine` to `startLine` when snapping | `module/review/lib/engine.ts:308` | A snapped multi-line finding becomes a single-line suggestion range, so the agent's multi-line patch replaces one line. |
| `ENABLE_AGENTIC_FIXER` documented but absent | — | No kill switch for the agent. |
| N+1 queries in the investigator | `module/review/lib/investigator.ts:36` | Re-fetches all symbols per chunk of the same file, then per-symbol caller/callee queries. |

---

- [ ] Need real public PR URLs with known bugs for eval test cases
- [ ] Verify `generateObject` support across Google, OpenAI, Groq providers
- [ ] Pinecone index dimension tied to embedding model (768-dim for text-embedding-004)
- [ ] `web-tree-sitter` WASM file serving in Next.js serverless — needs testing
- [ ] Pinecone migration strategy: side-by-side (`type: symbol` vs `type: chunk`) or wipe and re-index?
- [ ] Which Groq models reliably support `generateObject` structured output for the ReAct agent?

