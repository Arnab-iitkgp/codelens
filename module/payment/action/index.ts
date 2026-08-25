"use server";
import { auth } from "@/lib/auth";
import { getRemainingLimits, updatePolarCustomerId, updateUserTier } from "@/module/payment/lib/subscription";
import { headers } from "next/headers";
import { polarClient } from "@/module/payment/config/polar";
import prisma from "@/lib/db";

export interface SubscriptionData {
    user: {
        id: string;
        name: string;
        email: string;
        subscriptionTier: string;
        subscriptionStatus: string | null;
        polarCustomerId: string | null;
        polarSubscriptionId: string | null;
    } | null;
    limits: {
        tier: "FREE" | "PRO";
        repositories: {
            current: number;
            limit: number | null;
            canAdd: boolean;
        };
        reviews: {
            [repositoryId: string]: {
                current: number;
                limit: number | null;
                canAdd: boolean;
            };
        };
    } | null;
}

export async function getSubscriptionData(): Promise<SubscriptionData> {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        return { user: null, limits: null };
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    });

    if (!user) {
        return { user: null, limits: null };
    }

    const limits = await getRemainingLimits(user.id);

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            subscriptionTier: user.subscriptionTier || "FREE",
            subscriptionStatus: user.subscriptionStatus || null,
            polarCustomerId: user.polarCustomerId || null,
            polarSubscriptionId: user.polarSubscriptionId || null,
        },
        limits,
    };
}

export async function syncSubscriptionStatus() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        throw new Error("Not authenticated");
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    });

    if (!user) {
        return { success: false, message: "User not found" };
    }

    try {
        let customerId = user.polarCustomerId;

        // If polarCustomerId is not saved on the user record, look up by user email in Polar
        if (!customerId && user.email) {
            const customerResult = await polarClient.customers.list({
                email: user.email,
            });
            const items = customerResult.result?.items || [];
            if (items.length > 0) {
                customerId = items[0].id;
                await updatePolarCustomerId(user.id, customerId);
                console.log(`[Polar Sync] Linked customerId ${customerId} for user ${user.email}`);
            }
        }

        if (!customerId) {
            return { success: false, message: "No Polar customer found for your account email." };
        }

        // Fetch subscriptions from Polar
        const result = await polarClient.subscriptions.list({
            customerId: customerId,
        });

        const subscriptions = result.result?.items || [];

        // Find active subscription or latest subscription
        const activeSub = subscriptions.find((sub: any) => sub.status === 'active' || sub.status === 'trialing');
        const latestSub = subscriptions[0];

        if (activeSub) {
            await updateUserTier(user.id, "PRO", "ACTIVE", activeSub.id);
            return { success: true, status: "ACTIVE" };
        } else if (latestSub) {
            const status = latestSub.status === 'canceled' ? 'CANCELED' : 'EXPIRED';
            if (latestSub.status !== 'active' && latestSub.status !== 'trialing') {
                await updateUserTier(user.id, "FREE", status, latestSub.id);
            }
            return { success: true, status };
        }

        return { success: true, status: "NO_SUBSCRIPTION" };
    } catch (error) {
        console.error("Failed to sync subscription:", error);
        return { success: false, error: "Failed to sync with Polar" };
    }
}