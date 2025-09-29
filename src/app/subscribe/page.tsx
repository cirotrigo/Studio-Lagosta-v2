"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanGrid } from "@/components/billing/plan-grid";
import { usePublicPlans } from "@/hooks/use-public-plans";
import { SimpleTopbar } from "@/components/app/simple-topbar";
import { CreditCard } from "lucide-react";

export default function SubscribePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full">
      <SimpleTopbar />
      <main className="container mx-auto max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Selecione um plano para continuar
            </CardTitle>
            <CardDescription>
              Você precisa de um plano ativo (gratuito ou pago) para usar o aplicativo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SubscribePlans />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function SubscribePlans() {
  const { data } = usePublicPlans()
  return <PlanGrid plans={data?.plans || []} />
}
