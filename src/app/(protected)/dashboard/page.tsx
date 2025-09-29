"use client";

import { useUser } from "@clerk/nextjs";
import { CreditStatus } from "@/components/credits/credit-status";
import { useSetPageMetadata } from "@/contexts/page-metadata";

export default function DashboardPage() {
  const { user } = useUser();
  
  useSetPageMetadata({
    title: `Bem-vindo, ${user?.firstName || "Usuário"}!`,
    description: "Aqui está uma visão geral da sua conta",
    breadcrumbs: [
      { label: "Início" }
    ]
  });
  
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <CreditStatus />
    </div>
  );
}