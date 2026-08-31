import { reviewPullRequest, triggerReindex } from "@/module/ai/actions";
import { NextResponse,NextRequest } from "next/server";

export async function POST (req:NextRequest){
    try {
        const body = await req.json()
        const event = req.headers.get("x-github-event")
        console.log("Received GitHub webhook event:",event);
        if(event==="ping"){
            return NextResponse.json({msg:"pong"},{status:200})
        }

        if(event!=="pull_request" && event!=="push" && event!=="pull_request_review_comment" && event!=="issue_comment"){
            return NextResponse.json({msg:"event ignored"},{status:200})
        }

        if (event === "pull_request_review_comment" || event === "issue_comment") {
            const action = body.action;
            const comment = body.comment;
            
            if (action === "created" && comment.body.trim().startsWith("/fix")) {
                const prNumber = body.issue ? body.issue.number : body.pull_request?.number;
                const repo = body.repository.full_name;
                const [owner, repoName] = repo.split("/");
                
                // If it's a review comment (has line/path context)
                if (comment.path && (comment.line || comment.original_line || comment.in_reply_to_id)) {
                    console.log(`Triggering Auto-Fix for PR #${prNumber} on ${comment.path}`);
                    
                    const { runAutoFixAndComment } = await import("@/module/ai/lib/auto-fix");
                    const { getAccessToken } = await import("@/module/github/lib/github");
                    const { Octokit } = await import("octokit");

                    let findingText = comment.body.replace(/^\/fix/i, "").trim() || "User requested Auto-Fix via comment command.";
                    let targetEndLine = comment.original_line || comment.line || 1;
                    let targetStartLine = comment.original_start_line || comment.start_line || targetEndLine;

                    // If this is a reply to an existing CodeLens finding comment, fetch parent for exact context
                    if (comment.in_reply_to_id) {
                        try {
                            const { default: prisma } = await import("@/lib/db");
                            const repository = await prisma.repository.findFirst({
                                where: { owner, name: repoName },
                                include: { user: { include: { accounts: { where: { providerId: "github" } } } } }
                            });
                            const token = repository?.user?.accounts?.[0]?.accessToken;
                            if (!token) throw new Error("No linked GitHub account found for repo owner");
                            
                            const octokit = new Octokit({ auth: token });
                            const { data: parentComment } = await octokit.rest.pulls.getReviewComment({
                                owner,
                                repo: repoName,
                                comment_id: comment.in_reply_to_id,
                            });

                            if (parentComment?.body) {
                                const userInstructions = comment.body.replace(/^\/fix/i, "").trim();
                                findingText = `Original Bug Finding:\n${parentComment.body}`;
                                if (userInstructions) {
                                    findingText += `\n\nUser's Additional Instructions:\n${userInstructions}`;
                                }
                                targetEndLine = parentComment.original_line || parentComment.line || targetEndLine;
                                targetStartLine = parentComment.original_start_line || parentComment.start_line || targetEndLine;
                                console.log(`Resolved parent comment context for L${targetStartLine}-${targetEndLine}`);
                            }
                        } catch (parentErr) {
                            console.warn("Failed to fetch parent comment context, using reply context:", parentErr);
                        }
                    }

                    // Fire and forget so we don't block the webhook response
                    runAutoFixAndComment(owner, repoName, prNumber, comment.path, findingText, targetStartLine, targetEndLine)
                        .catch(err => console.error("Webhook Auto-Fix Failed:", err));
                        
                } else {
                    console.log("Mentioned on a general comment without file context.");
                }
            }
            return NextResponse.json({msg:"comment processed"},{status:200});
        }

        if (event === "push") {
            const ref = body.ref;
            const repo = body.repository.full_name;
            const defaultBranch = body.repository.default_branch;
            
            if (ref === `refs/heads/${defaultBranch}`) {
                const [owner, repoName] = repo.split("/");
                
                try {
                    await triggerReindex(owner, repoName);
                    console.log(`Successfully queued re-index for repository ${repoName} after push to ${defaultBranch}`);
                } catch (error) {
                    console.error(`Failed to queue re-index for repository ${repoName}:`, error);
                }
            }
            return NextResponse.json({msg:"push event processed"},{status:200});
        }

        if(event==="pull_request"){
            const action = body.action
            const prNumber = body.number
            const repo = body.repository.full_name
            const [owner,repoName] = repo.split("/");
            console.log(`Pull request #${prNumber} in repository ${repoName} has action: ${action}`);
            
            if (action === "opened" || action === "synchronize" || action === "reopened") {
                try {
                    await reviewPullRequest(owner, repoName, prNumber);
                    console.log(`Successfully queued review for PR #${prNumber} in repository ${repoName}`);
                } catch (error) {
                    console.error(`Failed to queue review for pull request #${prNumber} in repository ${repoName}:`, error);
                }
            }

            return NextResponse.json({msg:"event processed"},{status:200})
        }

        return NextResponse.json({ msg: "event ignored" }, { status: 200 })
    } catch (error) {
        console.error("Failed to process GitHub webhook:", error);
        return NextResponse.json({ msg: "Internal Server Error" }, { status: 500 })
    }
}