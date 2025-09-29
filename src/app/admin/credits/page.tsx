"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  CreditCard,
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users
} from "lucide-react";
import {
  useAdminCredits,
  useAdjustCredits,
  type CreditBalance
} from "@/hooks/admin/use-admin-credits";

export default function CreditsPage() {
  const [selectedUser, setSelectedUser] = useState<CreditBalance | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"add" | "subtract">("add");
  const [dialogOpen, setDialogOpen] = useState(false);

  // TanStack Query hooks
  const { data: creditsData, isLoading: loading } = useAdminCredits({
    page: 1,
    pageSize: 1000,
    includeUsageCount: true
  });

  const adjustCreditsMutation = useAdjustCredits();

  const creditBalances = creditsData?.creditBalances || [];

  const handleAdjustCredits = () => {
    if (!selectedUser || !creditAmount) return;

    const amount = parseInt(creditAmount);
    const finalAmount = adjustmentType === "add" ? amount : -amount;

    adjustCreditsMutation.mutate(
      {
        creditBalanceId: selectedUser.id,
        adjustment: finalAmount
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setCreditAmount("");
          setSelectedUser(null);
        }
      }
    );
  };

  const totalCredits = creditBalances.reduce(
    (sum, balance) => sum + balance.creditsRemaining,
    0
  );

  const averageCredits = creditBalances.length > 0
    ? Math.round(totalCredits / creditBalances.length)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gerenciamento de Créditos</h1>
          <p className="text-muted-foreground mt-2">Monitore e gerencie os créditos dos usuários</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Total de Créditos</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {totalCredits.toLocaleString()}
              </p>
            </div>
            <CreditCard className="h-8 w-8 text-purple-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Saldo Médio</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {averageCredits.toLocaleString()}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Usuários Ativos</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {creditBalances.length}
              </p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Saldo Baixo</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {creditBalances.filter(b => b.creditsRemaining < 10).length}
              </p>
            </div>
            <TrendingDown className="h-8 w-8 text-red-500" />
          </div>
        </Card>
      </div>

      <DataTable
        data={creditBalances as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "user",
            header: "Usuário",
            render: (balance: unknown) => {
              const b = balance as CreditBalance;
              return (
                <div>
                  <p className="font-medium text-foreground">
                    {b.user.name || "Sem nome"}
                  </p>
                  <p className="text-sm text-muted-foreground">{b.user.email}</p>
                </div>
              );
            },
          },
          {
            key: "creditsRemaining",
            header: "Créditos Restantes",
            render: (balance: unknown) => {
              const b = balance as CreditBalance;
              return (
                <div className="flex items-center space-x-2">
                  <span className="text-foreground font-medium">
                    {b.creditsRemaining.toLocaleString()}
                  </span>
                  {b.creditsRemaining > 100 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : b.creditsRemaining < 10 ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : null}
                </div>
              );
            },
          },
          {
            key: "usage",
            header: "Contagem de Uso",
            render: (balance: unknown) => {
              const b = balance as CreditBalance;
              return (
                <span className="text-muted-foreground">
                  {b._count?.usageHistory || 0} operações
                </span>
              );
            },
          },
          {
            key: "lastSyncedAt",
            header: "Última Sincronização",
            render: (balance: unknown) => {
              const b = balance as CreditBalance;
              return (
                <span className="text-muted-foreground">
                  {new Date(b.lastSyncedAt).toLocaleString()}
                </span>
              );
            },
          },
          {
            key: "status",
            header: "Status",
            render: (balance: unknown) => {
              const b = balance as CreditBalance;
              return (
                <Badge
                  variant="outline"
                  className={
                    b.creditsRemaining > 50
                      ? "border-green-500 text-green-500"
                      : b.creditsRemaining > 10
                      ? "border-yellow-500 text-yellow-500"
                      : "border-red-500 text-red-500"
                  }
                >
                  {b.creditsRemaining > 50 ? "Saudável" :
                   b.creditsRemaining > 10 ? "Baixo" : "Crítico"}
                </Badge>
              );
            },
          },
          {
            key: "actions",
            header: "Ações",
            className: "text-right",
            render: (balance: unknown) => {
              const b = balance as CreditBalance;
              return (
                <Dialog open={dialogOpen && selectedUser?.id === b.id} onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) {
                  setSelectedUser(null);
                  setCreditAmount("");
                }
              }}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedUser(b)}
                  >
                    Ajustar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">Ajustar Créditos</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Ajustar saldo de créditos para {b.user.name || b.user.email}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Saldo Atual</Label>
                      <div className="text-2xl font-bold text-foreground">
                        {b.creditsRemaining.toLocaleString()} créditos
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo de Ajuste</Label>
                      <div className="flex space-x-2">
                        <Button
                          variant={adjustmentType === "add" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAdjustmentType("add")}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Adicionar
                        </Button>
                        <Button
                          variant={adjustmentType === "subtract" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAdjustmentType("subtract")}
                        >
                          <Minus className="h-4 w-4 mr-1" />
                          Subtrair
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amount">
                        Quantidade
                      </Label>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="Digite a quantidade de créditos"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        className="pl-3"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleAdjustCredits}
                      className="bg-primary hover:bg-primary/90"
                      disabled={adjustCreditsMutation.isPending}
                    >
                      {adjustCreditsMutation.isPending ? "Aplicando..." : "Aplicar Ajuste"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
                </Dialog>
              );
            },
          },
        ]}
        searchable={true}
        searchPlaceholder="Pesquisar por usuário..."
        searchKeys={["user"]}
        loading={loading}
        countLabel="saldos de crédito"
        emptyMessage="Nenhum saldo de crédito encontrado"
      />
    </div>
  );
}