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

## D-019 · Deterministic Patch Trimming & Inline Comment Anchor Precision
- **Date:** 2026-08-25
- **Status:** accepted
- **Context:** Two core precision issues affected PR inline code reviews and `@codelens fix` auto-suggestions:
  1. **Inline Review Comments Anchoring Cut-off:** `github.ts` set `line: finding.startLine` and ignored `endLine` / `start_line`. In GitHub's REST API, `line` specifies the *end line* of the comment box anchor. Setting `line` to `startLine` (line 30) caused GitHub to attach the comment below line 30, pushing line 31 (`return 1;`) below the comment box and hiding the bug line from the diff preview box.
  2. **Webhook Context Blindness & Suggestion Bloat:** Webhook mentions of `@codelens fix` did not fetch parent review comments via `in_reply_to_id`, forcing the agent to operate on placeholder text and inherit broad line ranges. Furthermore, the agent replacement contract returned full chunk blocks, causing GitHub suggestion blocks to replace 20+ lines when only 1 line changed.
- **Decision:**
  1. **GitHub Comment Anchor Mapping:** Update `postInlineReview()` in `github.ts` to map `line: finding.endLine` and pass `start_line: finding.startLine !== finding.endLine ? finding.startLine : undefined`.
  2. **Webhook Parent Resolution:** Query `comment.in_reply_to_id` with Octokit to extract the original bug claim, evidence, and exact line numbers from the parent review comment before booting the Auto-Fix agent.
  3. **Deterministic Patch Trimming:** Implement `trimPatchToDelta()` in `auto-fix.ts`. In pure TypeScript (0 extra LLM calls), compare the agent's patch against the target file's raw content to strip matching leading/trailing context lines and update `startLine`/`endLine` before calling GitHub's API.
  4. **Range Delta Preservation:** Update `performExistenceChecks()` in `engine.ts` to preserve `lineDelta = finding.endLine - finding.startLine` during line snapping.
- **Alternatives considered:**
  - *Restricting LLM ReAct agent output:* Would force the LLM to guess line numbers or output incomplete code without surrounding context, increasing syntax errors.
  - *Hardcoding single-line replacement:* Fails for multi-line bug fixes.
- **Consequences:** The agent retains 100% full file context for deep reasoning during the ReAct loop, but GitHub receives a minimal, pinpoint 1-line suggestion block. Inline comments now anchor cleanly to `endLine` showing all relevant buggy lines inside the preview box.

---

## D-018 · Per-role provider chains in env, replacing the global `GCP_ENABLED` switch
- **Date:** 2026-08-23
- **Status:** accepted
- **Context:** D-015 split routing by *model role* (`AI_MODEL_ID` vs `AI_AGENT_MODEL_ID`) but not by *provider*. `GCP_ENABLED` was a single global boolean that forced **all** Google traffic — review, agent and embeddings — down one path, so "agent on Vertex, embeddings on the free API" was inexpressible. Three concrete bugs came out of that design:
  1. **Fallback layers silently served a different model than configured.** The condition was `provider === primaryProvider && AI_MODEL_ID`, so with `AI_PROVIDER=google` the Groq layer used a hardcoded `llama-3.1-8b-instant`, and with `AI_PROVIDER=groq` the Google layer used `gemini-3.1-flash-lite-preview`. The last working review layer was far weaker than intended, invisibly.
  2. **The free Gemini API was unreachable unless `AI_PROVIDER=google`.** The `["google","google"]` duplicate enabling the Vertex→AI-Studio hop was only pushed in that case, with intent encoded in a mutable `hasTriedVertex` boolean rather than in the list.
  3. **`AI_EMBEDDING_MODEL_ID` meant two different things** — an HF model name in `rag.ts`, a Google model name in `models.ts` — so changing the provider without the model ID crossed the wires. The agent had the same door/model drift risk.
  Additionally, only review calls had a circuit breaker; the agent and the embedding path had none.
- **Decision:** Declare routing in env as one ordered chain of `door:model` pairs per role.
  ```
  AI_REVIEW_CHAIN="groq:openai/gpt-oss-120b,google-vertex:...,google-api:..."
  AI_AGENT_CHAIN="google-vertex:gemini-3.1-pro-preview,groq:openai/gpt-oss-120b"
  AI_EMBEDDING_CHAIN="google-vertex:gemini-embedding-001,google-api:gemini-embedding-001"
  ```
  Doors: `google-vertex` · `google-api` · `groq` · `openai` (+ `huggingface` for embeddings). A door is the *credential path*, so Vertex and AI Studio are two doors to the same Google models.

  **Dividing line:** env owns **routing** (which door, which model, what order); code owns **model facts** (context limits, dimensions — `MODEL_FACTS`). A model ID changing is an operational event that must be fixable without a deploy; a model's context window is not a tuning knob.

  **Four invariants, enforced at resolution, failing loudly:**
  1. Parse errors throw. Never substitute a default model.
  2. Every layer names its own model — no implicit `DEFAULT_MODEL_ID`.
  3. Every **embedding** layer must name the *same* model. Vectors from different models are incomparable, so a mixed chain would silently corrupt the index rather than degrade. This is why HuggingFace cannot be an embedding *fallback* — a different vector space is a migration, not a failover.
  4. Doors are validated per role (`huggingface` is embedding-only).

  `runWithChain(role, fn)` walks the layers, so **all three roles** now have failover. The agent fails over **per run**, not per call — a half-finished investigation against a dead provider is worthless, and swapping models mid-conversation mixes two different tool-calling behaviours.
- **Alternatives considered:**
  - *Presets in code selected by one env var:* type-safe and diffable, but a retired preview model would need a PR and a deploy to route around. Rejected on operational grounds.
  - *Keeping `GCP_ENABLED` alongside chains:* two switches for one decision, and the global would keep silently overriding the explicit chain.
  - *Cross-model embedding fallback (Google → HuggingFace):* dimensionally impossible against a fixed-dimension index, and semantically worse than failing — a query embedded by a different model than the stored vectors returns confident garbage with no error.
- **Consequences:** Swapping a provider is one env edit per role, testable locally before it is needed. `google-vertex` now means Vertex-only (it throws if credentials are absent) so failover is explicit in the chain instead of hidden inside `getNextGoogleProvider`. Legacy env vars still derive an equivalent chain when the new ones are unset, so code can deploy before config. Verified 2026-08-23: all four invariants reject correctly, legacy derivation reproduces prior behaviour, and a live run with a deliberately dead Vertex layer failed over to Groq and completed the fix loop.

---
## D-017 · Auto-Fix authorization lives in the action; core logic lives in `lib/`
- **Date:** 2026-08-23
- **Status:** accepted
- **Context:** `executeAutoFix` was an exported `"use server"` action with no authorization check. It resolved the repository by `(owner, name)` and then acted with **that repository owner's** GitHub token, so any caller able to reach the action endpoint could make CodeLens write inline comments on any connected repo as its owner. Every other server action in the codebase (`module/review/action`, `module/repository/action`, `module/settings/actions`) already gates on `auth.api.getSession()`. The naive fix — adding a session check in place — breaks the `@codelens fix` webhook path, because a GitHub webhook has no user session.
- **Decision:** Split the two concerns.
  1. `module/ai/lib/auto-fix.ts` exports `runAutoFixAndComment()` — the agent run plus the GitHub suggestion post. It performs **no** authorization and must never be exported from a `"use server"` module.
  2. `module/ai/actions/fix.ts` keeps a thin `"use server"` `executeAutoFix()` that verifies the session **and** that `repository.userId === session.user.id`, then delegates.
  3. The webhook (`app/api/webhooks/github/route.ts`) imports the lib directly, since it is authorized by being a webhook rather than by a session.
- **Alternatives considered:**
  - Session check inside the single shared function: breaks the webhook caller.
  - A `trusted: boolean` parameter to skip the check: worthless, since the caller of a server action controls every argument.
  - Ownership check without a session check: still lets an unauthenticated caller act, just on a narrower set of repos.
- **Consequences:** Authorization is enforced at exactly one boundary, and the rule is now explicit: anything exported from a `"use server"` module is a public endpoint and must authorize its own caller. Still open: the webhook does not verify GitHub's `x-hub-signature-256`, so the lib is reachable by anyone who can POST to it.

---
## D-016 · Step-Budget Awareness and Deterministic Pre-gathering for ReAct Agent
- **Date:** 2026-08-23
- **Status:** accepted
- **Context:** The Auto-Fix Agent uses a `maxSteps` loop to autonomously research and patch bugs. However, without constraints, ReAct loops often fall into "research spirals" (e.g., repeatedly using `semantic_search` without ever proposing a patch), exhausting token budgets and failing the task. Furthermore, forcing the agent to rely purely on tools for initial context gathering (like `semantic_search`) ignores the powerful Code Knowledge Graph we already built in Postgres.
- **Decision:** 
  1. **Deterministic Pre-gathering:** Before the LLM ReAct loop begins, we query the Postgres AST graph (zero LLM cost) for symbols in the target file, along with their callers (blast radius) and callees (dependencies). We inject this structural topology into the System Prompt.
  2. **Step-Budget Nudging:** We maintain a `MAX_STEPS` (10) counter and inject `[System: Step X/10 — Y steps remaining]` into the user messages during the loop. As steps run out, the system escalates warnings, forcing the agent to call `write_plan` and `propose_patch`.
  3. **Provenance Transparency:** The system prompt explicitly warns the agent that the injected graph is *advisory* (reflecting index-time state) and explains the difference between `EXTRACTED` (facts) and `INFERRED` (hints) edges.
- **Alternatives considered:**
  - *Hard limit (fail on step 7):* Tried previously, caused the agent to silently fail mid-research.
  - *Pre-injecting full file contents:* Rejected because it pollutes the context window for large files and bypasses the agent's autonomous Observation phase (`read_file`). The graph structural injection provides orientation without bloating context.
- **Consequences:** The agent behaves vastly more intelligently, completing fixes in 3-4 steps instead of spiraling. It acts deterministically first (using the graph) and agentic second (using tools to fill gaps).

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
