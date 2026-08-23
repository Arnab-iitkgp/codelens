/** Verifies findings dedup + confidence routing without any LLM call. */
import { partitionFindings, type ReviewOutput } from "../module/review/lib/engine";

const f = (o: Partial<ReviewOutput["findings"][number]>) => ({
  file: "a.ts", startLine: 1, endLine: 1, severity: "warning", category: "bug",
  claim: "c", evidence: "e", suggestion: "s", affects: [], confidence: "2/3", ...o,
} as ReviewOutput["findings"][number]);

const findings = [
  f({ severity: "critical", confidence: "3/3", claim: "crit" }),
  f({ severity: "warning",  confidence: "3/3", startLine: 2 }),
  f({ severity: "warning",  confidence: "2/3", startLine: 3 }),
  f({ severity: "nit",      confidence: "2/3", startLine: 4 }),
  f({ severity: "nit",      confidence: "3/3", startLine: 5 }),
];

for (const lines of [100, 900]) {
  const { primary, secondary } = partitionFindings(findings, lines);
  console.log(`\nPR of ${lines} changed lines:`);
  console.log(`  inline    (${primary.length}): ${primary.map(x => `${x.severity}/${x.confidence}`).join(", ") || "-"}`);
  console.log(`  collapsed (${secondary.length}): ${secondary.map(x => `${x.severity}/${x.confidence}`).join(", ") || "-"}`);
}

const { primary } = partitionFindings(
  Array.from({ length: 40 }, (_, i) => f({ severity: "critical", confidence: "3/3", startLine: i + 1 })),
  100
);
console.log(`\nInline cap with 40 criticals: ${primary.length} (expect 12)`);
