/**
 * Verifies that the agent's tools now advertise a real parameter schema to the
 * provider. Reproduces the exact conversion the AI SDK performs at call time
 * (`ai/dist/index.js`: `inputSchema: await asSchema(tool.inputSchema).jsonSchema`).
 *
 * Run: bunx tsx scratch/test-tool-schema.ts
 */
import { tool } from "ai";
import { z } from "zod";
import { asSchema } from "@ai-sdk/provider-utils";

// What the code does now.
const fixed = tool({
  description: "Read the raw contents of any file from the GitHub repository.",
  inputSchema: z.object({ path: z.string() }),
  execute: async ({ path }) => path,
});

// What the code did before: `parameters` is not a field the SDK reads, so
// `inputSchema` was undefined and asSchema() substituted an empty object schema.
const before = { parameters: z.object({ path: z.string() }) } as unknown as {
  inputSchema: undefined;
};

async function main() {
  const beforeSchema = await asSchema(before.inputSchema).jsonSchema;
  const fixedSchema = await asSchema(fixed.inputSchema).jsonSchema;

  console.log("BEFORE (parameters:) ->", JSON.stringify(beforeSchema));
  console.log("AFTER  (inputSchema:) ->", JSON.stringify(fixedSchema));

  const props = (fixedSchema as { properties?: Record<string, unknown> }).properties ?? {};
  console.log(
    Object.keys(props).includes("path")
      ? "\n✅ 'path' is now advertised to the model."
      : "\n❌ 'path' is still missing from the tool schema."
  );
}

main().catch(console.error);
