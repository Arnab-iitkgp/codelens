"use server"

import prisma from "@/lib/db"
import {auth} from "@/lib/auth"
import { headers } from "next/headers"
import { createWebhook, getRepositories } from "@/module/github/lib/github"
import { AArrowUpIcon } from "lucide-react"
import { inngest } from "@/inngest/client"
import { canConnectRepository, incrementRepositoryCount } from "@/module/payment/lib/subscription"

export async function fetchRepositories ( page:number=1, perPage:number =10){
     const session = await auth.api.getSession ({
        headers: await headers()
     })
     if(!session){
        throw new Error("Unauthorized")
     }

     const githubRepos = await getRepositories(page,perPage)

     const dbRepos = await prisma.repository.findMany({
        where:{
            userId:session.user.id
        }
     });
     const connectedReposId = new Set(dbRepos.map((repo)=>repo.githubId))

     return githubRepos.map((repo:any)=>({
        ...repo,
        isConnected:connectedReposId.has(BigInt(repo.id))
     }))

}

export const connectRepository = async (owner:string,repo:string, githubId:number)=>{
   const session = await auth.api.getSession({
      headers:await headers()
   })

   if(!session){
      throw new Error ("Unauthorized")
   }
   //TODO: cchek if user can connect more repo or not (free vs paid)

   const canConnect = await canConnectRepository(session.user.id);

   if(!canConnect){
      throw new Error("Repository Limit reached. Upgrade to Pro for unlimited repositores connection")
   }

   const webhook = await createWebhook(owner,repo)
   if(webhook){
      await prisma.repository.create({
         data:{
            githubId:BigInt(githubId),
            name:repo,
            owner,
            fullName:`${owner}/${repo}`,
            url:`https://github.com/${owner}/${repo}`,
            userId:session.user.id
         }
      })
   

   //TODO: increment repository count for usage track
      await incrementRepositoryCount(session.user.id)
   // trigger repository indexing for rag.
   try {
      await inngest.send({
         name:"repository.connected",
         data:{
            owner,
            repo,
            userId:session.user.id
         }
      })
   } catch (error) {
         console.error("Failed to trigger repository indexing",error)
   }
}
   return webhook;
}