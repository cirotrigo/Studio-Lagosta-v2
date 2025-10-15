"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"

export type MemberAnalyticsRow = {
  clerkId: string
  userId: string | null
  name: string | null
  email: string | null
  stats: {
    imageGenerations: number
    videoGenerations: number
    chatInteractions: number
    totalCreditsUsed: number
    lastActivityAt: string | null
  }
  updatedAt: string
}

interface MemberAnalyticsTableProps {
  members: MemberAnalyticsRow[]
  isLoading?: boolean
  totals?: {
    imageGenerations: number
    videoGenerations: number
    chatInteractions: number
    totalCreditsUsed: number
  }
  onSearchChange?: (search: string) => void
  onSortChange?: (sortBy: string, order: 'asc' | 'desc') => void
  searchValue?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

function initials(name: string | null | undefined, fallback: string) {
  if (!name) return fallback.slice(0, 2).toUpperCase()
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

function formatLastActivity(date: string | null) {
  if (!date) return "Nunca"
  return new Date(date).toLocaleString()
}

export function MemberAnalyticsTable({
  members,
  isLoading,
  totals,
  onSearchChange,
  onSortChange,
  searchValue = '',
  sortBy = 'totalCreditsUsed',
  sortOrder = 'desc',
}: MemberAnalyticsTableProps) {
  const [localSearch, setLocalSearch] = useState(searchValue)

  const handleSort = (column: string) => {
    if (!onSortChange) return
    const newOrder = sortBy === column && sortOrder === 'desc' ? 'asc' : 'desc'
    onSortChange(column, newOrder)
  }

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    )
  }

  return (
    <Card className="border border-border/40 bg-card/60">
      <div className="border-b border-border/40 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Desempenho por membro</h3>
            <p className="text-sm text-muted-foreground">
              Ranking de consumo e atividade individual dentro da equipe.
            </p>
          </div>
          {onSearchChange && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por nome ou email"
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value)
                  onSearchChange(e.target.value)
                }}
                className="pl-9"
              />
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 px-6 py-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-t border-border/40 text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left font-medium">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center hover:text-foreground transition-colors"
                    disabled={!onSortChange}
                  >
                    Membro
                    {onSortChange && getSortIcon('name')}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">Criativos</th>
                <th className="px-4 py-3 text-left font-medium">
                  <button
                    onClick={() => handleSort('imageGenerations')}
                    className="flex items-center hover:text-foreground transition-colors"
                    disabled={!onSortChange}
                  >
                    Imagens IA
                    {onSortChange && getSortIcon('imageGenerations')}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button
                    onClick={() => handleSort('videoGenerations')}
                    className="flex items-center hover:text-foreground transition-colors"
                    disabled={!onSortChange}
                  >
                    Vídeos
                    {onSortChange && getSortIcon('videoGenerations')}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button
                    onClick={() => handleSort('chatInteractions')}
                    className="flex items-center hover:text-foreground transition-colors"
                    disabled={!onSortChange}
                  >
                    Chats
                    {onSortChange && getSortIcon('chatInteractions')}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button
                    onClick={() => handleSort('totalCreditsUsed')}
                    className="flex items-center hover:text-foreground transition-colors"
                    disabled={!onSortChange}
                  >
                    Créditos
                    {onSortChange && getSortIcon('totalCreditsUsed')}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button
                    onClick={() => handleSort('lastActivityAt')}
                    className="flex items-center hover:text-foreground transition-colors"
                    disabled={!onSortChange}
                  >
                    Última atividade
                    {onSortChange && getSortIcon('lastActivityAt')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-6 text-center text-sm text-muted-foreground"
                  >
                    Nenhum membro consumiu créditos no período selecionado.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const totalCreatives =
                    member.stats.imageGenerations +
                    member.stats.videoGenerations +
                    member.stats.chatInteractions

                  return (
                    <tr key={member.clerkId} className="align-middle">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback>
                              {initials(member.name, member.email ?? member.clerkId)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {member.name ?? "Sem nome"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {member.email ?? member.clerkId}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-purple-600">
                        {totalCreatives.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 font-medium text-foreground">
                        {member.stats.imageGenerations.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 font-medium text-foreground">
                        {member.stats.videoGenerations.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 font-medium text-foreground">
                        {member.stats.chatInteractions.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 font-semibold text-primary">
                        {member.stats.totalCreditsUsed.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {formatLastActivity(member.stats.lastActivityAt)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {totals && members.length > 0 && (
              <tfoot>
                <tr className="border-t border-border/40 bg-muted/20 text-xs uppercase text-muted-foreground">
                  <td className="px-6 py-3 text-left font-semibold text-foreground">
                    Totais
                  </td>
                  <td className="px-4 py-3 font-semibold text-purple-600">
                    {(
                      totals.imageGenerations +
                      totals.videoGenerations +
                      totals.chatInteractions
                    ).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {totals.imageGenerations.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {totals.videoGenerations.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {totals.chatInteractions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-primary">
                    {totals.totalCreditsUsed.toLocaleString()}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Card>
  )
}
