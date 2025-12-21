import { NextResponse,NextRequest } from "next/server";

export async function POST (req:NextRequest){
    try {
        const body = await req.json()
        const event = req.headers.get("x-github-event")
        console.log("Received GitHub webhook event:",event);
        if(event==="ping"){
            return NextResponse.json({msg:"pong"},{status:200})
        }

        //TODO: handle other events like push, pull_request, etc.

        return NextResponse.json({msg:"event processed"},{status:200})
    } catch (error) {
        console.error("Failed to process GitHub webhook:",error);
        return NextResponse.json({msg:"Internal Server Error"},{status:500})
    }
}