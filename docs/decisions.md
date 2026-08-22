# CodeLens — Decision Log

> Every non-trivial decision is recorded here with context and rationale.
> When making a change, check if a relevant decision exists. If you're making
> a new decision, add it here BEFORE implementing.

---

## How to use this file

**For AI agents:** Before implementing any significant change, read through the
decisions below. If a decision covers your area, follow it. If you need to make
a new architectural choice, add a new entry at the top (newest first) with:
- **ID**: Sequential number (D-XXX)
- **Date**: When decided
- **Status**: `accepted` | `superseded` | `deprecated`
- **Context**: What problem we faced
- **Decision**: What we chose
- **Alternatives considered**: What we didn't choose and why
- **Consequences**: What this means going forward

---

## D-015 · Split-Brain AI Architecture with 4-Layer Circuit Breaker
- **Date:** 2026-08-23
- **Status:** accepted
- **Context:** We need a way to route fast, bulk code reviews (The Critic) to cheap models (like Groq or Flash) while routing complex, single-file reasoning tasks (The Auto-Fix Agent) to expensive, highly-intelligent models (like Vertex AI Pro). Furthermore, enterprise users on GCP Vertex AI need a resilient fallback chain if GCP goes down.
- **Decision:** Implement a Split-Brain Provider Routing system gated by `GCP_ENABLED=true`. 
  1. **Agent Separation:** The Auto-Fix Agent explicitly requests `AI_AGENT_MODEL_ID` (defaulting to Pro) while the Review Engine uses `AI_MODEL_ID`. 
  2. **4-Layer Fallback:** If `GCP_ENABLED=true` and `AI_PROVIDER=google`, the circuit breaker executes a 4-step failover with zero downtime: (1) GCP Vertex AI → (2) Standard Gemini API Keys (`forceStandard=true`) → (3) Groq → (4) OpenAI. 
  3. **Mixed Environments:** If `AI_PROVIDER=groq` and `GCP_ENABLED=true`, bulk reviews go to Groq, but the system still safely routes the Auto-Fix Agent to Vertex AI. 
- **Alternatives considered:**
  - Hardcoding Vertex AI in the Agent: Rejected because it breaks local dev for non-enterprise users.
  - Using a single provider for both engine and agent: Rejected because Pro models cost too much for bulk scanning, and Flash models hallucinate during strict agentic coding.
- **Consequences:** The system is enterprise-ready. Developers can configure cheap models for scanning and Pro models for fixing. The circuit breaker guarantees high availability even if Vertex AI quotas are exhausted.

---
## D-014 · Tiered review modes for API rate limits
- **Date:** 2026-08-21
- **Status:** accepted
- **Context:** The full agentic pipeline (ReAct + Prosecutor + 3× Defense) requires 5-7 LLM calls per review. On free-tier APIs like Groq (30 RPM, limited daily tokens), this risks rate limit exhaustion. Additionally, small models (≤20B params) often fail `generateObject` structured output.
- **Decision:** Implement three review modes — `full` (5-6 calls: ReAct + Prosecutor + 3× Defense), `standard` (4 calls: deterministic graph + Prosecutor + 3× Defense), `fast` (2 calls: deterministic graph + Prosecutor + 1× Defense). Mode is auto-selected based on provider capability or user override. The graph traversal (SQL queries) is free in ALL modes — it's the LLM verification passes that scale.
- **Alternatives considered:**
  - Always run full pipeline: Breaks on free tiers, wastes budget on small PRs.
  - Let user manually pick: Too much UX friction.
- **Consequences:** Even the `fast` mode produces dramatically better reviews than the current system because the context comes from the Code Knowledge Graph (deterministic SQL) instead of random vector blobs. The ReAct agent is an upgrade, not a requirement.

## D-013 · Hybrid graph indexer with language fallback
- **Date:** 2026-08-21
- **Status:** accepted
- **Context:** Building full semantic resolution for every language is infeasible. But AST extraction for nodes via Tree-sitter is easy across 20+ languages. The real cost is in the resolver (cross-file edge stitching).
- **Decision:** Route files through two paths during indexing. Supported languages (TS/JS first, Python second) get full Graph treatment: Tree-sitter AST → Symbol/Edge extraction → 3-tier resolution (deterministic → heuristic → optional native). Unsupported languages fall back to the existing 500-token text chunking into Pinecone. Pinecone vectors get a `type` metadata field (`symbol` vs `chunk`) so retrieval knows the difference.
- **Alternatives considered:**
  - Graph-only (no fallback): Breaks for Go, Rust, Java repos entirely.
  - Chunk-only (no graph): Loses all structural intelligence — the whole point of Phase 3.
- **Consequences:** Language-agnostic schema, language-specific adapters. Adding a new language means writing one adapter file + `.scm` query file. No core changes needed.

## D-012 · Canonical graph schema with PR-reviewer-specific edge design
- **Date:** 2026-08-21
- **Status:** accepted
- **Context:** Graphify's schema is designed for visual code exploration dashboards. Our schema must be designed for PR regression detection. Key differences: we need `isTest` on symbols (to rank production callers over test callers), `provenance` on edges (so the LLM knows which relationships are proven vs guessed), and `weight` on edges (for impact ranking).
- **Decision:** Two new Prisma models: `Symbol` (nodes — functions, classes, interfaces with `qualifiedName`, `codeBody`, `isTest`, `isExported`) and `Edge` (relationships — CALLS, IMPORTS, EXTENDS, IMPLEMENTS, CONTAINS, TESTS, USES with `provenance`: EXTRACTED/RESOLVED/INFERRED and `weight` for ranking). Indexed on `targetSymbolId` for the critical "who calls this?" reverse lookup.
- **Alternatives considered:**
  - Mirroring Graphify's schema directly: Missing PR-specific fields (`isTest`, `weight`, `provenance`).
  - Using a graph database (Neo4j): Adds infra dependency. Prisma + PostgreSQL with proper indexes handles our traversal depth (1-2 hops) easily.
- **Consequences:** Schema is language-agnostic. All language adapters produce the same `Symbol`/`Edge` records. The review engine queries the graph identically regardless of source language.

## D-011 · Investigator uses deterministic-first graph traversal, optionally agentic
- **Date:** 2026-08-21
- **Status:** accepted (revised — deterministic-first, agentic-optional)
- **Context:** A static pipeline (always fetch diff, always vector search) is a workflow, not an agent. To be truly agentic and improve context relevance, the system needs to reason about what it doesn't know. However, the agentic ReAct loop requires extra LLM calls and a model that reliably produces structured output.
- **Decision:** The Investigator always performs deterministic graph traversal first (parse diff → find modified symbols → SQL getCallers/getCallees → vector search — zero LLM cost). On top of that, if the model supports it and rate limit budget allows, an optional ReAct loop lets the LLM request additional context. This ensures the graph intelligence works even on the weakest/cheapest models.
- **Alternatives considered:**
  - Pure ReAct (LLM decides everything): Breaks on weak models that can't produce tool-call schemas. Wastes budget.
  - Fixed pipeline only (no agent): Misses context that requires adaptive reasoning (e.g., "this security change also affects the auth middleware").
- **Consequences:** The deterministic path delivers 80%+ of the context quality for zero LLM cost. The ReAct agent is a quality multiplier, not a requirement. Review mode (`fast`/`standard`/`full`) controls whether the agent runs (see D-014).

## D-010 · Large PRs: file-level parallel review with structure-first walkthrough
- **Date:** 2026-08-20
- **Status:** accepted
- **Context:** Large PRs (1000+ line diffs) blow past context windows on smaller
  models, degrade attention on larger ones, and produce surface-level reviews.
  Currently `engine.ts` injects the entire raw diff into one prompt.
- **Decision:** Split large diffs by file. Filter noise files (lock files, generated
  code, snapshots). Dispatch per-file-group review calls in parallel. Merge and
  deduplicate findings. For the walkthrough/summary: scan the diff structure (file
  names + hunk headers only) in parallel with the per-file reviews (Option B).
- **Alternatives considered:**
  - Option A: two-pass (per-file reviews first, then summary). Slower — walkthrough
    waits for all reviews.
  - Single prompt with truncation (loses content, defeats the purpose).
- **Consequences:** Review latency scales with the largest file, not the total diff.
  Finding dedup logic needed. Walkthrough quality may be slightly lower (structure
  only, not full code). Fits naturally into the multi-agent narrative.

## D-009 · Phase 5 (3× adversarial verify) is in scope
- **Date:** 2026-08-20
- **Status:** accepted
- **Context:** Phase 5 was originally planned as a later-stage quality multiplier.
  On analysis, it's ~50 lines of code — three parallel `generateObject` calls with
  different system prompts + a vote count.
- **Decision:** Include Phase 5.1 (3× verify with majority vote) and 5.3
  (confidence scores) in the build scope. Three lenses: correctness, security,
  runtime-reality. Default to refuted on tie.
- **Consequences:** Each finding costs 3 additional LLM calls. With 8 findings
  per review, that's 24 verify calls. Acceptable with cheap models ($0.01 total).
  Adds ~5-8 seconds latency (parallel calls). Confidence score becomes a visible
  badge on inline comments.

## D-008 · Build own code graph with web-tree-sitter, not use Graphify
- **Date:** 2026-08-20
- **Status:** accepted
- **Context:** Need code intelligence (symbol extraction, reference graph) for
  Phase 3. Graphify (109K★) is a Python CLI that does exactly this using
  tree-sitter. Aider uses a similar approach for its repo map. Both are proven.
- **Decision:** Build our own using `web-tree-sitter` (npm WASM package) with
  custom `.scm` query files, storing results in Prisma. Inspired by Graphify
  and Aider but native to our Node.js stack.
- **Alternatives considered:**
  - Use Graphify directly: Python dependency, CLI-oriented (not library API),
    shelling out from Node.js is fragile, and "I installed a tool" is weaker
    on a CV than "I built a code intelligence layer."
  - Use `ts-morph`: Full TS semantic info but TS/JS only. Tree-sitter supports
    Python (needed for Django/FastAPI eval PRs) with just a grammar swap.
  - Use `@optave/codegraph` npm package: Less mature, less documented.
- **Consequences:** We own the parsing code. Multi-language support by adding
  grammar `.wasm` files. `web-tree-sitter` is WASM-based — no native compilation
  needed, works in serverless. Graph stored in Prisma alongside existing data.
  Can reference Graphify/Aider as architectural inspiration in interviews.

## D-007 · Phase execution order follows eval-gated progression
- **Date:** 2026-08-20
- **Status:** accepted (revised — selective phase ordering for CV scope)
- **Context:** The REVIEW_ENGINE_PLAN.md defines 9 phases. We needed a rule for
  ordering work and preventing scope creep.
- **Decision:** For this build, the scope is: Phase 0 → 0.5 → 1 (partial) → 3 → 5
  + Agent Trace UI. Phases 1.5, 2, 4.5, 7, 8 are consciously skipped. The eval
  harness still gates every pipeline change.
- **Consequences:** Focused scope delivers a complete, impressive project. Skipped
  phases can be articulated in interviews as deliberate prioritization decisions.

## D-006 · Circuit breaker pattern for LLM provider failover
- **Date:** 2026-08-20
- **Status:** accepted
- **Context:** Users on free tiers hit rate limits frequently. A single failed
  LLM call would fail the entire review.
- **Decision:** `generateTextWithFallback()` in `module/ai/lib/models.ts` tries
  the primary provider first, then falls back through google → groq → openai in
  sequence. Each attempt is wrapped in try/catch.
- **Alternatives considered:**
  - Parallel calls to all providers (wasteful, costs 3× tokens)
  - User-configurable fallback order (complexity not justified yet)
- **Consequences:** Reviews complete even when one provider is down. Slight latency
  increase on failover. Log warns when fallback is used.

## D-005 · Diff-based retrieval over title-based retrieval
- **Date:** 2026-08-20
- **Status:** accepted
- **Context:** Original retrieval used PR title + description as the embedding
  query. PRs with vague titles ("fix stuff") retrieved junk context.
- **Decision:** Parse the diff into hunks, embed each hunk separately, query
  Pinecone per-hunk, union and dedupe results. Fall back to title+description
  only if diff retrieval returns nothing.
- **Alternatives considered:**
  - Embedding the entire diff as one query (too long, dilutes signal)
  - Using only added lines (misses context from removed/modified lines)
- **Consequences:** Retrieval is more expensive (N queries instead of 1, where
  N = number of hunks, capped at 8). Quality improvement is significant.

## D-004 · Single review entry point (engine.ts)
- **Date:** 2026-08-20
- **Status:** accepted
- **Context:** The Inngest function and the eval harness both need to run reviews.
  Having two code paths means changes diverge.
- **Decision:** `runReview()` in `module/review/lib/engine.ts` is the ONE entry
  point. Both Inngest and eval call it. No parallel review paths.
- **Alternatives considered:**
  - Separate eval-only pipeline (divergence risk too high)
  - Inngest-native pipeline with eval as a mock (couples eval to Inngest)
- **Consequences:** Any pipeline change is automatically tested by eval. The
  `skipRetrieval` option exists for eval runs where repos aren't indexed.

## D-003 · Whole-file embeddings (temporary, known-bad)
- **Date:** 2026-08-20
- **Status:** accepted (will be superseded by Phase 3)
- **Context:** Need vector retrieval working now. Per-symbol chunking requires
  AST parsing infrastructure we don't have yet.
- **Decision:** Embed each file as a single vector, truncated to 8000 chars.
  Store in Pinecone with `{repoId, path, content}` metadata.
- **Alternatives considered:**
  - Fixed-size chunking (loses semantic boundaries)
  - Wait for AST parsing (blocks all retrieval work)
- **Consequences:** Large files lose content past 8k chars. Small utility
  functions are drowned in file-level noise. Retrieval returns "vibes of
  similar files" not specific symbols. Phase 3 replaces this with per-symbol
  embeddings via ts-morph.

## D-002 · Inngest for background jobs over custom queue
- **Date:** 2026-08-20
- **Status:** accepted
- **Context:** PR reviews take 10-60 seconds. Can't block the webhook response.
  Need reliable background processing with retry, idempotency, cancellation.
- **Decision:** Use Inngest. Events trigger functions with step-based orchestration.
  Each step is independently retryable.
- **Alternatives considered:**
  - BullMQ + Redis (more infra to manage for self-hosters)
  - Vercel Cron + DB queue (no retry semantics, no cancellation)
  - Trigger.dev (similar to Inngest but less mature)
- **Consequences:** Inngest is a dependency. Self-hosters need to run the Inngest
  dev server or use Inngest Cloud. Step isolation is enforced by convention.

## D-001 · Vercel AI SDK over direct API calls
- **Date:** 2026-08-20
- **Status:** accepted
- **Context:** We support multiple LLM providers (Google, OpenAI, Groq, future
  Ollama). Each has different API shapes.
- **Decision:** Use the Vercel AI SDK (`ai` package) with provider-specific
  adapters (`@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/groq`). Provides
  unified `generateText()` / `generateObject()` / `embed()` interfaces.
- **Alternatives considered:**
  - LangChain (too heavy, abstractions leak)
  - Direct fetch to each API (repetitive, error-prone)
  - LiteLLM proxy (external dependency, latency)
- **Consequences:** Locked to Vercel AI SDK abstractions. Adding a new provider
  means adding its `@ai-sdk/*` adapter. `generateObject` with Zod schemas is
  the preferred pattern for structured output.
