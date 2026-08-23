import { pineconeIndex } from "@/lib/pinecone-db";
import { embed } from "ai";
import {
  runWithChain,
  embeddingModelFor,
  maxInputCharsFor,
  getChain,
  type Layer,
} from "@/module/ai/lib/models";
import { InferenceClient } from "@huggingface/inference";

async function embedViaHuggingFace(text: string, modelId: string): Promise<number[]> {
  const hf = new InferenceClient(process.env.HUGGINGFACE_API_KEY);
  const result = await hf.featureExtraction({ model: modelId, inputs: text });

  // HF can return nested arrays (number[][]) depending on the model —
  // flatten if needed (matches proven working pattern)
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as number[];
  }
  return result as number[];
}

/**
 * Embeds text via the embedding chain (AI_EMBEDDING_CHAIN), failing over across
 * credentials. Every layer is guaranteed by `getChain` to name the same model,
 * so a failover never changes the vector space.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return runWithChain("embedding", async (layer: Layer) => {
    if (layer.door === "huggingface") {
      return embedViaHuggingFace(text, layer.model);
    }
    const { embedding } = await embed({
      model: embeddingModelFor(layer),
      value: text,
    });
    return embedding;
  });
}

/** Truncation limit of the configured embedding model, not a hardcoded guess. */
export function embeddingInputLimit(): number {
  const [first] = getChain("embedding");
  return maxInputCharsFor(first.model);
}

export async function indexCodebase(
  repoId: string,
  files: { path: string; content: string }[]
) {
  const pMap = (await import("p-map")).default;
  const limit = embeddingInputLimit();
  const vectors = await pMap(
    files,
    async (file) => {
      const content = `File:  ${file.path}\n\n${file.content}`;
      const truncatedContent = content.slice(0, limit);
      try {
        const embedding = await generateEmbedding(truncatedContent);
        return {
          id: `${repoId}-${file.path.replace(/\//g, "-")}`,
          values: embedding,
          metadata: {
            repoId,
            path: file.path,
            content: truncatedContent,
          },
        };
      } catch (error) {
        console.error(`Failed to generate embedding for file:${file.path}, error: ${error}`);
        return null;
      }
    },
    { concurrency: 5 } // 5 at a time to stay safe on API limits
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validVectors = vectors.filter(Boolean) as any[];
  const failed = vectors.length - validVectors.length;

  if (validVectors.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < validVectors.length; i += batchSize) {
      const chunk = validVectors.slice(i, i + batchSize);
      await pineconeIndex.upsert(chunk);
    }
  }

  // A dropped embedding used to vanish silently while indexedFileCount still
  // reported full coverage — a partially indexed repo that looked complete.
  // Surface it so a capped/misconfigured embedding provider is visible.
  if (failed > 0) {
    console.error(
      `[INDEXING] ⚠️  ${failed}/${vectors.length} files FAILED to embed for ${repoId} — the index is incomplete.`
    );
  }
  console.log(`[INDEXING] indexing completed for repo:${repoId} (${validVectors.length}/${vectors.length} files)`);
  return { total: vectors.length, indexed: validVectors.length, failed };
}

/**
 * Pinecone vector id for a symbol. MUST be derived from stable identity
 * (repo + path + qualifiedName), not the Symbol row's cuid: indexRepo does a
 * wipe-and-rebuild, so every rebuild mints new cuids and a cuid-based id would
 * orphan the previous vector instead of overwriting it — leaking a full
 * duplicate set of symbol vectors into the index on every re-index.
 * Matches the @@unique([repositoryId, path, qualifiedName]) constraint.
 */
function symbolVectorId(repoId: string, path: string, qualifiedName: string): string {
  return `symbol-${repoId}-${path}-${qualifiedName}`.replace(/[^A-Za-z0-9_.\-]/g, "_");
}

export async function indexGraphSymbols(
  repoId: string,
  symbols: { id: string; path: string; qualifiedName: string; kind: string; codeBody: string }[]
) {
  const pMap = (await import("p-map")).default;
  const limit = embeddingInputLimit();
  const vectors = await pMap(
    symbols,
    async (sym) => {
      // Create a rich context string for the symbol
      const content = `Symbol: ${sym.qualifiedName}\nPath: ${sym.path}\nKind: ${sym.kind}\n\n${sym.codeBody}`;
      const truncatedContent = content.slice(0, limit);
      try {
        const embedding = await generateEmbedding(truncatedContent);
        return {
          id: symbolVectorId(repoId, sym.path, sym.qualifiedName),
          values: embedding,
          metadata: {
            type: "symbol",
            symbolId: sym.id,
            repoId,
            path: sym.path,
            kind: sym.kind,
            content: truncatedContent,
          },
        };
      } catch (error) {
        console.error(`Failed to generate embedding for symbol:${sym.qualifiedName}, error: ${error}`);
        return null;
      }
    },
    { concurrency: 5 }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validVectors = vectors.filter(Boolean) as any[];
  const failed = vectors.length - validVectors.length;

  if (validVectors.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < validVectors.length; i += batchSize) {
      const chunk = validVectors.slice(i, i + batchSize);
      await pineconeIndex.upsert(chunk);
    }
  }

  if (failed > 0) {
    console.error(
      `[INDEXING] ⚠️  ${failed}/${vectors.length} symbols FAILED to embed for ${repoId} — the graph index is incomplete.`
    );
  }
  console.log(`[INDEXING] Embedded ${validVectors.length}/${vectors.length} symbols for repo: ${repoId}`);
  return { total: vectors.length, indexed: validVectors.length, failed };
}

export async function retrieveContext(query: string,repoId:string, topK:number=5) {
    const queryEmbedding = await generateEmbedding(query);
    const result = await pineconeIndex.query({
        topK:topK,
        includeMetadata:true,
        vector:queryEmbedding,
        filter:{
            repoId:repoId
        }
    });
    return result.matches?.map((match)=>match.metadata?.content as string).filter(Boolean)
};

// ── Diff-driven retrieval ──────────────────────────────
// Parse a unified diff into per-file hunks. For each hunk, keep the
// *content* of both added and deleted lines (syntax markers stripped),
// so the embedding represents everything the hunk touches — not just
// the after-merge side. The LLM prompt still receives the raw diff
// elsewhere; this text is only for the embedder.

export type DiffHunk = { path: string; hunkText: string };

export function parseUnifiedDiff(diff: string): DiffHunk[] {
  if (!diff || typeof diff !== "string") return [];

  const hunks: DiffHunk[] = [];
  // Split into per-file blocks. The first split entry (before any
  // "diff --git ") is discarded.
  const fileBlocks = diff.split(/^diff --git .*$/m).slice(1);
  const fileHeaderRe = /^diff --git a\/(.+?) b\/(.+?)$/gm;
  const headers = [...diff.matchAll(fileHeaderRe)];

  fileBlocks.forEach((block, i) => {
    const path = headers[i]?.[2] ?? headers[i]?.[1];
    if (!path) return;

    // Split into hunks at @@ markers. Discard the pre-hunk header noise.
    const hunkChunks = block.split(/^@@.*$/m).slice(1);
    for (const chunk of hunkChunks) {
      const lines = chunk.split("\n");
      const textLines: string[] = [];
      for (const line of lines) {
        if (!line || line.startsWith("\\")) continue; // skip "\ No newline at end of file"
        const marker = line[0];
        if (marker === "+" || marker === "-" || marker === " ") {
          textLines.push(line.slice(1));
        }
      }
      const hunkText = textLines.join("\n").trim();
      if (hunkText.length > 0) {
        hunks.push({ path, hunkText });
      }
    }
  });

  return hunks;
}

const MAX_HUNKS_FOR_RETRIEVAL = 8;
const MAX_HUNK_CHARS_FOR_EMBED = 1500;
const PER_HUNK_TOPK = 3;
const MAX_RETURNED_CHUNKS = 8;

export type RetrievedChunk = { path: string; content: string; score: number };

export async function retrieveContextForDiff(
  diff: string,
  repoId: string
): Promise<RetrievedChunk[]> {
  const allHunks = parseUnifiedDiff(diff);
  if (allHunks.length === 0) return [];

  // Cap hunk count. If we're over, keep the largest — biggest hunks
  // usually carry the most semantic content.
  const hunks =
    allHunks.length <= MAX_HUNKS_FOR_RETRIEVAL
      ? allHunks
      : [...allHunks]
          .sort((a, b) => b.hunkText.length - a.hunkText.length)
          .slice(0, MAX_HUNKS_FOR_RETRIEVAL);

  const queries = await Promise.allSettled(
    hunks.map(async (h) => {
      const embedText = h.hunkText.slice(0, MAX_HUNK_CHARS_FOR_EMBED);
      const vec = await generateEmbedding(embedText);
      const res = await pineconeIndex.query({
        topK: PER_HUNK_TOPK,
        includeMetadata: true,
        vector: vec,
        filter: { repoId },
      });
      return res.matches ?? [];
    })
  );

  // Dedupe by path — keep the highest score per file.
  const bestByPath = new Map<string, RetrievedChunk>();
  for (const q of queries) {
    if (q.status !== "fulfilled") continue;
    for (const m of q.value) {
      const path = (m.metadata?.path as string) ?? "";
      const content = (m.metadata?.content as string) ?? "";
      const score = m.score ?? 0;
      if (!path || !content) continue;
      const prev = bestByPath.get(path);
      if (!prev || score > prev.score) {
        bestByPath.set(path, { path, content, score });
      }
    }
  }

  return [...bestByPath.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RETURNED_CHUNKS);
}
