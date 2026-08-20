import { z } from "zod";
import { generateObjectWithFallback } from "@/module/ai/lib/models";

export const profileSchema = z.object({
  techStack: z.array(z.string()).describe("List of main technologies used (e.g. Next.js, React, Express, Prisma, Tailwind, etc)"),
  layering: z.string().describe("How the application is layered (e.g. MVC, Feature-sliced, Monolith, etc)"),
  namingConventions: z.string().describe("How files, variables, and components are named"),
  errorHandling: z.string().describe("How errors are handled (e.g. try/catch, Result types, global error boundaries)"),
  testingPatterns: z.string().describe("How the code is tested (e.g. Jest, Vitest, no tests)"),
  antiPatterns: z.array(z.string()).describe("List of patterns that should be avoided in this codebase based on the conventions"),
});

export type ArchitectureProfile = z.infer<typeof profileSchema>;

export async function generateArchitectureProfile(
  files: { path: string; content: string }[]
): Promise<string> {
  const fileContents = files
    .map(f => `--- FILE: ${f.path} ---\n${f.content}\n-------------------`)
    .join("\n\n");

  const prompt = `You are a senior software architect analyzing a repository to determine its architecture, conventions, and tech stack.
I have provided a representative sample of files from the repository below.

Analyze these files and generate a structured architecture profile. Be specific about the patterns you observe.

${fileContents}`;

  const result = await generateObjectWithFallback(
    "You are an expert software architect. Output structured JSON based on the provided schema.\n\n" + prompt,
    profileSchema
  );

  // Convert the structured JSON into a beautiful Markdown string
  const md = `
**Tech Stack:** ${result.object.techStack.join(", ")}
**Architecture & Layering:** ${result.object.layering}
**Naming Conventions:** ${result.object.namingConventions}
**Error Handling:** ${result.object.errorHandling}
**Testing Patterns:** ${result.object.testingPatterns}
**Anti-Patterns to Flag:** 
${result.object.antiPatterns.map(p => `- ${p}`).join("\n")}
  `.trim();

  return md;
}
