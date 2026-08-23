/**
 * Read-only capability probe for embedding models.
 *
 * Answers three questions before we commit to an embedding model:
 *   1. Which model IDs actually resolve on Vertex (JSON credential) vs the
 *      AI Studio API key? The cross-credential fallback is only valid for a
 *      model that exists on BOTH doors under a known ID.
 *   2. What vector length does each return, and does outputDimensionality=768
 *      work (so we can keep the existing 768-dim Pinecone index)?
 *   3. What dimension is the live Pinecone index actually configured for?
 *
 * Writes nothing. Run: npx tsx scratch/check-embedding-models.ts
 */
import "dotenv/config";
import { embed } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Pinecone } from "@pinecone-database/pinecone";

const CANDIDATES = [
  "gemini-embedding-2-preview",
  "gemini-embedding-001",
  "text-embedding-004",
  "text-embedding-005",
  "text-multilingual-embedding-002",
];

const SAMPLE = "export function calculateTax(price: number) { return price * 1.2; }";

type Row = {
  model: string;
  door: string;
  dims: number | null;
  dims768: number | null;
  error: string | null;
};

function short(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, " ").slice(0, 110);
}

function buildVertex() {
  const raw = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    const credentials = JSON.parse(raw);
    return createVertex({
      project: credentials.project_id,
      location: "global",
      googleAuthOptions: { credentials },
    });
  } catch (e) {
    console.error("  [vertex] credential parse failed:", short(e));
    return null;
  }
}

function buildApiKey() {
  const keysStr =
    process.env.GOOGLE_GENERATIVE_AI_API_KEYS ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!keysStr) return null;
  const key = keysStr.split(",")[0]?.trim();
  if (!key) return null;
  return createGoogleGenerativeAI({ apiKey: key });
}

/** Embed once and return the vector length, or throw. */
async function probe(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  model: string,
  outputDimensionality?: number
): Promise<number> {
  const { embedding } = await embed({
    model: provider.textEmbeddingModel(model),
    value: SAMPLE,
    ...(outputDimensionality
      ? { providerOptions: { google: { outputDimensionality } } }
      : {}),
  });
  return embedding.length;
}

async function probeDoor(
  doorName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  rows: Row[]
) {
  console.log(`\n── ${doorName} ──`);
  for (const model of CANDIDATES) {
    const row: Row = { model, door: doorName, dims: null, dims768: null, error: null };
    try {
      row.dims = await probe(provider, model);
      console.log(`  ✅ ${model.padEnd(34)} ${row.dims} dims`);
      try {
        row.dims768 = await probe(provider, model, 768);
        const ok = row.dims768 === 768 ? "honoured" : `IGNORED -> ${row.dims768}`;
        console.log(`     └─ outputDimensionality=768: ${ok}`);
      } catch (e) {
        console.log(`     └─ outputDimensionality=768: rejected (${short(e)})`);
      }
    } catch (e) {
      row.error = short(e);
      console.log(`  ❌ ${model.padEnd(34)} ${row.error}`);
    }
    rows.push(row);
  }
}

async function pineconeDimension() {
  const name = process.env.PINECONE_INDEX_NAME;
  const apiKey = process.env.PINECONE_DB_API_KEY;
  if (!name || !apiKey) {
    console.log("  (PINECONE_INDEX_NAME / PINECONE_DB_API_KEY not set — skipped)");
    return null;
  }
  const pc = new Pinecone({ apiKey });
  const desc = await pc.describeIndex(name);
  console.log(`  index "${name}": dimension=${desc.dimension}, metric=${desc.metric}`);
  const stats = await pc.index(name).describeIndexStats();
  console.log(`  vectors currently stored: ${stats.totalRecordCount ?? "unknown"}`);
  return desc.dimension ?? null;
}

async function main() {
  console.log("Embedding capability probe (read-only)\n");
  console.log("Credentials seen locally:");
  console.log(`  GOOGLE_VERTEX_CREDENTIALS_JSON : ${process.env.GOOGLE_VERTEX_CREDENTIALS_JSON ? "set" : "MISSING"}`);
  console.log(`  GOOGLE_GENERATIVE_AI_API_KEY(S): ${process.env.GOOGLE_GENERATIVE_AI_API_KEYS || process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "set" : "MISSING"}`);

  const rows: Row[] = [];

  const vertex = buildVertex();
  if (vertex) await probeDoor("Vertex (JSON credential)", vertex, rows);
  else console.log("\n── Vertex: no usable credential, skipped ──");

  const apiKey = buildApiKey();
  if (apiKey) await probeDoor("AI Studio (API key)", apiKey, rows);
  else console.log("\n── AI Studio: no API key, skipped ──");

  console.log("\n── Pinecone ──");
  let indexDim: number | null = null;
  try {
    indexDim = await pineconeDimension();
  } catch (e) {
    console.log(`  could not describe index: ${short(e)}`);
  }

  console.log("\n═══ VERDICT ═══");
  const worksOnBoth = CANDIDATES.filter((m) => {
    const v = rows.find((r) => r.door.startsWith("Vertex") && r.model === m && r.dims);
    const a = rows.find((r) => r.door.startsWith("AI Studio") && r.model === m && r.dims);
    return v && a;
  });

  if (worksOnBoth.length === 0) {
    console.log("No candidate resolved on BOTH doors → cross-credential fallback");
    console.log("is not possible with these IDs. Losing one door = full re-index.");
  } else {
    console.log("Usable on BOTH doors (same vector space, safe to fall back):");
    for (const m of worksOnBoth) {
      const v = rows.find((r) => r.door.startsWith("Vertex") && r.model === m)!;
      const a = rows.find((r) => r.door.startsWith("AI Studio") && r.model === m)!;
      const match = v.dims === a.dims ? "dims match" : `DIMS DIFFER (${v.dims} vs ${a.dims})`;
      const fits =
        indexDim == null
          ? ""
          : v.dims === indexDim
          ? ` — fits index as-is`
          : v.dims768 === 768 && indexDim === 768
          ? ` — fits index if pinned to 768`
          : ` — needs a new ${v.dims}-dim index`;
      console.log(`  • ${m}: ${v.dims} dims, ${match}${fits}`);
    }
  }
  if (indexDim != null) console.log(`\nLive index dimension: ${indexDim}`);
}

main().catch(console.error);
