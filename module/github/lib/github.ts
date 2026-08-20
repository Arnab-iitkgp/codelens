import { auth } from "@/lib/auth"
import prisma from "@/lib/db"
import { headers } from "next/headers"
import { Octokit } from "octokit";
import { type ReviewOutput } from "@/module/review/lib/engine";



export const getAccessToken = async () => {

  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session) {
    throw new Error("Unauthorized")
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      providerId: "github"
    }
  })
  if (!account) {
    throw new Error("GitHub account not linked");
  }

  return account.accessToken
}

export const fetchUserContributions = async (token: string | null, userName: string) => {
  const octokit = new Octokit({
    auth: token
  })
  const query = `query($userName:String!){
        user(login:$userName){
          contributionsCollection{
            contributionCalendar{
                totalContributions
                weeks{
                    contributionDays{
                        date
                        contributionCount
                        color
                    }
                }
            }
          }
        }
      }`
  interface contributionData {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: number,
          weeks: {
            contributionDays: {
              date: string,
              contributionCount: number,
              color: string
            }[]
          }[]
        }
      }
    }
  }
  try {
    const response: contributionData = await octokit.graphql(query, {
      userName
    })
    return response.user.contributionsCollection.contributionCalendar
  } catch (error) {
    throw new Error("Failed to fetch contributions,error:" + error)
  }
}


export const getRepositories = async (page: number = 1, perPage: number = 10) => {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token })

  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: "updated",
    direction: "desc",
    visibility: "all",
    per_page: perPage,
    page: page
  })

  return data;

}

export const createWebhook = async (owner: string, repo: string) => {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token })

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/webhooks/github`

  const { data: hooks } = await octokit.rest.repos.listWebhooks({
    owner,
    repo
  })

  const existingHook = hooks.find(hook => hook.config.url === webhookUrl)

  if (existingHook) {
    return existingHook
  }

  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json"
    },
    events: ["pull_request"]
  });

  return data;

}

export const deleteWebHook = async (owner: string, repo: string) => {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token })
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/webhooks/github`
  try {
    const { data: hooks } = await octokit.rest.repos.listWebhooks({
      owner,
      repo
    })
    const hooksToDelete = hooks.find(hook => hook.config.url === webhookUrl)
    if (!hooksToDelete) {
      throw new Error("Webhook not found")
    }
    if (hooksToDelete) {
      await octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id: hooksToDelete.id
      })
    }
    return true
  } catch (error) {

    console.error
      ("Failed to delete webhook,error:" + error)

    return false
  }
}

export const getRepoFileContents = async (
  token: string,
  owner: string,
  repo: string,
  path: string = ""
): Promise<{ path: string, content: string }[]> => {
  const pMap = (await import("p-map")).default;
  const octokit = new Octokit({ auth: token })

  // Step 1: Get entire repo tree in a single API call
  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: "HEAD",
    recursive: "true",
  });

  // Step 2: Filter to code files only
  const codeBlobs = tree.tree.filter((item) => {
    if (item.type !== "blob" || !item.path || !item.sha) return false;
    if (item.path.match(/\.(png|jpg|jpeg|gif|svg|pdf|gz|tar|ico|woff|woff2|ttf|eot|mp4|webm|zip)$/i)) return false;
    if (item.path.match(/(^|\/)node_modules\//)) return false;
    if (item.path.match(/package-lock\.json|bun\.lock|yarn\.lock$/)) return false;
    return true;
  });

  // Step 3: Fetch blob contents in parallel (max 10 at a time)
  const files = await pMap(
    codeBlobs,
    async (blob) => {
      try {
        const { data } = await octokit.rest.git.getBlob({
          owner,
          repo,
          file_sha: blob.sha!,
        });
        return {
          path: blob.path!,
          content: Buffer.from(data.content, "base64").toString("utf-8"),
        };
      } catch (error) {
        console.error(`Failed to fetch blob: ${blob.path}`, error);
        return null;
      }
    },
    { concurrency: 10 }
  );

  return files.filter((f): f is { path: string; content: string } => f !== null);
}

export const getPullRequestDiff = async (
  token: string,
  owner: string,
  repo: string,
  prNumber: number
) => {
  const octokit = new Octokit({ auth: token })
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  })

  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: "diff"
    }
  })
  return {
    title: pr.title,
    description: pr.body || "",
    diff: diff as unknown as string
  }
}

export const postReviewComment = async (
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  review: string
) => {
  const octokit = new Octokit({ auth: token })
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: `## Automated Code Review\n\n${review}
          \n\n
*This review was generated automatically by codelens.*

        `

  })
}

export const postInlineReview = async (
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  reviewObj: ReviewOutput,
  fallbackMarkdown: string
) => {
  const octokit = new Octokit({ auth: token });
  
  // 1. Format the top-level review body (Summary & Walkthrough)
  let body = `## Automated Code Review\n\n`;
  body += `**Summary:** ${reviewObj.summary}\n\n`;
  body += `**Walkthrough:**\n${reviewObj.walkthrough}\n\n`;
  if (reviewObj.sequenceDiagram) {
    body += `**Flow:**\n\`\`\`mermaid\n${reviewObj.sequenceDiagram}\n\`\`\`\n\n`;
  }
  if (reviewObj.strengths?.length > 0) {
    body += `**Strengths:**\n${reviewObj.strengths.map(s => `- ${s}`).join("\n")}\n\n`;
  }
  body += `*This review was generated automatically by CodeLens.*`;

  // 2. Format the inline comments mapping structured JSON to GitHub's schema
  const comments = reviewObj.findings.map(finding => {
    const emoji = finding.severity === "critical" ? "🚨" : finding.severity === "warning" ? "⚠️" : "💡";
    let commentBody = `### ${emoji} [${finding.category}] ${finding.severity.toUpperCase()}\n`;
    commentBody += `**Issue:** ${finding.claim}\n\n`;
    commentBody += `**Evidence:** ${finding.evidence}\n\n`;
    commentBody += `**Suggestion:** ${finding.suggestion}`;
    
    return {
      path: finding.file,
      line: finding.startLine, // GitHub API needs exactly 'line' for a single-line comment
      body: commentBody
    };
  });

  // 3. Attempt to post the inline review
  try {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      event: "COMMENT", 
      body,
      comments
    });
    console.log(`[github] Successfully posted inline review to PR #${prNumber}`);
  } catch (error: unknown) {
    // 4. THE TRAP: If the AI hallucinated a line number, GitHub throws a 422.
    // We catch it and fall back to the old way so the review isn't lost.
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[github] Failed to post inline review (likely a 422 line number mismatch). Falling back to general comment. Error: ${errorMessage}`);
    await postReviewComment(token, owner, repo, prNumber, fallbackMarkdown);
  }
};

export const getRepoSampleFiles = async (
  token: string,
  owner: string,
  repo: string,
  sampleSize: number = 20
): Promise<{ path: string; content: string }[]> => {
  const pMap = (await import("p-map")).default;
  const octokit = new Octokit({ auth: token });

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: "HEAD",
    recursive: "true",
  });

  let codeBlobs = tree.tree.filter((item) => {
    if (item.type !== "blob" || !item.path || !item.sha) return false;
    if (item.path.match(/\.(png|jpg|jpeg|gif|svg|pdf|gz|tar|ico|woff|woff2|ttf|eot|mp4|webm|zip)$/i)) return false;
    if (item.path.match(/(^|\/)node_modules\//)) return false;
    if (item.path.match(/package-lock\.json|bun\.lock|yarn\.lock$/)) return false;
    return true;
  });

  // Heuristic sampling: Prioritize root config files, then src/app/lib files.
  codeBlobs = codeBlobs.sort((a, b) => {
    const aPath = a.path!;
    const bPath = b.path!;
    
    const aScore = (aPath.includes("/") ? 0 : 50) + 
      (aPath.match(/package\.json|schema\.prisma|dockerfile/i) ? 100 : 0) +
      (aPath.match(/^(src|app|lib|module)\//) ? 20 : 0);
      
    const bScore = (bPath.includes("/") ? 0 : 50) + 
      (bPath.match(/package\.json|schema\.prisma|dockerfile/i) ? 100 : 0) +
      (bPath.match(/^(src|app|lib|module)\//) ? 20 : 0);
      
    return bScore - aScore; // Descending
  });

  const sampledBlobs = codeBlobs.slice(0, sampleSize);

  const files = await pMap(
    sampledBlobs,
    async (blob) => {
      try {
        const { data } = await octokit.rest.git.getBlob({
          owner,
          repo,
          file_sha: blob.sha!,
        });
        return {
          path: blob.path!,
          content: Buffer.from(data.content, "base64").toString("utf-8"),
        };
      } catch (error) {
        console.error(`Failed to fetch blob: ${blob.path}`, error);
        return null;
      }
    },
    { concurrency: 5 }
  );

  return files.filter((f): f is { path: string; content: string } => f !== null);
};
