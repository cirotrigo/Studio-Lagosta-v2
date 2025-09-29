"use client";

import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditStatus } from "@/components/credits/credit-status";
import { PlanGrid } from "@/components/billing/plan-grid";
import { usePublicPlans } from "@/hooks/use-public-plans";
import { Skeleton } from "@/components/ui/skeleton";
import { useCredits } from "@/hooks/use-credits";
import { useSetPageMetadata } from "@/contexts/page-metadata";
import { CreditCard } from "lucide-react";

export default function BillingPage() {
  const { user, isLoaded } = useUser();
  const { credits, isLoading } = useCredits();
  const { data: plansData, isLoading: isLoadingPlans } = usePublicPlans();

  useSetPageMetadata({
    title: "Cobrança e Assinatura",
    description: "Gerencie seus créditos, plano e histórico de uso",
    breadcrumbs: [
      { label: "Início", href: "/dashboard" },
      { label: "Cobrança" }
    ]
  });

  if (!isLoaded || !user || isLoading || isLoadingPlans) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="plans" className="space-y-6">
        <TabsList>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="usage">Status dos Créditos</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Escolha Seu Plano
              </CardTitle>
              <CardDescription>
                Selecione o plano que melhor se adequa às suas necessidades
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlanGrid plans={plansData?.plans || []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status dos Créditos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CreditStatus showUpgradeButton={credits?.isLow} />
              
              {credits?.isLow && (
                <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded-lg">
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    <strong>Atenção:</strong> Seus créditos estão acabando. 
                    Considere fazer upgrade do seu plano.
                  </p>
                </div>
              )}

              {credits?.isEmpty && (
                <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    <strong>Sem créditos:</strong> Você não pode realizar novas operações. 
                    Faça upgrade do seu plano para continuar.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
