# Review Engine — Agent Context

> This is the **core** of CodeLens. The review pipeline lives here.

## Architecture

```
PR webhook → Inngest → runReview() → retrieve context → build prompt → LLM call → post comments
```

The single entry point is `runReview()` in `lib/engine.ts`. Both the Inngest
production path and the eval harness call this same function.

## Current pipeline (what exists today)

1. **Retrieve** — parse diff into hunks, embed each hunk, query Pinecone for
   similar file blobs. Falls back to title+description if diff retrieval fails.
2. **Build prompt** — inject retrieved context + diff into a system prompt.
3. **Generate** — single `generateTextWithFallback()` call. Returns markdown blob.
4. **Post** — dump the entire output as one PR comment.

## What's broken (being fixed in Phase 0)

- Output is a **free-form markdown string**, not structured findings. Must switch
  to `generateObject` with a Zod schema: `{ file, startLine, endLine, severity,
  category, claim, evidence, suggestion }[]`.
- No **verify pass** — whatever the LLM says gets posted. Need adversarial refutation.
- No **existence checks** — findings can cite files/lines not in the PR.
- No **inline comments** — everything is one big comment, not per-line review.

## Rules for editing this module

1. `runReview()` is the ONLY entry point. Don't create alternatives.
2. Every LLM call must use `generateObject` with Zod (when we migrate).
3. Retrieved context must be labeled with file paths and line numbers.
4. Any new pipeline stage must be testable via the eval harness (`eval/`).
5. Log `{tokens, latency, model, findingsProposed, findingsVerified}` from every run.

## Planned evolution (from REVIEW_ENGINE_PLAN.md)

- **Phase 0.2**: Structured JSON output via Zod schema
- **Phase 0.4**: Adversarial verify pass (refute then vote)
- **Phase 3**: Symbol-level retrieval (ts-morph → per-symbol embeddings)
- **Phase 4**: Reference graph (callers/callees injected as impact context)
- **Phase 5**: 3× adversarial verify with majority vote, confidence scores

## Key files

| File | Purpose |
| ---- | ------- |
| `lib/engine.ts` | `runReview()` — the pipeline orchestrator |
| `../ai/lib/rag.ts` | Retrieval (embeddings, Pinecone queries, diff parsing) |
| `../ai/lib/models.ts` | Provider selection, fallback chain, embedding models |
