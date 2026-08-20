export type FindingKind = "bug" | "security" | "smell" | "perf" | "style";

export type ExpectedFinding = {
  file: string;
  line?: number;
  kind: FindingKind;
  description: string;
};

export type CaseMeta = {
  id: string;
  title: string;
  description: string;
  source?: string;
  notes?: string;
};

export type EvalCase = {
  meta: CaseMeta;
  diff: string;
  groundTruth: { findings: ExpectedFinding[] };
};

export type CaseResult = {
  caseId: string;
  output: string;
  latencyMs: number;
  meta: {
    retrievalMode: string;
    chunkCount: number;
    provider: string;
  };
  timestamp: string;
};

export type JudgedFinding = ExpectedFinding & {
  mentioned: boolean;
  evidence: string;
};

export type JudgedCase = {
  caseId: string;
  provider: string;
  recall: number;
  findings: JudgedFinding[];
};
