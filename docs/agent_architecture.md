# CodeLens Agentic Architecture (Phase 6)

## Overview
The CodeLens Agentic Fixer is a true ReAct (Reasoning and Acting) autonomous agent designed to move CodeLens from a "read-only" review tool to an "auto-remediation" tool. 

Unlike the core review engine which operates as a strict, deterministic pipeline on cheap models, the Agentic Fixer operates in a dynamic loop (using Vercel AI SDK's `maxSteps`). It is powered by high-tier models (Gemini 1.5 Pro via Google Cloud Vertex AI) to autonomously investigate and resolve bugs flagged by the review engine.

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
Armed with the structural orientation from Phase 1, the agent enters a `maxSteps` (10) loop. To enforce temporal awareness, the system injects `[System: Step X/10 — Y steps remaining]` into the loop, escalating warnings to force a conclusion.

#### 1. Observation & Context Gathering
- **`read_file(path)`**: Fetches the raw string content of a file from GitHub via Octokit. (This is the Ground Truth — the agent must read the file rather than blindly trusting the Phase 1 graph).
- **`query_ast_callers(symbolName)`**: Queries our Postgres `Edge` table on-the-fly to find the "Blast Radius" of additional symbols discovered during the investigation.
- **`semantic_search(query)`**: Hits our Pinecone database to find where specific concepts are implemented. (Constrained to a maximum of 2 uses).

#### 2. Planning (Forced Reasoning)
- **`write_plan(analysis, plan)`**: The agent is prompted that it **must** call this tool before modifying code. It records its root-cause analysis and step-by-step remediation plan into memory. This forces the LLM to output its "Thoughts," significantly reducing syntax hallucinations.

#### 3. Execution
- **`propose_patch(path, fixedContent)`**: The final action. Once the agent is confident in its plan, it outputs the fully corrected file snippet. Calling this tool signals the system to gracefully exit the `maxSteps` loop and post the GitHub PR review.

## Deployment Strategy (Enterprise Vertex AI)
To power this highly intelligent loop, we require a frontier model (Gemini 1.5 Pro). We utilize Google Cloud Vertex AI to ensure enterprise-grade reliability and data privacy for the autonomous agent.

1. **Authentication:** Local development authenticates seamlessly via Google Cloud CLI (`gcloud auth application-default login`).
2. **Production Deployment:** For Vercel, the Service Account JSON string is parsed directly from the `GOOGLE_VERTEX_CREDENTIALS_JSON` environment variable, avoiding the need to commit secret files.
3. **The Toggle:** The agent is gated behind an `ENABLE_AGENTIC_FIXER` feature flag. 
