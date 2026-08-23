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
            
            if (action === "created" && comment.body.includes("@codelens fix")) {
                const prNumber = body.issue ? body.issue.number : body.pull_request?.number;
                const repo = body.repository.full_name;
                const [owner, repoName] = repo.split("/");
                
                // If it's a review comment (has line/path context)
                if (comment.path && (comment.line || comment.original_line)) {
                    console.log(`Triggering Auto-Fix for PR #${prNumber} on ${comment.path}`);
                    
                    // Calls the lib directly: a webhook has no user session, so it
                    // cannot go through the session-checked executeAutoFix action.
                    const { runAutoFixAndComment } = await import("@/module/ai/lib/auto-fix");
                    const endLine = comment.original_line || comment.line;
                    const startLine = comment.original_start_line || comment.start_line || endLine;

                    // Fire and forget so we don't block the webhook response
                    runAutoFixAndComment(owner, repoName, prNumber, comment.path, "User requested Auto-Fix via comment mention.", startLine, endLine)
                        .catch(err => console.error("Webhook Auto-Fix Failed:", err));
                        
                } else {
                    console.log("Mentioned on a general comment without file context.");
                    // In a production app, we would use Octokit here to reply:
                    // "Please mention me in reply to an actual CodeLens inline bug finding!"
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