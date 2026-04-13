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
  const vectors = [];
  for (const file of files) {
    const content = `File:  ${file.path}\n\n${file.content}`;
    const truncatedContent = content.slice(0, 8000); // for token limit taking 8000 chars, can extend later on requirement
    try {
      const embedding = await generateEmbedding(truncatedContent);

      vectors.push({
        id: `${repoId}-${file.path.replace(/\//g, "-")}`,
        values: embedding,
        metadata: {
          repoId,
          path: file.path,
          content: truncatedContent,
        },
      });
    } catch (error) {
      console.error(
        "Failed to generate embedding for file:" + file.path + ",error:" + error
      );
    }
  }

  if (vectors.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const chunk = vectors.slice(i, i + batchSize);
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
