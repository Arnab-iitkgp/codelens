# Eval Harness — Agent Context

> The keystone. Every pipeline change must move these numbers or it doesn't ship.

## How it works

1. **Cases** (`cases/`) — each case is a directory with `meta.json` (PR metadata,
   expected findings) and `diff.patch` (the unified diff).
2. **Runner** (`run.ts`) — feeds each case through `runReview()` with
   `skipRetrieval: true`. Saves output + metadata to `results/<timestamp>/`.
3. **Judge** (`judge.ts`) — LLM-as-judge compares review output against expected
   findings. Produces recall scores with verbatim-quote evidence.

## Commands

```bash
bun eval:run         # Run all cases, produce output files
bun eval:judge       # Score the most recent run
```

## Adding a new test case

1. Create `eval/cases/<case-id>/meta.json`:
   ```json
   {
     "id": "case-id",
     "title": "PR title",
     "description": "PR description",
     "expectedFindings": [
       { "file": "path/to/file.ts", "line": 42, "kind": "bug", "description": "..." }
     ]
   }
   ```
2. Create `eval/cases/<case-id>/diff.patch` with the unified diff.
3. Run `bun eval:run` and `bun eval:judge`.

## What's NOT measured yet

- False-positive rate (needs control set of clean PRs)
- Retrieval quality (runs with `skipRetrieval: true`)
- Latency & cost tables (data captured but not surfaced)

## Rules

1. Never skip the eval after a pipeline change. Run it, document the delta.
2. Cases should come from real PRs with known issues (CVE patches, bug fixes).
3. The judge must require verbatim-quote evidence to prevent hallucinated scores.
