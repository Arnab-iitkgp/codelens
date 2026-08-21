# Eval Metrics History

> This file tracks the performance of the CodeLens engine over time. Every time we make a significant architectural or prompt change, we run the eval harness (`bun eval:run` and `bun eval:judge`) and log the overall recall/precision here.

| Date | Phase | Commit / Change | Recall | Latency (avg) | Notes |
| ---- | ----- | --------------- | ------ | ------------- | ----- |
| 2026-08-21 | 3E | Review Engine Upgrade (Isolated Diff Run) | 90% | ~3.5s | Passed 5 cases with skipRetrieval. AI Circuit Breaker successfully rerouted Groq to Google during case 4. |
| 2026-08-20 | 0.4 | Adversarial Verify Pass (5 cases) | 80% | ~4.5s | Schema fix applied to bypass Groq strict-mode error. Used 120B model. |
| 2026-08-20 | 0.2 | Added Structured JSON Findings via Zod | TBD | ~18s | Run 12/12 successful. Judge failed midway due to Google Gemini free-tier daily quota limit. |
| 2026-08-20 | 1.0 | 20B Model Baseline (5 cases) | TBD | ~5s | 3/3 correct on first cases. Judge crashed on case-04 due to `json_validate_failed` (model outputted JSON schema instead of JSON object). |
