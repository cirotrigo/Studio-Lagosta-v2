import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface PlanSummaryCardsProps {
  totalPlans: number;
  activePlans: number;
}

export function PlanSummaryCards({ totalPlans, activePlans }: PlanSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total de Planos</CardTitle>
          <div className="text-2xl font-bold">{totalPlans}</div>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Planos Ativos</CardTitle>
          <div className="text-2xl font-bold text-green-600">{activePlans}</div>
        </CardHeader>
      </Card>
    </div>
  );
}
