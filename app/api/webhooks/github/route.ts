import { reviewPullRequest } from "@/module/ai/actions";
import { NextResponse,NextRequest } from "next/server";
import { act } from "react";

export async function POST (req:NextRequest){
    try {
        const body = await req.json()
        const event = req.headers.get("x-github-event")
        console.log("Received GitHub webhook event:",event);
        if(event==="ping"){
            return NextResponse.json({msg:"pong"},{status:200})
        }

        //TODO: handle other events like push, etc.

        if(event==="pull_request"){
            const action = body.action
            const prNumber = body.number
            const repo = body.repository.full_name
            const [owner,repoName] = repo.split("/");
            console.log(`Pull request #${prNumber} in repository ${repoName} has action: ${action}`);
            if(action ==="opened" || action==="synchronize" || action==="reopened"){
                reviewPullRequest(owner,repoName,prNumber).then(()=>{
                    console.log(`Reviewed pull request #${prNumber} in repository ${repoName}`);
                }).catch((error)=>{
                    console.error(`Failed to review pull request #${prNumber} in repository ${repoName}:`,error);
                });
        }


        return NextResponse.json({msg:"event processed"},{status:200})
    } 
}
    catch (error) {
        console.error("Failed to process GitHub webhook:",error);
        return NextResponse.json({msg:"Internal Server Error"},{status:500})
    }
}