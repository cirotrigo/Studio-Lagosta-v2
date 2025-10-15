"use client"

import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

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
}: MemberAnalyticsTableProps) {
  return (
    <Card className="border border-border/40 bg-card/60">
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Desempenho por membro</h3>
          <p className="text-sm text-muted-foreground">
            Ranking de consumo e atividade individual dentro da equipe.
          </p>
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
                <th className="px-6 py-3 text-left font-medium">Membro</th>
                <th className="px-4 py-3 text-left font-medium">Imagens</th>
                <th className="px-4 py-3 text-left font-medium">Vídeos</th>
                <th className="px-4 py-3 text-left font-medium">Chats</th>
                <th className="px-4 py-3 text-left font-medium">Créditos</th>
                <th className="px-4 py-3 text-left font-medium">Última atividade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-6 text-center text-sm text-muted-foreground"
                  >
                    Nenhum membro consumiu créditos no período selecionado.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
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
                ))
              )}
            </tbody>
            {totals && members.length > 0 && (
              <tfoot>
                <tr className="border-t border-border/40 bg-muted/20 text-xs uppercase text-muted-foreground">
                  <td className="px-6 py-3 text-left font-semibold text-foreground">
                    Totais
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
