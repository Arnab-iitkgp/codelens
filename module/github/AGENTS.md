# GitHub Module — Agent Context

> GitHub API interactions: OAuth tokens, repo content fetching, PR diffs, comment posting.

## What this module does

All GitHub API calls go through `lib/github.ts` using the `octokit` package.

### Key functions

| Function | Purpose |
| -------- | ------- |
| `getAccessToken()` | Gets the current user's GitHub OAuth token from DB (session-based) |
| `getRepoFileContents()` | Fetches entire repo tree + blob contents for indexing. Uses `git.getTree` + `git.getBlob` |
| `getPullRequestDiff()` | Fetches PR metadata (title, body) and the unified diff |
| `postReviewComment()` | Posts a review as a single issue comment |
| `createWebhook()` / `deleteWebHook()` | Manages PR event webhooks on repos |

## Known issues

1. **`postReviewComment` posts a single comment** (line 234). It uses
   `issues.createComment`, not the Pull Request Review API. Phase 0.3 will
   switch to `pulls.createReview` with `comments[]` for inline, per-line comments.

2. **File filtering is extension-based only** (line 173). No `.gitignore` respect,
   no language tagging, no test/config/generated classification. Phase 1.1.

3. **`getAccessToken()` uses `headers()` from Next.js** — only works in
   server component / server action context. Inngest functions get the token
   directly from DB via `prisma.account.findFirst()`.

## Rules

1. All GitHub API calls must use the user's OAuth token, never a hardcoded PAT.
2. When fetching repo contents for indexing, respect rate limits (use p-map concurrency).
3. The webhook URL is built from `NEXT_PUBLIC_APP_BASE_URL` — ensure this is set correctly.
