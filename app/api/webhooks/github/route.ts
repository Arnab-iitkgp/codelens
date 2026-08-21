import { reviewPullRequest } from "@/module/ai/actions";
import { NextResponse,NextRequest } from "next/server";

export async function POST (req:NextRequest){
    try {
        const body = await req.json()
        const event = req.headers.get("x-github-event")
        console.log("Received GitHub webhook event:",event);
        if(event==="ping"){
            return NextResponse.json({msg:"pong"},{status:200})
        }

        if(event!=="pull_request"){
            return NextResponse.json({msg:"event ignored"},{status:200})
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