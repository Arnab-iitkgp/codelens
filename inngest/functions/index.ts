import prisma from "@/lib/db";
import { inngest } from "../client";
import { getRepoFileContents } from "@/module/github/lib/github";
import { indexCodebase } from "@/module/ai/lib/rag";

export const indexRepo  =inngest.createFunction(
  {id:"index-repo"},
  {event:"repository.connected"},
  async({event,step})=>{
      const {owner,repo,userId} =event.data
      
      //fetch files
      const files = await step.run("fetch-files",async()=>{
        const account = await prisma.account.findFirst({
          where:{
            userId:userId,
            providerId:"github"
          }
        })
        if(!account?.accessToken){
          throw new Error("No Github access token found")
        }

        const startFetch = Date.now();
        const result = await getRepoFileContents(account.accessToken,owner,repo);
        console.log(`[INDEXING] Fetched ${result.length} files in ${Date.now() - startFetch}ms`);
        return result;
      })

      await step.run("index-codebase",async ()=>{
        const startIndex = Date.now();
        await indexCodebase(`${owner}/${repo}`,files)
        console.log(`[INDEXING] Embedded ${files.length} files in ${Date.now() - startIndex}ms`);
      })

      // Store indexed file count on the repository
      await step.run("update-repo-metadata", async () => {
        await prisma.repository.updateMany({
          where: { owner, name: repo },
          data: { indexedFileCount: files.length },
        });
      });

      return{success:true,indexedFiles:files.length }
  }
)