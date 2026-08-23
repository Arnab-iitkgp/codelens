# CodeLens Agentic Architecture (Phase 6)

## Overview
The CodeLens Agentic Fixer is a true ReAct (Reasoning and Acting) autonomous agent designed to move CodeLens from a "read-only" review tool to an "auto-remediation" tool. 

Unlike the core review engine which operates as a strict, deterministic pipeline on cheap models, the Agentic Fixer operates in a dynamic loop. It is powered by high-tier models (`AI_AGENT_MODEL_ID`, defaulting to `gemini-3.1-pro-preview`, via Google Cloud Vertex AI) to autonomously investigate and resolve bugs flagged by the review engine.

## The Paradigm: Graph-Augmented Autonomous Agent
A standard AI agent uses simple tools like `readFile` or `grep` to navigate a repository, which is slow and prone to hallucination. 

The CodeLens Agent is **Graph-Augmented**. It leverages the exact same infrastructure as our core review engine:
- **Postgres AST Graph:** Gives the agent deterministic knowledge of how symbols are connected.
- **Pinecone Vector Store:** Gives the agent semantic search capabilities to find abstract concepts instantly.

## The Two-Phase Agent Lifecycle

To prevent the agent from blindly guessing fixes or falling into "research spirals," we enforce a strict two-phase lifecycle (D-011 variant) with specialized tools and budget constraints.

### Phase 1: Deterministic Context Pre-gathering (Zero LLM Cost)
Before the LLM is invoked, the system queries the **Postgres AST Graph** for the symbols present in the target file. It extracts:
- **Callers (Blast Radius):** Which files depend on this symbol.
- **Callees (Dependencies):** What this symbol relies on.

This structured code topology is injected into the System Prompt. To prevent hallucination based on stale index data, edges are labeled with their **Provenance**:
- `[EXTRACTED]` — Proven from explicit imports (Facts).
- `[RESOLVED]` — High-confidence cross-file heuristic matches.
- `[INFERRED]` — Guessed relationships (Hints).

### Phase 2: The ReAct Loop (Think -> Plan -> Act)
Armed with the structural orientation from Phase 1, the agent enters a hand-rolled 10-step loop (`MAX_STEPS`) around `generateText`. We drive the loop ourselves rather than using the SDK's `stopWhen`/`stepCountIs` helpers because each iteration injects `[System: Step X/10 — Y steps remaining]` into the message history, escalating warnings to force a conclusion.

#### Resilience & Self-Healing
Strict-schema providers (like Groq) reject the entire LLM request if the model hallucinates a tool argument (`InvalidToolInputError`). Instead of crashing the loop, the system catches these recoverable validation errors and feeds them back into the message history as a system nudge (`your last tool call was rejected... Use ONLY the exact parameter names`). This allows the agent to self-correct its syntax on the next step without losing its research progress.

#### 1. Observation & Context Gathering
- **`read_file(path, startLine?, endLine?)`**: Fetches the string content of a file from GitHub via Octokit. To protect the token budget and prevent massive files from blowing the context window (or serverless timeouts), whole-file reads are strictly capped at 400 lines. The agent is instructed to use the optional `startLine` and `endLine` parameters to surgically read the exact slice it needs.
- **`query_ast_callers(symbolName)`**: Queries our Postgres `Edge` table on-the-fly to find the "Blast Radius" of additional symbols discovered during the investigation.
- **`semantic_search(query)`**: Hits our Pinecone database to find where specific concepts are implemented. (Constrained to a maximum of 2 uses). Indexing stores graph symbols under the repository CUID and plain text files under the `owner/repo` string, so this tool queries **both** namespaces and merges the results — otherwise it would only ever see parsed symbols, never a README or config file.

> **Tool schemas:** every tool declares its arguments with `inputSchema` (AI SDK v7). The field was previously named `parameters`, which the SDK does not read — `asSchema(undefined)` then substituted `{properties:{}, additionalProperties:false}`, advertising every tool as taking **zero** arguments and rejecting any argument the model did send. Do not use `.describe()` inside these schemas; it breaks Vertex compatibility (see commit `d75dbb5`). Document argument semantics in the tool `description` string instead.

#### 2. Planning (Forced Reasoning)
- **`write_plan(analysis, plan)`**: The agent is prompted that it **must** call this tool before modifying code. It records its root-cause analysis and step-by-step remediation plan into memory. This forces the LLM to output its "Thoughts," significantly reducing syntax hallucinations.

#### 3. Execution
- **`propose_patch(path, fixedSnippet)`**: The final action. Calling this tool signals the system to exit the loop and post the GitHub PR review.

`fixedSnippet` is **not** a full file and not a diff. It is posted verbatim inside a GitHub ` ```suggestion ` block, which replaces *exactly* the finding's line range (`startLine`–`endLine`). The agent is therefore told that range up front — via both the system prompt's **Patch Contract** section and the `propose_patch` description — because a snippet written without knowing how many lines it replaces produces a mangled suggestion. The contract requires the snippet to:
- cover only those lines, with no surrounding context;
- preserve the original leading indentation of `startLine`;
- contain raw code only — no diff markers, line numbers, or code fences.

As a safety net, `propose_patch` strips leading/trailing code fences before storing the patch, since a stray fence would terminate the suggestion block early and corrupt the comment.

## Authorization (D-017)
The agent spends the **repository owner's** GitHub token, so the entry points are split:
- `module/ai/lib/auto-fix.ts` → `runAutoFixAndComment()` holds the logic and performs **no** authorization. It must never be exported from a `"use server"` module.
- `module/ai/actions/fix.ts` → `executeAutoFix()` is the `"use server"` action for the dashboard button. It verifies the session and repository ownership, then delegates.
- The GitHub webhook imports the lib directly, since a webhook has no user session.

## Deployment Strategy (Enterprise Vertex AI)
To power this highly intelligent loop, we require a frontier model (`AI_AGENT_MODEL_ID`, default `gemini-3.1-pro-preview`). We utilize Google Cloud Vertex AI to ensure enterprise-grade reliability and data privacy for the autonomous agent.

1. **Authentication:** Local development authenticates seamlessly via Google Cloud CLI (`gcloud auth application-default login`).
2. **Production Deployment:** For Vercel, the Service Account JSON string is parsed directly from the `GOOGLE_VERTEX_CREDENTIALS_JSON` environment variable, avoiding the need to commit secret files.
3. **The Toggle:** `GCP_ENABLED=true` routes the agent to Vertex AI; otherwise it falls back to standard Gemini API keys (see D-015).

> **Not yet implemented:** an `ENABLE_AGENTIC_FIXER` kill switch. This doc previously claimed the agent was gated behind that flag, but no such check exists in the code — the Auto-Fix path is always live for any signed-in repository owner.
