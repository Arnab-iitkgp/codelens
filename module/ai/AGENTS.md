# AI Module — Agent Context

> Model selection, embeddings, and RAG retrieval live here.

## What this module does

1. **Provider abstraction** (`lib/models.ts`) — wraps Google, OpenAI, Groq behind
   a unified interface. The user picks a provider via `AI_PROVIDER` env var.
   `generateTextWithFallback()` implements a circuit-breaker: if the primary
   provider fails, it tries the others in sequence.

2. **Embeddings** (`lib/rag.ts:generateEmbedding`) — supports Google, OpenAI, and
   HuggingFace embedding models. Provider set via `AI_EMBEDDING_PROVIDER`.

3. **Indexing** (`lib/rag.ts:indexCodebase`) — embeds entire files as single
   vectors (truncated to 8000 chars). Stores in Pinecone with `{repoId, path, content}`.

4. **Retrieval** (`lib/rag.ts:retrieveContextForDiff`) — parses unified diff into
   hunks, embeds each hunk, queries Pinecone per-hunk, dedupes by file path,
   returns top-K results with scores.

## Known limitations

| Issue | Detail | Planned fix |
| ----- | ------ | ----------- |
| Whole-file vectors | One embedding per file, truncated at 8k chars. Large files lose tail content. Small utility functions are drowned in file noise. | Phase 3: per-symbol chunking via ts-morph |
| No symbol awareness | Retrieval returns "similar files," not specific functions/types | Phase 3: symbol-level embeddings |
| No reference graph | Can't look up callers/callees of changed code | Phase 4: import + call edge extraction |
| Top-K cap = 8 | At most 8 context chunks returned per review | May need tuning |
| 8 hunk limit | Only top 8 largest hunks are used for retrieval queries | May need smarter hunk selection |

## Rules for editing this module

1. Never hardcode a provider. All model selection goes through `getLanguageModel()` /
   `getEmbeddingModel()` / `generateTextWithFallback()`.
2. Embedding dimension must match the Pinecone index config. Don't change models
   without verifying dimension compatibility.
3. When adding a new provider, add it to the fallback chain in
   `generateTextWithFallback()` AND the embedding path.
4. `retrieveContextForDiff()` must always return `RetrievedChunk[]` with `{path, content, score}`.
   Downstream code depends on this shape.

## Key types

```typescript
type RetrievedChunk = { path: string; content: string; score: number };
type DiffHunk = { path: string; hunkText: string };
```
