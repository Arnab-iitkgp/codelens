import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";
import { createVertex } from "@ai-sdk/google-vertex";
import {
  generateText as aiGenerateText,
  generateObject as aiGenerateObject,
  type LanguageModel,
  type EmbeddingModel,
} from "ai";
import { z } from "zod";

// ════════════════════════════════════════════════════════════════════
//  Per-role provider chains (D-018)
//
//  Routing is declared in env as an ordered list of "door:model" pairs, one
//  variable per role. A "door" is the credential path used to reach a model —
//  Vertex (service-account JSON) and AI Studio (API key) are two doors to the
//  same Google models.
//
//    AI_REVIEW_CHAIN="google-vertex:gemini-3.1-flash,google-api:gemini-3.1-flash,groq:openai/gpt-oss-120b"
//    AI_AGENT_CHAIN="google-vertex:gemini-3.1-pro-preview,groq:openai/gpt-oss-120b"
//    AI_EMBEDDING_CHAIN="google-vertex:gemini-embedding-001,google-api:gemini-embedding-001"
//
//  Why door and model travel together: the previous scheme had a separate
//  provider flag and model id, so a fallback layer could silently serve a
//  different model than configured (the review chain ran on flash-lite, and the
//  Groq layer on llama-3.1-8b-instant, unnoticed). Pairing them makes that
//  impossible, and a parse error throws instead of substituting a default.
//
//  env owns ROUTING (which door, which model, what order).
//  code owns MODEL FACTS (context limits, dimensions) — see MODEL_FACTS.
// ════════════════════════════════════════════════════════════════════

export type Door = "google-vertex" | "google-api" | "groq" | "openai" | "huggingface";
export type Role = "review" | "agent" | "embedding";
export type Layer = { door: Door; model: string };

const LANGUAGE_DOORS: Door[] = ["google-vertex", "google-api", "groq", "openai"];
const EMBEDDING_DOORS: Door[] = ["google-vertex", "google-api", "openai", "huggingface"];

const CHAIN_ENV: Record<Role, string> = {
  review: "AI_REVIEW_CHAIN",
  agent: "AI_AGENT_CHAIN",
  embedding: "AI_EMBEDDING_CHAIN",
};

/** Per-model facts that are properties of the model, not operational choices. */
export const MODEL_FACTS: Record<string, { maxInputChars?: number }> = {
  "sentence-transformers/all-mpnet-base-v2": { maxInputChars: 1200 }, // 384-token cap
  "gemini-embedding-001": { maxInputChars: 8000 },
  "text-embedding-004": { maxInputChars: 8000 },
};

export function maxInputCharsFor(model: string): number {
  return MODEL_FACTS[model]?.maxInputChars ?? 8000;
}

// ── Chain parsing ───────────────────────────────────────────────────

function parseChain(spec: string, role: Role, varName: string): Layer[] {
  const allowed = role === "embedding" ? EMBEDDING_DOORS : LANGUAGE_DOORS;

  const layers = spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const sep = entry.indexOf(":");
      if (sep <= 0 || sep === entry.length - 1) {
        throw new Error(
          `${varName}: "${entry}" is not "door:model" (e.g. "groq:openai/gpt-oss-120b")`
        );
      }
      const door = entry.slice(0, sep).trim() as Door;
      const model = entry.slice(sep + 1).trim();
      if (!allowed.includes(door)) {
        throw new Error(
          `${varName}: unknown door "${door}" for role "${role}". Allowed: ${allowed.join(" | ")}`
        );
      }
      return { door, model };
    });

  if (layers.length === 0) throw new Error(`${varName} is set but empty.`);

  // Vectors from different embedding models are not comparable, so a mixed
  // embedding chain would silently corrupt the index rather than degrade.
  // Rejecting it here makes that structurally impossible.
  if (role === "embedding") {
    const distinct = Array.from(new Set(layers.map((l) => l.model)));
    if (distinct.length > 1) {
      throw new Error(
        `${varName}: every layer must name the SAME embedding model (found ${distinct.join(", ")}). ` +
          `Different models produce incomparable vectors — switching model is a re-index, not a fallback.`
      );
    }
  }

  return layers;
}

/**
 * Legacy derivation, used when the role's chain env var is absent, so deploying
 * this code before setting the new variables does not change behaviour.
 */
function legacyChain(role: Role): Layer[] {
  if (role === "agent") {
    const spec = process.env.AI_AGENT_MODEL;
    if (spec) return parseChain(spec, "agent", "AI_AGENT_MODEL");
    const model = process.env.AI_AGENT_MODEL_ID || "gemini-3.1-pro-preview";
    return [{ door: "google-vertex", model }];
  }

  if (role === "embedding") {
    const provider = process.env.AI_EMBEDDING_PROVIDER || "google";
    const model = process.env.AI_EMBEDDING_MODEL_ID;
    if (provider === "huggingface") {
      return [
        { door: "huggingface", model: model || "sentence-transformers/all-mpnet-base-v2" },
      ];
    }
    if (provider === "openai") {
      return [{ door: "openai", model: model || "text-embedding-3-small" }];
    }
    const vertexFirst = process.env.GCP_ENABLED === "true";
    return [{ door: vertexFirst ? "google-vertex" : "google-api", model: model || "gemini-embedding-001" }];
  }

  // review — mirrors the old fallbackOrder, including its hardcoded models.
  const primary = process.env.AI_PROVIDER || "google";
  const primaryModel = process.env.AI_MODEL_ID;
  const vertexFirst = process.env.GCP_ENABLED === "true";
  const chain: Layer[] = [];

  if (primary === "groq") chain.push({ door: "groq", model: primaryModel || "llama-3.1-8b-instant" });
  else if (primary === "openai") chain.push({ door: "openai", model: primaryModel || "gpt-4o-mini" });
  else {
    const model = primaryModel || "gemini-3.1-flash-lite-preview";
    if (vertexFirst) chain.push({ door: "google-vertex", model });
    chain.push({ door: "google-api", model });
  }

  if (primary !== "google" && primary !== "google-vertex") {
    if (vertexFirst) chain.push({ door: "google-vertex", model: "gemini-3.1-flash-lite-preview" });
    else chain.push({ door: "google-api", model: "gemini-3.1-flash-lite-preview" });
  }
  if (primary !== "groq") chain.push({ door: "groq", model: "llama-3.1-8b-instant" });
  if (primary !== "openai") chain.push({ door: "openai", model: "gpt-4o-mini" });

  return chain;
}

const warned = new Set<Role>();

export function getChain(role: Role): Layer[] {
  const varName = CHAIN_ENV[role];
  const spec = process.env[varName];

  let chain: Layer[];
  if (spec && spec.trim()) {
    chain = parseChain(spec, role, varName);
  } else {
    chain = legacyChain(role);
    if (!warned.has(role)) {
      warned.add(role);
      console.warn(
        `[Models] ${varName} is not set — derived a ${role} chain from legacy env ` +
          `(${chain.map((l) => `${l.door}:${l.model}`).join(" → ")}). Set ${varName} to make routing explicit.`
      );
    }
  }

  // A one-entry chain is a chain with no fallback.
  if (process.env.DISABLE_CIRCUIT_BREAKER === "true") return chain.slice(0, 1);
  return chain;
}

// ── Google provider resolution ──────────────────────────────────────

let currentGoogleKeyIndex = Math.floor(Math.random() * 1000);

/**
 * Kept for backwards compatibility and direct callers.
 * `forceStandard = true` never uses Vertex.
 *
 * NOTE: with forceStandard = false this still falls through to API keys when
 * GCP_ENABLED !== "true". Prefer the explicit `google-vertex` / `google-api`
 * doors, which do not overlap.
 */
export function getNextGoogleProvider(forceStandard = false) {
  if (!forceStandard && process.env.GCP_ENABLED === "true" && process.env.GOOGLE_VERTEX_CREDENTIALS_JSON) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_VERTEX_CREDENTIALS_JSON);
      return createVertex({
        project: credentials.project_id,
        location: "global",
        googleAuthOptions: { credentials },
      });
    } catch (e) {
      console.error("[Models] Failed to parse GOOGLE_VERTEX_CREDENTIALS_JSON, falling back to API keys.", e);
    }
  }

  const keysStr = process.env.GOOGLE_GENERATIVE_AI_API_KEYS || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (keysStr) {
    const keys = keysStr.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      const selectedKey = keys[currentGoogleKeyIndex % keys.length];
      currentGoogleKeyIndex++;
      return createGoogleGenerativeAI({ apiKey: selectedKey });
    }
  }
  return google;
}

/** Vertex only — throws rather than silently falling back, so the chain decides. */
function vertexProvider() {
  const raw = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON;
  if (!raw) throw new Error("google-vertex door: GOOGLE_VERTEX_CREDENTIALS_JSON is not set");
  const credentials = JSON.parse(raw);
  return createVertex({
    project: credentials.project_id,
    location: "global",
    googleAuthOptions: { credentials },
  });
}

/** AI Studio API keys only — never Vertex. Rotates across comma-separated keys. */
function apiKeyProvider() {
  const keysStr = process.env.GOOGLE_GENERATIVE_AI_API_KEYS || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!keysStr) throw new Error("google-api door: GOOGLE_GENERATIVE_AI_API_KEY(S) is not set");
  const keys = keysStr.split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error("google-api door: no usable API key");
  const selectedKey = keys[currentGoogleKeyIndex % keys.length];
  currentGoogleKeyIndex++;
  return createGoogleGenerativeAI({ apiKey: selectedKey });
}

// ── Model construction per layer ────────────────────────────────────

export function languageModelFor(layer: Layer): LanguageModel {
  switch (layer.door) {
    case "google-vertex":
      return vertexProvider()(layer.model);
    case "google-api":
      return apiKeyProvider()(layer.model);
    case "groq":
      return groq(layer.model);
    case "openai":
      return openai(layer.model);
    default:
      throw new Error(`Door "${layer.door}" cannot serve a language model`);
  }
}

export function embeddingModelFor(layer: Layer): EmbeddingModel {
  switch (layer.door) {
    case "google-vertex":
      return vertexProvider().textEmbeddingModel(layer.model);
    case "google-api":
      return apiKeyProvider().textEmbeddingModel(layer.model);
    case "openai":
      return openai.embedding(layer.model);
    default:
      throw new Error(`Door "${layer.door}" has no AI SDK embedding model (handle it at the call site)`);
  }
}

// ── Chain runner ────────────────────────────────────────────────────

const lastUsedDoor: Partial<Record<Role, string>> = {};

/** The door:model that actually served the most recent call for a role. */
export function getLastUsedDoor(role: Role): string | undefined {
  return lastUsedDoor[role];
}

/**
 * Walks a role's chain, returning the first layer's result. Every role gets the
 * same failover — previously only review calls did, while the agent and the
 * embedding path had none at all.
 */
export async function runWithChain<T>(
  role: Role,
  run: (layer: Layer) => Promise<T>
): Promise<T> {
  const chain = getChain(role);
  const errors: string[] = [];

  for (const layer of chain) {
    const label = `${layer.door}:${layer.model}`;
    try {
      const result = await run(layer);
      if (errors.length > 0) {
        console.warn(`[AI Chain] ${role}: rerouted to ${label} after ${errors.length} failure(s).`);
      }
      lastUsedDoor[role] = label;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AI Chain] ${role}: ${label} failed — ${message}`);
      errors.push(`${label}: ${message}`);
    }
  }

  throw new Error(
    `[AI Chain] every ${role} layer failed.\n${errors.map((e) => `  - ${e}`).join("\n")}`
  );
}

// ── Public helpers (signatures unchanged for existing callers) ───────

/** First layer of the review chain. Prefer generate*WithFallback, which fails over. */
export function getLanguageModel(modelIdOverride?: string): LanguageModel {
  const [first] = getChain("review");
  return languageModelFor(modelIdOverride ? { ...first, model: modelIdOverride } : first);
}

/**
 * First layer of the embedding chain, for callers that need a raw AI SDK model.
 * Throws for the `huggingface` door, which has no AI SDK model — use
 * `generateEmbedding()` in rag.ts instead, which handles every door.
 */
export function getEmbeddingModel(): EmbeddingModel {
  const [first] = getChain("embedding");
  if (first.door === "huggingface") {
    throw new Error(
      `getEmbeddingModel(): the "huggingface" door has no AI SDK model. Use generateEmbedding() from rag.ts, which routes the whole chain.`
    );
  }
  return embeddingModelFor(first);
}

/** Agent chain. The agent runs a multi-step loop, so it fails over per run, not per call. */
export function getAgentChain(): Layer[] {
  return getChain("agent");
}

export async function generateTextWithFallback(prompt: string) {
  return runWithChain("review", (layer) =>
    aiGenerateText({ model: languageModelFor(layer), prompt })
  );
}

export async function generateObjectWithFallback<T>(prompt: string, schema: z.ZodSchema<T>) {
  return runWithChain("review", async (layer) => {
    const response = await aiGenerateObject({
      model: languageModelFor(layer),
      prompt,
      schema,
    });
    if (response.usage) {
      console.log(
        `[AI Tokens] ${layer.door}:${layer.model} | in=${response.usage.inputTokens} out=${response.usage.outputTokens}`
      );
    }
    return response;
  });
}
