# CodeLens Eval Harness (v1)

The keystone from `REVIEW_ENGINE_PLAN.md` Phase 0.5. Its one job: **produce a number**. Every subsequent phase has to move that number or it doesn't ship.

## What it measures (today)

- **Recall** — for each fixture PR, what fraction of the expected findings did the review output mention? LLM-as-judge scores this with a verbatim-quote evidence field to keep the judge honest.

## What it does NOT measure yet

- **False-positive rate** — needs a control set of clean PRs. Deferred.
- **Retrieval quality** — eval runs with `skipRetrieval: true` because eval repos aren't indexed in Pinecone. Deferred to Phase 3 when we start touching retrieval seriously.
- **Latency & cost tables** — captured in `run.json` but not surfaced in the report yet. Cheap to add later.

## Layout

```
eval/
  cases/
    case-01-sql-injection/
      meta.json          # { title, description, source, notes }
      diff.txt           # unified diff of the PR
      ground-truth.json  # { findings: [{file, line, kind, description}, ...] }
  lib/
    types.ts
    cases.ts
  run.ts                 # runs the pipeline over every case, saves outputs
  judge.ts               # LLM-scores an existing run, writes report.md
  results/               # gitignored; one directory per run
    <timestamp>-<provider>/
      <caseId>.output.md
      <caseId>.meta.json
      run.json
      judged.json        # after `bun eval:judge`
      report.md          # after `bun eval:judge`
```

## Usage

```bash
# 1. Run the pipeline over every fixture. Uses AI_PROVIDER from .env.
bun eval:run

# 2. Judge the most recent run (or pass a specific run dir).
bun eval:judge
# or:
bun eval:judge eval/results/2026-06-22T...-google
```

## Adding a new case

1. Create `eval/cases/<case-id>/` (kebab-case id).
2. Add `meta.json`: `{ "title", "description", "source"?, "notes"? }`.
3. Add `diff.txt`: the unified diff exactly as it would come from `git diff` or GitHub's diff endpoint.
4. Add `ground-truth.json`: `{ findings: [{ file, line?, kind, description }, ...] }`
   - `kind` ∈ `bug | security | smell | perf | style`.
   - `description` should be specific enough that the judge can decide whether the review mentioned it.

## Comparing providers

Run twice with different providers:

```bash
AI_PROVIDER=google bun eval:run && bun eval:judge
AI_PROVIDER=groq bun eval:run && bun eval:judge
```

Each writes a separate results directory. Compare the two `report.md` files side by side.

## Fixtures: synthetic vs. real

The initial fixtures (`case-01` through `case-06`) are **synthetic** — small diffs inspired by well-known bug classes from real post-mortems and CVEs, but not lifted from any specific PR. Marked `"source": "synthetic"` in `meta.json`. They exercise the pipeline against realistic bug shapes without risk of misrepresenting a real repo.

To harden the eval, add **real public PRs**. Good sources:

- **Security-advisory-linked PRs** — search GitHub for `label:"security" is:merged is:pr` in high-signal repos (Express, Next.js, Prisma, FastAPI, Rails, Django).
- **"Fixes #NNN" PRs where the linked issue has a clear repro** — the issue body often describes exactly what should have been caught.
- **Revert PRs** — a "revert X" PR strongly implies X shipped a real bug; the reverted PR's diff is your fixture, and the issue thread names the finding.

**To snapshot a real PR as a fixture:**

```bash
# 1. Get the diff (works for any public PR)
curl -L https://github.com/<owner>/<repo>/pull/<n>.diff > eval/cases/<case-id>/diff.txt

# 2. Write meta.json (title, description from the PR page, source = the PR URL)
# 3. Write ground-truth.json — findings from the linked issue / post-mortem / revert reasoning
```

Snapshotting locks in a specific bytes-of-diff so the fixture is stable even if the PR is later force-pushed or the repo disappears.

## Baseline

After Phase 0.5 the day-zero baseline is committed in `eval/results/`. Every subsequent phase records its own run for side-by-side comparison. Track the "Overall recall" line in each `report.md`.
