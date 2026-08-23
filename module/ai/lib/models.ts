import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";

// ── API Key Rotation (Google) ──────────────────

import { createVertex } from '@ai-sdk/google-vertex';

let currentGoogleKeyIndex = Math.floor(Math.random() * 1000);

export function getNextGoogleProvider(forceStandard = false) {
  // 1. GCP Vertex AI (Enterprise Priority)
  if (!forceStandard && process.env.GCP_ENABLED === "true" && process.env.GOOGLE_VERTEX_CREDENTIALS_JSON) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_VERTEX_CREDENTIALS_JSON);
      return createVertex({
        project: credentials.project_id,
        location: 'global',
        googleAuthOptions: { credentials },
      });
    } catch (e) {
      console.error("[Models] Failed to parse GOOGLE_VERTEX_CREDENTIALS_JSON, falling back to API keys.", e);
    }
  }

  // 2. Standard API Keys (Fallback)
  const keysStr = process.env.GOOGLE_GENERATIVE_AI_API_KEYS || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (keysStr) {
    const keys = keysStr.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      const selectedKey = keys[currentGoogleKeyIndex % keys.length];
      currentGoogleKeyIndex++;
      return createGoogleGenerativeAI({ apiKey: selectedKey });
    }
  }
  return google; // Default fallback
}

// ── Language Model (for generateText / streamText) ──────────────────

type AIProvider = "google-vertex" | "google" | "openai" | "groq";

const DEFAULT_PROVIDER: AIProvider = "google";
const DEFAULT_MODEL_ID = "gemini-3.1-flash-lite-preview";

export function getLanguageModel(modelIdOverride?: string) {
  const provider = (process.env.AI_PROVIDER as AIProvider) || DEFAULT_PROVIDER;
  const modelId = modelIdOverride || process.env.AI_MODEL_ID || DEFAULT_MODEL_ID;

  switch (provider) {
    case "openai":
      return openai(modelId);
    case "groq":
      return groq(modelId);
    case "google-vertex":
      return getNextGoogleProvider(false)(modelId);
    case "google":
    default:
      // If AI_PROVIDER=google, but GCP_ENABLED=true, we still try Vertex first.
      return getNextGoogleProvider(false)(modelId);
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
      const googleProvider = getNextGoogleProvider(false);
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
    // If primary is google, we add google-standard explicit fallback before groq
    if (primaryProvider === "google" && process.env.GCP_ENABLED === "true") {
      fallbackOrder.push("google"); // We will force standard in the loop
    }
    if (primaryProvider !== "google") fallbackOrder.push("google");
    if (primaryProvider !== "groq") fallbackOrder.push("groq");
    if (primaryProvider !== "openai") fallbackOrder.push("openai");
  }

  let lastError = null;
  let hasTriedVertex = false;

  for (const provider of fallbackOrder) {
    try {
      let model;
      if (provider === "google" || provider === "google-vertex") {
        const isStandardFallback = provider === "google" && hasTriedVertex;
        const googleProvider = getNextGoogleProvider(isStandardFallback);
        model = googleProvider(provider === primaryProvider && process.env.AI_MODEL_ID ? process.env.AI_MODEL_ID : "gemini-3.1-flash-lite-preview");
        if (!isStandardFallback) hasTriedVertex = true;
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
        console.warn(`[AI Circuit Breaker] Successfully rerouted to fallback '${provider}' with zero downtime.`);
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
    // If primary is google, we add google-standard explicit fallback before groq
    if (primaryProvider === "google" && process.env.GCP_ENABLED === "true") {
      fallbackOrder.push("google"); // We will force standard in the loop
    }
    if (primaryProvider !== "google") fallbackOrder.push("google");
    if (primaryProvider !== "groq") fallbackOrder.push("groq");
    if (primaryProvider !== "openai") fallbackOrder.push("openai");
  }

  let lastError = null;
  let hasTriedVertex = false;

  for (const provider of fallbackOrder) {
    try {
      let model;
      if (provider === "google" || provider === "google-vertex") {
        const isStandardFallback = provider === "google" && hasTriedVertex;
        const googleProvider = getNextGoogleProvider(isStandardFallback);
        model = googleProvider(provider === primaryProvider && process.env.AI_MODEL_ID ? process.env.AI_MODEL_ID : "gemini-3.1-flash-lite-preview");
        if (!isStandardFallback) hasTriedVertex = true;
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
        console.warn(`[AI Circuit Breaker] Successfully rerouted to fallback '${provider}' with zero downtime.`);
      }

      if (response.usage) {
        const usage = response.usage as any;
        console.log(`[AI Tokens] Provider: ${provider} | Input: ${usage.promptTokens} | Output: ${usage.completionTokens}`);
      }

      return response;
    } catch (error) {
      console.error(`[AI Provider Failed] Attempted ${provider} for object generation, failed with:`, error);
      lastError = error;
    }
  }

  throw new Error(`[AI Circuit Breaker] ALL underlying AI providers failed for object generation. Last Error: ${lastError}`);
}
