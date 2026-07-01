import { pinecone, pineconeIndex } from "@/lib/pinecone-db";
import { embed } from "ai";
import { getEmbeddingModel } from "@/module/ai/lib/models";
import { InferenceClient } from "@huggingface/inference";

const DEFAULT_HF_EMBEDDING_MODEL = "sentence-transformers/all-mpnet-base-v2";

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = process.env.AI_EMBEDDING_PROVIDER || "google";

  if (provider === "huggingface") {
    const hf = new InferenceClient(process.env.HUGGINGFACE_API_KEY);
    const modelId =
      process.env.AI_EMBEDDING_MODEL_ID || DEFAULT_HF_EMBEDDING_MODEL;

    const result = await hf.featureExtraction({
      model: modelId,
      inputs: text,
    });

    // HF can return nested arrays (number[][]) depending on the model —
    // flatten if needed (matches proven working pattern)
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result[0] as number[];
    }
    return result as number[];
  }

  // Default path: use Vercel AI SDK (google / openai)
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: text,
  });
  return embedding;
}

export async function indexCodebase(
  repoId: string,
  files: { path: string; content: string }[]
) {
  const pMap = (await import("p-map")).default;
  const vectors = await pMap(
    files,
    async (file) => {
      const content = `File:  ${file.path}\n\n${file.content}`;
      const truncatedContent = content.slice(0, 8000); // 8000 char token limit
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
  
  const validVectors = vectors.filter(Boolean) as any[];

  if (validVectors.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < validVectors.length; i += batchSize) {
      const chunk = validVectors.slice(i, i + batchSize);
      await pineconeIndex.upsert(chunk);
    }
  }
  console.log("indexing completed for repo:" + repoId);
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
