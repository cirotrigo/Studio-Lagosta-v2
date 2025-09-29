"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStorage, useDeleteStorageItem, type StorageItem } from "@/hooks/use-storage";


export default function AdminStoragePage() {
  const { toast } = useToast()
  const [q, setQ] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("")
  const [userFilter, setUserFilter] = useState<string>("")
  const [searchParams, setSearchParams] = useState({ q: "", type: "", userId: "" })

  // Use TanStack Query hooks
  const { data: storageData, isLoading: loading, refetch } = useStorage({
    q: searchParams.q,
    type: searchParams.type,
    userId: searchParams.userId,
    limit: 50
  })
  const deleteStorageMutation = useDeleteStorageItem()

  const items = storageData?.items || []
  const nextCursor = storageData?.nextCursor || null

  useEffect(() => {
    setSearchParams({ q, type: typeFilter, userId: userFilter })
  }, [q, typeFilter, userFilter])

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchParams({ q, type: typeFilter, userId: userFilter })
  }

  const uniqueTypes = Array.from(new Set(items.map(i => i.contentType).filter(Boolean))) as string[]
  const uniqueUsers = Array.from(new Set(items.map(i => i.user?.id).filter(Boolean))) as string[]
  const userOptions = uniqueUsers.map(id => items.find(i => i.user?.id === id)!.user)

  const onDelete = async (id: string) => {
    if (!confirm('Excluir este objeto? Isso removerá o acesso público e o marcará como excluído.')) return
    deleteStorageMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: 'Objeto excluído' })
        refetch() // Refresh the data after deletion
      }
    })
  }

  const formatSize = (n: number) => {
    const kb = n / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    const mb = kb / 1024
    return `${mb.toFixed(2)} MB`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Armazenamento</h1>
          <p className="text-muted-foreground mt-2">Navegue e gerencie os objetos enviados</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>

      <Card className="p-6">
        <form onSubmit={onSearch} className="flex flex-col md:flex-row gap-3 mb-4">
          <Input className="flex-1" placeholder="Pesquisar por nome, tipo, URL, nome/email do usuário..." value={q} onChange={(e)=>setQ(e.target.value)} />
          <Select value={typeFilter} onValueChange={(v)=>{ setTypeFilter(v === 'all' ? '' : v); }}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {uniqueTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={userFilter} onValueChange={(v)=>{ setUserFilter(v === 'all' ? '' : v); }}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Todos os usuários" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os usuários</SelectItem>
              {userOptions.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.clerkId}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={loading}>Pesquisar</Button>
        </form>
      </Card>

      <DataTable
        data={items as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "name",
            header: "Nome",
            render: (item: unknown) => {
              const i = item as StorageItem;
              return (
                <div className="flex flex-col">
                  <span className="font-medium text-foreground truncate max-w-[360px]" title={i.name}>{i.name}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[360px]" title={i.pathname}>{i.pathname}</span>
                </div>
              );
            },
          },
          {
            key: "contentType",
            header: "Tipo",
            render: (item: unknown) => {
              const i = item as StorageItem;
              return <span className="text-muted-foreground">{i.contentType || '—'}</span>;
            },
          },
          {
            key: "size",
            header: "Tamanho",
            render: (item: unknown) => {
              const i = item as StorageItem;
              return <span className="text-muted-foreground">{formatSize(i.size)}</span>;
            },
          },
          {
            key: "user",
            header: "Enviado por",
            render: (item: unknown) => {
              const i = item as StorageItem;
              return (
                <div className="flex flex-col">
                  <span className="text-foreground">{i.user.name || 'Desconhecido'}</span>
                  <span className="text-xs text-muted-foreground">{i.user.email || i.user.clerkId}</span>
                </div>
              );
            },
          },
          {
            key: "createdAt",
            header: "Data",
            render: (item: unknown) => {
              const i = item as StorageItem;
              return <span className="text-muted-foreground">{new Date(i.createdAt).toLocaleString()}</span>;
            },
          },
          {
            key: "actions",
            header: "Ações",
            className: "text-right",
            render: (item: unknown) => {
              const i = item as StorageItem;
              return (
                <div className="flex justify-end space-x-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={i.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(i.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            },
          },
        ]}
        searchable={false}
        loading={loading}
        countLabel="arquivos"
        emptyMessage="Nenhum arquivo encontrado"
        headerContent={
          <div className="flex justify-center">
            {nextCursor ? (
              <span className="text-xs text-muted-foreground">Mais resultados disponíveis - ajuste os filtros para refinar</span>
            ) : (
              <span className="text-xs text-muted-foreground">Não há mais resultados</span>
            )}
          </div>
        }
      />
    </div>
  )
}
