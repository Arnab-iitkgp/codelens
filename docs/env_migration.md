# Env Migration Guide — Model Routing

> Companion to D-015 (split-brain routing) and D-018 (per-role chains).
> Read this before changing any AI-related environment variable in production.
>
> **Status: chains are implemented.** `AI_REVIEW_CHAIN` / `AI_AGENT_CHAIN` /
> `AI_EMBEDDING_CHAIN` are live in `module/ai/lib/models.ts`. The legacy variables
> below still work — when a chain var is unset, an equivalent chain is derived
> from them — so code can deploy before config changes.

---

## 1. Current inventory — every model-related env var

| Variable | Read at | What it actually controls |
| -------- | ------- | ------------------------- |
| `AI_PROVIDER` | `models.ts:47,142,195`<br>`engine.ts:384`<br>`eval/run.ts:22` | Review **primary door**. Also used as a *reporting label* in `meta.provider` — which is not necessarily the door that served the call. |
| `AI_MODEL_ID` | `models.ts:48,165,168,170,218,221,223` | Review model — **only applied when that layer is the primary**. Fallback layers ignore it and use hardcoded defaults. |
| `AI_AGENT_MODEL` | legacy derivation | Superseded by `AI_AGENT_CHAIN`. Still parsed as a single-layer chain when the chain var is unset. |
| `AI_AGENT_MODEL_ID` | `models.ts:85` | Legacy agent model. Used only when `AI_AGENT_MODEL` is unset, on the vertex door. |
| `AI_EMBEDDING_PROVIDER` | `rag.ts:9`<br>`models.ts:122` | Embedding door. `huggingface` is handled **only** in `rag.ts` and bypasses `getEmbeddingModel()` entirely. |
| `AI_EMBEDDING_MODEL_ID` | `rag.ts:14`<br>`models.ts:125` | ⚠️ **Two different meanings.** An HF model name when provider is `huggingface`, a Google model name otherwise. |
| `GCP_ENABLED` | `models.ts:13,148,201` | Global Vertex preference for **all** Google traffic — review, agent and embeddings together. |
| `GOOGLE_VERTEX_CREDENTIALS_JSON` | `models.ts:13,15` | Vertex service-account JSON. |
| `GOOGLE_GENERATIVE_AI_API_KEY(S)` | `models.ts:27` | AI Studio key(s), comma-separated, round-robin rotated. |
| `DISABLE_CIRCUIT_BREAKER` | `models.ts:146,199` | Disables **all** review fallbacks. No effect on agent or embeddings (they have none). |
| `PINECONE_INDEX_NAME` | `lib/pinecone-db.ts:6` | Read at **module scope** — changing it requires a redeploy, not just an env edit. |
| `HUGGINGFACE_API_KEY` | `rag.ts:12` | HF inference key. |

### Hidden behaviours in the LEGACY scheme (all fixed by the chains)

These are why the chains exist. They still apply to any deployment that has not
set the `AI_*_CHAIN` variables, since the legacy derivation reproduces them.

- **Fallback layers ignore `AI_MODEL_ID`.** The condition was `provider === primaryProvider && AI_MODEL_ID`. So with `AI_PROVIDER=google`, the Groq fallback silently used `llama-3.1-8b-instant`, and with `AI_PROVIDER=groq`, the Google fallback silently used `gemini-3.1-flash-lite-preview`. Your last working review layer could be far weaker than you think.
- **The AI Studio API was only reachable when `AI_PROVIDER=google`.** The `["google","google"]` duplicate enabling the Vertex→AI-Studio hop was pushed only in that case, with intent held in a mutable `hasTriedVertex` boolean instead of the list.
- **`getNextGoogleProvider(false)` is not Vertex-only** — it falls through to AI Studio keys when `GCP_ENABLED !== "true"`. The explicit `google-vertex` door does not: it throws, so the chain decides the fallback.
- **Only review calls had a circuit breaker.** The agent had no try/catch at all and embeddings returned `null` per file. `runWithChain` now covers all three roles.

---

## 2. Phase 0 — pushing the current changes

**No production env change is required to deploy.** When a chain variable is unset, `getChain()` derives an equivalent chain from the legacy variables and logs a warning naming what it derived — so behaviour is unchanged until you set the chains.

But run this checklist against your **actual prod values**, because the capability probe found two live failure modes:

### Check 1 — is your embedding model reachable on the door it resolves to?

Verified 2026-08-23 against both doors:

| Model | Vertex | AI Studio |
| ----- | ------ | --------- |
| `gemini-embedding-2-preview` | ❌ not found | ✅ 3072 |
| `gemini-embedding-001` | ✅ 3072 | ✅ 3072 |
| `text-embedding-004` | ✅ 768 | ❌ not found |
| `text-embedding-005` | ✅ 768 | ❌ not found |
| `text-multilingual-embedding-002` | ✅ 768 | ❌ not found |

**`gemini-embedding-001` is the only ID that works on both.**

So in prod:

- `AI_EMBEDDING_PROVIDER=google` + `GCP_ENABLED=true` + `AI_EMBEDDING_MODEL_ID=gemini-embedding-2-preview` → **404s on Vertex.** Embeddings are failing.
- `AI_EMBEDDING_MODEL_ID=text-embedding-004` and anything falls through to AI Studio → **404s there.**
- `AI_EMBEDDING_PROVIDER=huggingface` → works, but see Check 2.

**Fix:** `AI_EMBEDDING_MODEL_ID=gemini-embedding-001`. ⚠️ This is *not* a safe standalone env flip — see §4.

### Check 2 — is HuggingFace silently truncating your index?

`sentence-transformers/all-mpnet-base-v2` caps input at **384 tokens**. `indexCodebase` sends `slice(0, 8000)` characters (~2,000+ tokens). The excess is discarded with **no error and no log** — so "no errors in the logs" is not evidence this is working.

If prod has been indexing via HuggingFace, the stored vectors represent roughly the first 15% of each file (imports and the first function or two). Do not judge retrieval quality on that index.

### Check 3 — how weak is your last review layer?

Given your prod `AI_PROVIDER`, work out what the fallback layers actually resolve to using the "hidden behaviours" list above. If `OPENAI_API_KEY` is empty, that layer fails and the layer before it is your real floor.

---

## 3. Phase 1 — chains (implemented)

One variable per role, holding an ordered list of `door:model` pairs. The first
layer that responds serves the call; the rest are failover.

```bash
# Routing — ordered, first reachable layer wins
AI_REVIEW_CHAIN="groq:openai/gpt-oss-120b,google-vertex:gemini-3.1-flash,google-api:gemini-3.1-flash"
AI_AGENT_CHAIN="google-vertex:gemini-3.1-pro-preview,groq:openai/gpt-oss-120b"
AI_EMBEDDING_CHAIN="google-vertex:gemini-embedding-001,google-api:gemini-embedding-001"

# Credentials — unchanged
GOOGLE_VERTEX_CREDENTIALS_JSON=...
GOOGLE_GENERATIVE_AI_API_KEYS=...
GROQ_API_KEY=...
OPENAI_API_KEY=...
PINECONE_DB_API_KEY=...
PINECONE_INDEX_NAME=...
```

Valid doors: `google-vertex` · `google-api` · `groq` · `openai`.

### Old → new mapping

| Old | New | Notes |
| --- | --- | ----- |
| `AI_PROVIDER` + `AI_MODEL_ID` | `AI_REVIEW_CHAIN` | Every layer now names its own model — no hidden defaults. |
| `AI_AGENT_MODEL` / `AI_AGENT_MODEL_ID` | `AI_AGENT_CHAIN` | `AI_AGENT_MODEL` is already the single-layer form of this. |
| `AI_EMBEDDING_PROVIDER` + `AI_EMBEDDING_MODEL_ID` | `AI_EMBEDDING_CHAIN` | Kills the two-meanings problem: door and model travel together. |
| `GCP_ENABLED` | **deleted** | The door name is the switch. No global override. |
| `DISABLE_CIRCUIT_BREAKER` | still honoured | Collapses every chain to its first layer. A one-entry chain is the cleaner way to express "no fallback". |
| `HUGGINGFACE_API_KEY` | keep only if you keep an HF layer | Not a valid embedding *fallback* — see the invariant below. |

### The design line

> **Env controls routing** — which door, which model, in what order.
> **Code holds model facts** — context limits, native dimensions, capability tier.

A model ID changing is an operational event you must fix without a deploy. A model's context window is not a tuning knob. This also gives `read_file`'s 400-line cap and the embedding input limit a principled home instead of a hardcoded `slice(0, 8000)`.

### Invariants — enforced at chain resolution, failing loudly

1. **Parse errors throw.** Never silently substitute a default model. That is exactly how the review chain ended up on `flash-lite` and `llama-3.1-8b-instant` unnoticed.
2. **Every layer names its model.** No implicit `DEFAULT_MODEL_ID`.
3. **Every embedding layer names the *same* model.** Vectors from different models are not comparable, so a mixed embedding chain silently corrupts the index. Rejecting it at boot makes that structurally impossible. This is why HF cannot be an embedding fallback — it is a different vector space, i.e. a migration, not a failover.
4. **Doors are validated per role** — `huggingface` is embedding-only.

Still to do: bind embedding identity to the index (record model + dimension, refuse to query on mismatch).

### Falls out of the refactor

- One `runWithChain(role, fn)` gives **embeddings and the agent** the breaker only review has today.
- `meta.provider` can report the door that actually served the call instead of the configured primary.
- Agent capability tier derives from the first reachable layer → `react` / `deterministic` / `disabled` → surfaced to the UI so the Auto-Fix button can tell the truth.
- `google-vertex` becomes Vertex-only, so fallback is explicit in the chain rather than hidden inside `getNextGoogleProvider`.

---

## 4. The embedding change is a migration, not an env flip

Changing the embedding model **invalidates every stored vector**. The current index is 768-dim, and `gemini-embedding-001` truncated to 768 would be *dimensionally compatible but semantically unrelated* — Pinecone would accept the new vectors and cosine-compare them against the old ones, with no error. Retrieval degrades silently.

**Do not flip `AI_EMBEDDING_MODEL_ID` on the existing index.**

### Recommended sequence

1. **Create a new Pinecone index at 3072 dims**, cosine. Dimension cannot be changed in place.
   - 3072 is the native `gemini-embedding-001` output, so `generateEmbedding` needs **no** code change. Targeting 768 would require passing `outputDimensionality` explicitly.
   - Dimension does **not** affect API cost or rate limits — embeddings bill per *input token*. It affects Pinecone storage (~12KB vs ~3KB per vector) only.
   - 3072 is also reversible: `gemini-embedding-001` is Matryoshka-trained, so the first 768 dims are themselves a valid embedding. You can derive a 768 index locally later with zero API calls. Starting at 768 discards that permanently.
2. **Set `PINECONE_INDEX_NAME`** to the new index and `AI_EMBEDDING_MODEL_ID=gemini-embedding-001` (or the embedding chain, post-refactor). Redeploy — `pinecone-db.ts` reads the name at module scope.
3. **Re-index every connected repo.** ~2,000 calls × ~2,000 tokens ≈ 4M input tokens per repo: cents on paid Vertex, potentially days against free-tier daily caps.
4. **Verify** symbol and chunk counts look right, then delete the old index.

### Fix the silent-drop path first

`indexCodebase` catches per-file embedding errors, returns `null`, and filters them out — while `indexedFileCount` is set from `files.length`, not from successful embeds. A rate-limited or 404ing embedding therefore produces a **file missing from the index while the dashboard reports full coverage**. On any capped tier this is the expected steady state, not an edge case. Fix this before re-indexing, or you cannot trust the result.

---

## 5. Recommended order of work

| # | Step | Why now |
| - | ---- | ------- |
| 1 | Run Check 1 against prod values | Embeddings may be 404ing today |
| 2 | Make embedding failures loud (`indexedFileCount` + no silent `null`) | Otherwise the re-index can't be verified |
| 3 | New 3072 index + re-index on Vertex | Bulk one-time work; run it on the fastest available door |
| 4 | Chain refactor (`AI_*_CHAIN`, drop `GCP_ENABLED`) | Removes the whole class of drift bugs |
| 5 | Agent tier → UI | Honest degradation instead of bad patches |

Steps 1–3 unblock a trustworthy index. Step 4 is structural and can follow.

---

## 6. Switching off Vertex

If the Vertex door becomes unavailable, it is one edit per role:

```bash
AI_REVIEW_CHAIN="groq:openai/gpt-oss-120b,google-api:gemini-3.1-flash"
AI_AGENT_CHAIN="groq:openai/gpt-oss-120b"
AI_EMBEDDING_CHAIN="google-api:gemini-embedding-001"
```

Because `gemini-embedding-001` exists on both doors, the embedding switch needs **no re-index** — same model, same vector space, different credential.

Verified 2026-08-23: `groq:openai/gpt-oss-120b` completes the full ReAct loop (read → plan → patch) in ~9s, respecting the line budget. See `scratch/check-agent-door.ts`. So the agent degrades rather than dies. Test the switch by setting these values locally, rather than discovering it during an outage.
