"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Filter,
  Download,
  Calendar,
  User,
  CreditCard,
  MessageSquare,
  Image
} from "lucide-react";
import { useUsageHistory, UsageRecord } from "@/hooks/use-usage-history";


export default function UsagePage() {
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState("7days");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Use TanStack Query hook for usage history data
  const { data, isLoading, error } = useUsageHistory({
    type: filterType !== "all" ? filterType : undefined,
    range: dateRange,
    q: searchTerm,
    page,
    pageSize,
  });

  // Extract usage history and total from the hook response
  const usageHistory = data?.data || [];
  const total = data?.total || 0;

  const exportToCSV = () => {
    const headers = ["Data", "Usuário", "Email", "Operação", "Créditos"];
    const rows = usageHistory.map(record => [
      new Date(record.timestamp).toLocaleString(),
      record.user.name || "Desconhecido",
      record.user.email,
      record.operationType.replace(/_/g, " "),
      record.creditsUsed.toString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-history-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case "AI_TEXT_CHAT":
        return <MessageSquare className="h-4 w-4" />;
      case "AI_IMAGE_GENERATION":
        // eslint-disable-next-line jsx-a11y/alt-text
        return <Image className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getOperationColor = (type: string) => {
    switch (type) {
      case "AI_TEXT_CHAT":
        return "text-blue-500";
      case "AI_IMAGE_GENERATION":
        return "text-purple-500";
      default:
        return "text-gray-500";
    }
  };

  const totalCreditsUsed = usageHistory.reduce(
    (sum, record) => sum + record.creditsUsed,
    0
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground">Failed to load usage data</p>
          <p className="text-sm text-destructive mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Histórico de Uso</h1>
          <p className="text-muted-foreground mt-2">Acompanhe o consumo de créditos e a atividade do usuário</p>
        </div>
        <Button
          variant="outline"
          onClick={exportToCSV}
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Total de Operações</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {total.toLocaleString()}
              </p>
            </div>
            <Activity className="h-8 w-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Créditos Consumidos</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {totalCreditsUsed.toLocaleString()}
              </p>
            </div>
            <CreditCard className="h-8 w-8 text-purple-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Média de Créditos/Operação (página)</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {usageHistory.length > 0 
                  ? Math.round(totalCreditsUsed / usageHistory.length)
                  : 0}
              </p>
            </div>
            <Activity className="h-8 w-8 text-green-500" />
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Pesquisar por usuário..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => { setPage(1); setSearchTerm(e.target.value) }}
            />
          </div>

          <Select value={filterType} onValueChange={(v) => { setPage(1); setFilterType(v) }}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Operações</SelectItem>
              <SelectItem value="AI_TEXT_CHAT">Chat de Texto</SelectItem>
              <SelectItem value="AI_IMAGE_GENERATION">Geração de Imagem</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={(v) => { setPage(1); setDateRange(v) }}>
            <SelectTrigger className="w-[150px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24hours">Últimas 24 Horas</SelectItem>
              <SelectItem value="7days">Últimos 7 Dias</SelectItem>
              <SelectItem value="30days">Últimos 30 Dias</SelectItem>
              <SelectItem value="all">Desde o Início</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <DataTable
        data={usageHistory as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "timestamp",
            header: "Data e Hora",
            render: (record: unknown) => {
              const item = record as UsageRecord;
              return (
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground text-sm">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>
              );
            },
          },
          {
            key: "user",
            header: "Usuário",
            render: (record: unknown) => {
              const item = record as UsageRecord;
              return (
                <div>
                  <p className="font-medium text-foreground">
                    {item.user.name || "Sem nome"}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.user.email}</p>
                </div>
              );
            },
          },
          {
            key: "operationType",
            header: "Operação",
            render: (record: unknown) => {
              const item = record as UsageRecord;
              return (
                <div className="flex items-center space-x-2">
                  <span className={getOperationColor(item.operationType)}>
                    {getOperationIcon(item.operationType)}
                  </span>
                  <span className="text-foreground">
                    {item.operationType.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
              );
            },
          },
          {
            key: "creditsUsed",
            header: "Créditos",
            render: (record: unknown) => {
              const item = record as UsageRecord;
              return (
                <Badge variant="outline" className="border-border text-muted-foreground">
                  -{item.creditsUsed}
                </Badge>
              );
            },
          },
          {
            key: "details",
            header: "Detalhes",
            render: (record: unknown) => {
              const item = record as UsageRecord;
              return <JsonCell value={item.details} />;
            },
          },
        ]}
        searchable={false}
        loading={isLoading}
        countLabel="registros de uso"
        emptyMessage="Nenhum histórico de uso encontrado para os filtros selecionados"
        headerContent={
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {total > 0 ? (
                <span>
                  Mostrando {Math.min((page - 1) * pageSize + 1, total)}–
                  {Math.min(page * pageSize, total)} de {total}
                </span>
              ) : (
                <span>0 resultados</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => { setPage(1); setPageSize(Number(v)) }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Linhas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / página</SelectItem>
                  <SelectItem value="25">25 / página</SelectItem>
                  <SelectItem value="50">50 / página</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <Button variant="outline" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>
                  Próximo
                </Button>
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}

function JsonCell({ value }: { value: unknown }) {
  const [open, setOpen] = React.useState(false)

  if (value == null) return <span className="text-muted-foreground">-</span>

  const preview = getJsonPreview(value)

  return (
    <div className="flex items-center gap-2 max-w-[420px]">
      <span className="text-muted-foreground text-sm truncate" title={typeof value === 'string' ? value : undefined}>
        {preview}
      </span>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Ver</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Detalhes da Operação</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              JSON completo armazenado no campo details
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded border border-border">
            <pre className="p-4 text-sm whitespace-pre-wrap break-words text-muted-foreground">
{safeStringify(value, 2)}
            </pre>
          </ScrollArea>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function getJsonPreview(v: unknown): string {
  try {
    if (typeof v === 'string') {
      const s = v.trim()
      return s.length > 60 ? s.slice(0, 57) + '…' : s
    }
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (v == null) return '-'
    if (Array.isArray(v)) {
      const len = v.length
      const first = len ? getJsonPreview(v[0]) : ''
      const suffix = len > 1 ? `, … (${len} itens)` : ''
      return `[ ${first}${suffix} ]`
    }
    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>
      const keys = Object.keys(obj)
      if (!keys.length) return '{ }'
      const firstKeys = keys.slice(0, 3).join(', ')
      const more = keys.length > 3 ? `, … (+${keys.length - 3})` : ''
      return `{ ${firstKeys}${more} }`
    }
    return JSON.stringify(v)
  } catch {
    return '[dados]'
  }
}

function safeStringify(v: unknown, space = 2): string {
  try {
    return JSON.stringify(v, null, space) ?? ''
  } catch {
    return String(v)
  }
}
