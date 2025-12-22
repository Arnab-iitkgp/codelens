"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { deleteWebHook } from "@/module/github/lib/github";

export const getuserProfile = async () => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    const user = await prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    });
    return user;
  } catch (error) {
    console.error("Error in fetching user profile: ", error);
    return null;
  }
};

export async function updateUserProfile(data: {
  name?: string;
  email?: string;
}) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) {
      throw new Error("Unauthorized");
    }
    const updateUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        name: data.name,
        email: data.email,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    revalidatePath("/dashboard/settings", "page");
    return {
      success: true,
      user: updateUser,
    };
  } catch (error) {
    console.error("Error in fetching user profile: ", error);
    return null;
  }
}

export async function getConnectedRepositories() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) {
      throw new Error("Unauthorized");
    }
    const repositories = await prisma.repository.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        fullName: true,
        url: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return repositories;
  } catch (error) {
    console.error("Error in fetching connected repositories:", error);
    return [];
  }
}

export async function disconnectRepository(repositoryId: string) {
    try {
        const session = await auth.api.getSession({
            headers:await headers()
        })
        if(!session?.user){
            throw new Error("Unauthorized")
        }

        const repository = await prisma.repository.findUnique({
            where:{
                id:repositoryId,
                userId:session.user.id
            }
        })
        if(!repository){
            throw new Error("Repository not found")
        }

        await deleteWebHook(repository.owner,repository.name)

        await prisma.repository.delete({
            where:{
                id:repositoryId,
                userId:session.user.id
            }
        })  
        revalidatePath("/dashboard/settings","page")
        revalidatePath("/dashboard/repository","page")
        return {success:true}
    } catch (error) {  
        console.error("Error in disconnecting repository:",error)
        return {success:false,error:"Failed to disconnect repository "}
    }
}

export async function disconnectAllRepositories() {
    try{

        const session = await auth.api.getSession({
            headers:await headers()
        })  
    if(!session?.user){
        throw new Error("Unauthorized") 

    }

    const repositories = await prisma.repository.findMany({
        where:{
            userId:session.user.id
        }
    })

    await Promise.all(repositories.map(async(repo)=>{
        await deleteWebHook(repo.owner,repo.name)
    }
    ))
    await prisma.repository.deleteMany({
        where:{
            userId:session.user.id  
        }
    })
    revalidatePath("/dashboard/settings","page")
    revalidatePath("/dashboard/repository","page")
    return {success:true}
    }catch(error){
        console.error("Error in disconnecting all repositories:",error)
        return {success:false,error:"Failed to disconnect all repositories "}
    }

}


