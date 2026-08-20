import { readFileSync, readdirSync } from "fs";
import path from "path";
import type { EvalCase } from "./types";

const CASES_DIR = path.join(process.cwd(), "eval", "cases");

export function loadAllCases(): EvalCase[] {
  const entries = readdirSync(CASES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => loadCase(e.name))
    .sort((a, b) => a.meta.id.localeCompare(b.meta.id));
}

export function loadCase(caseId: string): EvalCase {
  const dir = path.join(CASES_DIR, caseId);
  const meta = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf-8"));
  const diff = readFileSync(path.join(dir, "diff.txt"), "utf-8");
  const groundTruth = JSON.parse(
    readFileSync(path.join(dir, "ground-truth.json"), "utf-8")
  );
  return { meta: { ...meta, id: caseId }, diff, groundTruth };
}
