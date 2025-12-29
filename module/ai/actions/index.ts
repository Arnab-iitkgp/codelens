"use server"

import { inngest } from "@/inngest/client"
import prisma from "@/lib/db"
import { getPullRequestDiff } from "@/module/github/lib/github"
import { success } from "zod"
import { canCreateReview, incrementReviewCount } from "@/module/payment/lib/subscription"

export async function reviewPullRequest(owner:string,repo:string,prNumber:number){
    try{
    const repository = await prisma.repository.findFirst({
        where:{
            owner,
            name:repo
        },
        include:{
                user:{
                    include:{
                        accounts:{
                            where:{
                                providerId:"github"
                            }
                        }
                    }
                }
        }
    })
    if(!repository){
        throw new Error(`Repository ${owner}/${repo} not found, please connect the repository first.`)
    }

    const canReview = await canCreateReview (repository.user.id,repository.id)

    if(!canReview){
        throw new Error("Review limit reached for this repository ! upgrade to Pro for unlimited reviews");
    }

    const githubAccount = repository.user.accounts[0]
    if(!githubAccount?.accessToken){
        throw new Error("GitHub account not linked")
    }
    const token = githubAccount.accessToken
    //now we want to see the diff for the repo
    const {title} = await getPullRequestDiff(token,owner,repo,prNumber)

    await inngest.send({
        name:"pr.review.requested",
        data:{
            owner,
            repo,
            prNumber,
            userId:repository.userId,
            title
        }   

    })

    await incrementReviewCount(repository.user.id,repository.id)

    return {success:true,message:`Requested review for PR #${prNumber} in ${owner}/${repo}is Queued`}
    }catch(error){
        try {
            const repository = await prisma.repository.findFirst({
                where:{
                    owner,
                    name:repo
                },})
            if(repository){
                await prisma.review.create({
                    data:{
                        repositoryId:repository.id,
                        prNumber,
                        prTitle:"",
                        prurl:"https://github.com/"+owner+"/"+repo+"/pull/"+prNumber,
                        review:`Failed to request review: ${(error as Error).message}`,
                        status:"failed"
                    }
                })
            }
        } catch (dberror) {
            console.error("Failed to log review failure to database:",dberror)
        }
    }    
}