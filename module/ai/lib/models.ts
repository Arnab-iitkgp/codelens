/**
 * Central AI Provider Factory
 *
 * Makes the codebase model-agnostic. To switch providers, just update
 * these env vars in .env:
 *
 *   AI_PROVIDER=google|openai|groq              (default: google)
 *   AI_MODEL_ID=gemini-2.5-flash                (default: gemini-2.5-flash)
 *   AI_EMBEDDING_PROVIDER=google|openai|huggingface  (default: google)
 *   AI_EMBEDDING_MODEL_ID=text-embedding-004    (default: text-embedding-004)
 *
 * Required API key env vars per provider:
 *   google      → GOOGLE_GENERATIVE_AI_API_KEY
 *   openai      → OPENAI_API_KEY
 *   groq        → GROQ_API_KEY
 *   huggingface → HUGGINGFACE_API_KEY
 */

import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";

// ── Language Model (for generateText / streamText) ──────────────────

type AIProvider = "google" | "openai" | "groq";

const DEFAULT_PROVIDER: AIProvider = "google";
const DEFAULT_MODEL_ID = "gemini-2.5-flash";

export function getLanguageModel() {
  const provider = (process.env.AI_PROVIDER as AIProvider) || DEFAULT_PROVIDER;
  const modelId = process.env.AI_MODEL_ID || DEFAULT_MODEL_ID;

  switch (provider) {
    case "openai":
      return openai(modelId);
    case "groq":
      return groq(modelId);
    case "google":
    default:
      return google(modelId);
  }
}

// ── Embedding Model (for RAG / vector search) ───────────────────────

type EmbeddingProvider = "google" | "openai";

const DEFAULT_EMBEDDING_PROVIDER: EmbeddingProvider = "google";
const DEFAULT_EMBEDDING_MODEL_ID = "text-embedding-004";

export function getEmbeddingModel() {
  const provider =
    (process.env.AI_EMBEDDING_PROVIDER as EmbeddingProvider) ||
    DEFAULT_EMBEDDING_PROVIDER;
  const modelId =
    process.env.AI_EMBEDDING_MODEL_ID || DEFAULT_EMBEDDING_MODEL_ID;

  switch (provider) {
    case "openai":
      return openai.embedding(modelId);
    case "google":
    default:
      return google.textEmbeddingModel(modelId);
  }
}
