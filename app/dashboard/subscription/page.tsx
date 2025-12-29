"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { getSubscriptionData, syncSubscriptionStatus } from "@/module/payment/action";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, X } from "lucide-react"; // Added missing icons
import { useSearchParams } from "next/navigation";
import { useState,useEffect } from "react";
import {customer,checkout} from "@/lib/auth-client"

import { toast } from "sonner";
const PLAN_FEATURES = {
  free: [
    { name: "Up to 5 repositories", included: true },
    { name: "Up to 5 reviews per repository", included: true },
    { name: "Basic code reviews", included: true },
    { name: "Community support", included: true },
    { name: "Advanced analytics", included: false },
    { name: "Priority support", included: false },
  ],
  pro: [
    { name: "Unlimited repositories", included: true },
    { name: "Unlimited reviews", included: true },
    { name: "Advanced code reviews", included: true },
    { name: "Email support", included: true },
    { name: "Advanced analytics", included: true },
    { name: "Priority support", included: true },
  ],
};

export default function SubscriptionPage() {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false); // Kept for the Sync button
  
  const searchParams = useSearchParams();
  const success = searchParams.get("success");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["subscription-data"],
    queryFn: getSubscriptionData,
    refetchOnWindowFocus: true,
  });

 useEffect (() => {
    if(success==="true"){
        const sync = async ()=>{
            try {
                await syncSubscriptionStatus()
                refetch()
            } catch (error) {
                console.error("Failed to sync Subscription on success return",error)
            }
        }
        sync()
    }

  }, [success,refetch])
  
  const handleUpgrade = async () => {
   try {
        setCheckoutLoading(true);
        await checkout({
            slug:"pro"
        })
   } catch (error) {
        console.error("Failed to initiate Checkout: ",error)
   }finally{
    setCheckoutLoading(false)
   }
  };

  const handleManageSubscription = async () => {
    try {
        setPortalLoading(true);
        await customer.portal()
    } catch (error) {
        console.error("Failed to open Portal: ",error)
        
    }
    finally{
        setPortalLoading(false);
    }

    
  };

  const handleSync = async () => {
    try {
            setSyncLoading(true)
            const result = await syncSubscriptionStatus()
            if(result.success){
                toast.success("Subscription status Updated")
                refetch();
            }else{
                toast.error("Failed to sync subscription status")
            }
    } catch (error) {
            toast.error("Failed tp sync subscription status")
    }
    finally{
      setSyncLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-red-500">Failed to load subscription data.</div>;
  }

  if (!data?.user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Subscription Plans</h1>
          <p className="text-muted-foreground">Please sign in to view subscription options</p>
        </div>
      </div>
    );
  }

  const currentTier = data.user.subscriptionTier; // "FREE" | "PRO"
  const isPro = currentTier === "PRO";
  const isActive = data.user.subscriptionStatus === "ACTIVE";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscription Plans</h1>
          <p className="text-muted-foreground">Choose The Perfect Plan For Your Needs</p>
        </div>
        <Button variant="outline" onClick={handleSync} disabled={syncLoading}>
           {syncLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
           Sync Status
        </Button>
      </div>

      {/* Success Alert */}
      {success === "true" && (
        <Alert className="border-green-500 text-green-600 bg-green-50/50">
          <Check className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>
            Your subscription has been updated. Changes will take a few moments to reflect.
          </AlertDescription>
        </Alert>
      )}

      {/* Current Usage Card */}
      {data.limits && (
        <Card>
          <CardHeader>
            <CardTitle>Current Usage</CardTitle>
            <CardDescription>Your current plan limits and usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              
              {/* Repository Limit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Repositories</span>
                  <Badge
                    variant={data.limits.repositories.canAdd ? "default" : "destructive"}
                  >
                    {data.limits.repositories.current} / {data.limits.repositories.limit ?? "∞"}
                  </Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      data.limits.repositories.canAdd ? "bg-primary" : "bg-destructive"
                    }`}
                    style={{
                      width: data.limits.repositories.limit
                        ? `${Math.min(
                            (data.limits.repositories.current / data.limits.repositories.limit) * 100,
                            100
                          )}%`
                        : "0%", // If limit is null (unlimited), show empty bar or 0 width
                    }}
                  />
                </div>
              </div>

              {/* Reviews Limit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Reviews per repository</span>
                  <Badge variant="outline">
                    {isPro ? "Unlimited" : "5 per repo"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {isPro
                    ? "You have no limits on code reviews."
                    : "Limited to 5 reviews per repository on the free plan."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Plans Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        
        {/* FREE PLAN */}
        <Card className={!isPro ? "border-primary shadow-sm" : ""}>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Free</CardTitle>
                        <CardDescription>Perfect for getting started</CardDescription>
                    </div>
                    {!isPro && <Badge variant="secondary">Current Plan</Badge>}
                </div>
                <div className="mt-2">
                    <span className="text-3xl font-bold">$0</span>
                    <span className="text-muted-foreground">/month</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    {PLAN_FEATURES.free.map((feature) => (
                        <div key={feature.name} className="flex items-center gap-2">
                            {feature.included ? (
                                <Check className="h-4 w-4 text-primary shrink-0" />
                            ) : (
                                <X className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className={`text-sm ${feature.included ? "" : "text-muted-foreground"}`}>
                                {feature.name}
                            </span>
                        </div>
                    ))}
                </div>
                <Button className="w-full" variant="outline" disabled>
                    {!isPro ? "Current Plan" : "Downgrade"}
                </Button>
            </CardContent>
        </Card>

        {/* PRO PLAN */}
        <Card className={isPro ? "border-primary ring-1 ring-primary shadow-sm" : ""}>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Pro</CardTitle>
                        <CardDescription>For professional developers</CardDescription>
                    </div>
                    {isPro && <Badge>Current Plan</Badge>}
                </div>
                <div className="mt-2">
                    <span className="text-3xl font-bold">$19.99</span>
                    <span className="text-muted-foreground">/month</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    {PLAN_FEATURES.pro.map((feature) => (
                        <div key={feature.name} className="flex items-center gap-2">
                            {feature.included ? (
                                <Check className="h-4 w-4 text-primary shrink-0" />
                            ) : (
                                <X className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className={`text-sm ${feature.included ? "" : "text-muted-foreground"}`}>
                                {feature.name}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Button Logic */}
                {isPro && isActive ? (
                    <Button 
                        className="w-full" 
                        variant="outline" 
                        onClick={handleManageSubscription}
                        disabled={portalLoading}
                    >
                        {portalLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Opening Portal...
                            </>
                        ) : (
                            <>
                                Manage Subscription
                                <ExternalLink className="ml-2 h-4 w-4" />
                            </>
                        )}
                    </Button>
                ) : (
                    <Button 
                        className="w-full" 
                        onClick={handleUpgrade}
                        disabled={checkoutLoading || isPro}
                    >
                        {checkoutLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            "Upgrade to Pro"
                        )}
                    </Button>
                )}
            </CardContent>
        </Card>
      </div>
    </div>
  );
}