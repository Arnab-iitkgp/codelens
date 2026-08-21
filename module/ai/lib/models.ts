import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";

// ── API Key Rotation (Google) ──────────────────

let currentGoogleKeyIndex = 0;

function getNextGoogleProvider() {
  const keysStr = process.env.GOOGLE_GENERATIVE_AI_API_KEYS || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (keysStr) {
    const keys = keysStr.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      const selectedKey = keys[currentGoogleKeyIndex % keys.length];
      currentGoogleKeyIndex++;
      // Create a custom google provider instance with the rotated key
      return createGoogleGenerativeAI({ apiKey: selectedKey });
    }
  }
  return google; // Fallback to default which uses GOOGLE_GENERATIVE_AI_API_KEY
}

// ── Language Model (for generateText / streamText) ──────────────────

type AIProvider = "google" | "openai" | "groq";

const DEFAULT_PROVIDER: AIProvider = "google";
const DEFAULT_MODEL_ID = "gemini-3.1-flash-lite-preview";

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
      const googleProvider = getNextGoogleProvider();
      return googleProvider(modelId);
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
      const googleProvider = getNextGoogleProvider();
      return googleProvider.textEmbeddingModel(modelId);
  }
}

//Circuit Breaker / Fallback Generation
import { generateText as aiGenerateText, generateObject as aiGenerateObject } from "ai";
import { z } from "zod";

export async function generateTextWithFallback(prompt: string) {
  const primaryProvider = (process.env.AI_PROVIDER as AIProvider) || DEFAULT_PROVIDER;

  // Seq of fallbacks to try in order
  const fallbackOrder: AIProvider[] = [primaryProvider];
  if (process.env.DISABLE_CIRCUIT_BREAKER !== "true") {
    if (primaryProvider !== "google") fallbackOrder.push("google");
    if (primaryProvider !== "groq") fallbackOrder.push("groq");
    if (primaryProvider !== "openai") fallbackOrder.push("openai");
  }

  let lastError = null;

  for (const provider of fallbackOrder) {
    try {
      let model;
      if (provider === "google") {
        const googleProvider = getNextGoogleProvider();
        model = googleProvider(provider === primaryProvider && process.env.AI_MODEL_ID ? process.env.AI_MODEL_ID : "gemini-3.1-flash-lite-preview");
      } else if (provider === "groq") {
        model = groq(provider === primaryProvider && process.env.AI_MODEL_ID ? process.env.AI_MODEL_ID : "llama-3.1-8b-instant");
      } else if (provider === "openai") {
        model = openai(provider === primaryProvider && process.env.AI_MODEL_ID ? process.env.AI_MODEL_ID : "gpt-4o-mini");
      }

      if (!model) throw new Error("No model mapped for provider");

      const response = await aiGenerateText({
        model,
        prompt,
      });

      if (provider !== primaryProvider) {
        console.warn(`[AI Circuit Breaker] Primary provider '${primaryProvider}' failed. Successfully rerouted to '${provider}' with zero downtime.`);
      }

      return response;
    } catch (error) {
      console.error(`[AI Provider Failed] Attempted ${provider}, failed with:`, error);
      lastError = error;
    }
  }

  throw new Error(`[AI Circuit Breaker] ALL underlying AI providers failed. Last Error: ${lastError}`);
}

export async function generateObjectWithFallback<T>(prompt: string, schema: z.ZodSchema<T>) {
  const primaryProvider = (process.env.AI_PROVIDER as AIProvider) || DEFAULT_PROVIDER;

  // Seq of fallbacks to try in order
  const fallbackOrder: AIProvider[] = [primaryProvider];
  if (process.env.DISABLE_CIRCUIT_BREAKER !== "true") {
    if (primaryProvider !== "google") fallbackOrder.push("google");
    if (primaryProvider !== "groq") fallbackOrder.push("groq");
    if (primaryProvider !== "openai") fallbackOrder.push("openai");
  }

  let lastError = null;

  for (const provider of fallbackOrder) {
    try {
      let model;
      if (provider === "google") {
        const googleProvider = getNextGoogleProvider();
        model = googleProvider(provider === primaryProvider && process.env.AI_MODEL_ID ? process.env.AI_MODEL_ID : "gemini-3.1-flash-lite-preview");
      } else if (provider === "groq") {
        model = groq(provider === primaryProvider && process.env.AI_MODEL_ID ? process.env.AI_MODEL_ID : "llama-3.1-8b-instant");
      } else if (provider === "openai") {
        model = openai(provider === primaryProvider && process.env.AI_MODEL_ID ? process.env.AI_MODEL_ID : "gpt-4o-mini");
      }

      if (!model) throw new Error("No model mapped for provider");

      const response = await aiGenerateObject({
        model,
        prompt,
        schema,
      });

      if (provider !== primaryProvider) {
        console.warn(`[AI Circuit Breaker] Primary provider '${primaryProvider}' failed for object generation. Successfully rerouted to '${provider}' with zero downtime.`);
      }

      return response;
    } catch (error) {
      console.error(`[AI Provider Failed] Attempted ${provider} for object generation, failed with:`, error);
      lastError = error;
    }
  }

  throw new Error(`[AI Circuit Breaker] ALL underlying AI providers failed for object generation. Last Error: ${lastError}`);
}
