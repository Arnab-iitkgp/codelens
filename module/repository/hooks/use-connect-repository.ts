"use client"

import {useMutation, useQueryClient} from '@tanstack/react-query'
import { connectRepository } from '../action'
import {toast} from 'sonner'

export const useConnectRepository =()=>{
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn:async({owner,repo,githubId}:{owner:string,repo:string,githubId:number})=>{
                return await connectRepository(owner,repo,githubId)
        },
        onSuccess:()=>{
            toast.success("Repository connected succesfully")
            queryClient.invalidateQueries({queryKey:["repositories"]})
        },
        onError: (err)=>{
            toast.error("Failed to connect Rzepository")
            console.error(err);
        }
    })
}
