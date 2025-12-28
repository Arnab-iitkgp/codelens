import { pinecone, pineconeIndex } from "@/lib/pinecone-db";
import { embed } from "ai";
import { google } from "@ai-sdk/google";
import { meta } from "zod/v4/core";
import { metadata } from "@/app/layout";

export async function generateEmbedding(text: string) {
  const { embedding } = await embed({
    model: google.textEmbeddingModel("text-embedding-004"),
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
