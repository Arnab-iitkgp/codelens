import { auth } from "@/lib/auth"
import prisma from "@/lib/db"
import { headers } from "next/headers"
import {Octokit} from "octokit"

export const getAccessToken  = async ()=>{

    const session = await auth.api.getSession({
        headers:await headers()
    })

    if(!session){
        throw new Error("Unauthorized")
    }

    const account = await prisma.account.findFirst({
        where:{
            userId:session.user.id,
            providerId:"github"
        }
    })
    if(!account){
        throw new Error("GitHub account not linked");
    }

    return account.accessToken
}

export const fetchUserContributions = async (token:string | null, username:string)=>{
    const octokit = new Octokit({
        auth:token})
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
      interface contributionData{
        user:{
            contributionsCollection:{
                contributionCalendar:{
                    totalContributions:number,
                    weeks:{
                        contributionDays:{
                            date:string,
                            contributionCount:number,
                            color:string
                        }[]
                    }[]
                }
        }
      }
    }
        try{
      const response:contributionData = await octokit.graphql(query,{
        username
      })
        return response.user.contributionsCollection.contributionCalendar   
    }catch(error){
        throw new Error("Failed to fetch contributions")
    }
}