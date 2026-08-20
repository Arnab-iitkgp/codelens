# Inngest Functions — Agent Context

> Background job orchestration. This is where webhooks trigger review and indexing pipelines.

## Functions

| Function | Trigger event | What it does |
| -------- | ------------- | ------------ |
| `generateReview` | `pr.review.requested` | Fetches PR diff → calls `runReview()` → posts comment → stores in DB |
| `indexRepo` | `repository.connected` | Fetches all repo files → embeds each file → stores vectors in Pinecone |
| `generateDemoReview` | `demo.review.requested` | Demo flow for unauthenticated users (rate-limited) |

## Conventions

1. **Idempotency** — `generateReview` uses `idempotency: "event.id"` to prevent
   duplicate processing of the same webhook event.
2. **Cancellation** — If a new review is requested for the same PR, the running
   one is cancelled via `cancelOn` matching `data.prNumber`.
3. **Step isolation** — Each `step.run()` must be independently retryable.
   External I/O (DB, API) = separate step. Pure transforms can be combined.
4. **Engine parity** — The review step calls `runReview()` from
   `module/review/lib/engine.ts`. The eval harness calls the same function.
   Never duplicate review logic here.

## Known issues

- `indexRepo` runs once at connect time. No re-indexing on push. (Phase 7)
- `post-comment` step name has a typo space ("post -comment"). Non-breaking but ugly.
- Review is stored as a raw string in the `review` column. Will need to store
  structured JSON once Phase 0.2 lands.
