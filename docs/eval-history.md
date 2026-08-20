# Eval Metrics History

> This file tracks the performance of the CodeLens engine over time. Every time we make a significant architectural or prompt change, we run the eval harness (`bun eval:run` and `bun eval:judge`) and log the overall recall/precision here.

| Date | Phase | Commit / Change | Recall | Latency (avg) | Notes |
| ---- | ----- | --------------- | ------ | ------------- | ----- |
| 2026-08-20 | 0.4 | Adversarial Verify Pass (5 cases) | 80% | ~4.5s | Schema fix applied to bypass Groq strict-mode error. Used 120B model. |
| 2026-08-20 | 0.2 | Added Structured JSON Findings via Zod | TBD | ~18s | Run 12/12 successful. Judge failed midway due to Google Gemini free-tier daily quota limit. |
