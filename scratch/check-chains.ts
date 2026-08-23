/**
 * Verifies chain parsing, the embedding same-model invariant, and legacy fallback.
 * No network calls — pure config resolution.
 *
 * bun run scratch/check-chains.ts
 */
import "dotenv/config";
import { getChain, type Role } from "../module/ai/lib/models";

function show(role: Role) {
  try {
    const chain = getChain(role);
    console.log(`  ${role.padEnd(10)} ${chain.map((l) => `${l.door}:${l.model}`).join("  →  ")}`);
  } catch (e) {
    console.log(`  ${role.padEnd(10)} ❌ ${e instanceof Error ? e.message : String(e)}`);
  }
}

function expectThrow(label: string, env: Record<string, string | undefined>, role: Role) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  let threw = "";
  try {
    getChain(role);
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  console.log(`  ${threw ? "✅ rejected" : "❌ ACCEPTED (should have thrown)"} — ${label}`);
  if (threw) console.log(`     ${threw.slice(0, 130)}`);
}

console.log("── Resolved from your .env ──");
(["review", "agent", "embedding"] as Role[]).forEach(show);

console.log("\n── Invariants (these MUST be rejected) ──");
expectThrow(
  "embedding chain mixing two models (would corrupt the index)",
  { AI_EMBEDDING_CHAIN: "google-vertex:gemini-embedding-001,huggingface:sentence-transformers/all-mpnet-base-v2" },
  "embedding"
);
expectThrow("malformed entry with no colon", { AI_REVIEW_CHAIN: "groq" }, "review");
expectThrow("unknown door", { AI_REVIEW_CHAIN: "azure:gpt-4" }, "review");
expectThrow("huggingface used for a language role", { AI_REVIEW_CHAIN: "huggingface:some-model" }, "review");
expectThrow("empty value", { AI_REVIEW_CHAIN: "   ,  " }, "review");

console.log("\n── Legacy fallback (chain vars unset — must reproduce old behaviour) ──");
const savedChains = {
  AI_REVIEW_CHAIN: process.env.AI_REVIEW_CHAIN,
  AI_EMBEDDING_CHAIN: process.env.AI_EMBEDDING_CHAIN,
  AI_AGENT_CHAIN: process.env.AI_AGENT_CHAIN,
};
delete process.env.AI_REVIEW_CHAIN;
delete process.env.AI_EMBEDDING_CHAIN;
delete process.env.AI_AGENT_CHAIN;
process.env.AI_PROVIDER = "groq";
process.env.AI_MODEL_ID = "openai/gpt-oss-120b";
process.env.GCP_ENABLED = "true";
console.log("  (AI_PROVIDER=groq, AI_MODEL_ID=openai/gpt-oss-120b, GCP_ENABLED=true)");
(["review", "agent", "embedding"] as Role[]).forEach(show);
for (const [k, v] of Object.entries(savedChains)) if (v !== undefined) process.env[k] = v;

console.log("\n── DISABLE_CIRCUIT_BREAKER=true must collapse to one layer ──");
process.env.DISABLE_CIRCUIT_BREAKER = "true";
show("review");
delete process.env.DISABLE_CIRCUIT_BREAKER;
