'use client'

import * as React from 'react'
import { useOrganization } from '@clerk/nextjs'
import { useOrganizationMemberAnalytics } from '@/hooks/use-organizations'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Users } from 'lucide-react'

interface Generation {
  createdBy: string
}

interface MemberFilterProps {
  organizationId: string | null
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  items?: Generation[]
}

interface MemberData {
  clerkId: string
  imageUrl?: string
  name: string
  totalItems: number
  totalItemsFromAnalytics: number
}

export function MemberFilter({
  organizationId,
  value,
  onChange,
  disabled = false,
  items = [],
}: MemberFilterProps) {
  const { organization } = useOrganization()
  // Usar período de 90 dias para capturar mais membros
  const { data: analyticsData, isLoading } = useOrganizationMemberAnalytics(organizationId, { period: '90d' })
  const [membersData, setMembersData] = React.useState<MemberData[]>([])

  // Cache local para items - previne perda de dados quando items fica vazio temporariamente
  const itemsCache = React.useRef<Generation[]>([])

  const stableItems = React.useMemo(() => {
    if (items.length > 0) {
      itemsCache.current = items
      console.log('[MemberFilter] Updated items cache:', items.length)
      return items
    }
    console.log('[MemberFilter] Using cached items:', itemsCache.current.length)
    return itemsCache.current
  }, [items])

  const members = React.useMemo(
    () => analyticsData?.members ?? [],
    [analyticsData?.members]
  )

  // Contar itens por membro na lista atual (usando cache estável)
  const itemCountsByMember = React.useMemo(() => {
    const counts: Record<string, number> = {}
    stableItems.forEach((item) => {
      if (item.createdBy) {
        counts[item.createdBy] = (counts[item.createdBy] || 0) + 1
      }
    })
    console.log('[MemberFilter] Item counts calculated from stable items:', Object.keys(counts).length, 'unique creators')
    return counts
  }, [stableItems])

  // Buscar dados dos membros do Clerk
  React.useEffect(() => {
    if (!organization) {
      console.log('[MemberFilter] No organization, skipping')
      return
    }

    // Não atualizar se não temos dados mínimos necessários
    if (members.length === 0 && items.length === 0) {
      console.log('[MemberFilter] No members and no items, waiting for data')
      return
    }

    const fetchMembersData = async () => {
      console.log('[MemberFilter] Starting fetchMembersData', {
        membersCount: members.length,
        itemsCount: stableItems.length,
        uniqueCreators: Object.keys(itemCountsByMember).length,
        value
      })

      try {
        const membershipList = await organization.getMemberships()
        console.log('[MemberFilter] Clerk memberships:', membershipList.data.length)

        // Criar um mapa de membros do analytics
        const analyticsMap = new Map(
          members.map((m) => [m.clerkId, m])
        )

        // Encontrar membros únicos que têm items mas não estão nos analytics
        const membersFromItems = new Set<string>()
        stableItems.forEach((item) => {
          if (item.createdBy && !analyticsMap.has(item.createdBy)) {
            membersFromItems.add(item.createdBy)
          }
        })

        console.log('[MemberFilter] Members from analytics:', members.map(m => m.clerkId.substring(0, 8)))
        console.log('[MemberFilter] Members missing from analytics:', Array.from(membersFromItems).map(id => id.substring(0, 8)))
        console.log('[MemberFilter] All creators in items:', Object.keys(itemCountsByMember).map(id => ({ id: id.substring(0, 8), count: itemCountsByMember[id] })))

        // Enriquecer membros do analytics
        const enrichedAnalyticsMembersRaw = members.map((member) => {
          const clerkMember = membershipList.data.find(
            (m) => m.publicUserData.userId === member.clerkId
          )

          const totalItemsFromAnalytics = member.stats.imageGenerations + member.stats.videoGenerations
          const currentFilterCount = itemCountsByMember[member.clerkId] || 0
          const displayCount = value !== null ? currentFilterCount : totalItemsFromAnalytics

          return {
            clerkId: member.clerkId,
            imageUrl: clerkMember?.publicUserData.imageUrl,
            name: clerkMember?.publicUserData.firstName
              ? `${clerkMember.publicUserData.firstName} ${clerkMember.publicUserData.lastName || ''}`.trim()
              : clerkMember?.publicUserData.identifier || member.name || member.email || 'Usuário',
            totalItems: displayCount,
            totalItemsFromAnalytics,
          }
        })

        console.log('[MemberFilter] Analytics members BEFORE filter:', enrichedAnalyticsMembersRaw.map(m => ({
          name: m.name,
          clerkId: m.clerkId.substring(0, 8),
          totalItemsFromAnalytics: m.totalItemsFromAnalytics,
          willBeFiltered: m.totalItemsFromAnalytics <= 0
        })))

        const enrichedAnalyticsMembers = enrichedAnalyticsMembersRaw.filter(m => m.totalItemsFromAnalytics > 0)

        // Adicionar membros que aparecem nos items mas não nos analytics (criativos antigos)
        const additionalMembers: MemberData[] = []
        for (const clerkId of membersFromItems) {
          const clerkMember = membershipList.data.find(
            (m) => m.publicUserData.userId === clerkId
          )

          const itemCount = itemCountsByMember[clerkId] || 0

          if (itemCount > 0) {
            additionalMembers.push({
              clerkId,
              imageUrl: clerkMember?.publicUserData.imageUrl,
              name: clerkMember?.publicUserData.firstName
                ? `${clerkMember.publicUserData.firstName} ${clerkMember.publicUserData.lastName || ''}`.trim()
                : clerkMember?.publicUserData.identifier || 'Usuário',
              totalItems: itemCount,
              totalItemsFromAnalytics: itemCount, // Usar contagem dos items como fallback
            })
          }
        }

        // Combinar e ordenar por totalItems
        const allMembers = [...enrichedAnalyticsMembers, ...additionalMembers]
          .sort((a, b) => b.totalItemsFromAnalytics - a.totalItemsFromAnalytics)

        console.log('[MemberFilter] Enriched analytics members BEFORE filter:', enrichedAnalyticsMembers.map(m => ({
          name: m.name,
          clerkId: m.clerkId.substring(0, 8),
          totalItemsFromAnalytics: m.totalItemsFromAnalytics,
          displayCount: m.totalItems
        })))

        console.log('[MemberFilter] Final result:', {
          analyticsCount: enrichedAnalyticsMembers.length,
          additionalCount: additionalMembers.length,
          totalCount: allMembers.length,
          members: allMembers.map(m => ({
            name: m.name,
            clerkId: m.clerkId.substring(0, 8),
            count: m.totalItems,
            fromAnalytics: enrichedAnalyticsMembers.some(am => am.clerkId === m.clerkId)
          }))
        })

        setMembersData(allMembers)
      } catch (error) {
        console.error('Error fetching members data:', error)
      }
    }

    fetchMembersData()
  }, [organization, members, stableItems, itemCountsByMember, value])

  console.log('[MemberFilter] Render:', {
    isLoading,
    organizationId,
    disabled,
    membersDataCount: membersData.length,
    hasAnalyticsData: !!analyticsData,
    itemsCount: items.length,
    stableItemsCount: stableItems.length,
    usingCache: items.length === 0 && stableItems.length > 0
  })

  if (isLoading || !organizationId || disabled) {
    console.log('[MemberFilter] Returning null (loading or disabled)')
    return null
  }

  const initials = (name: string) => {
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  return (
    <Card className="p-2 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-min">
        {/* Botão "Todos" */}
        <button
          onClick={() => onChange(null)}
          className={cn(
            'relative flex items-center justify-center h-10 w-10 rounded-full transition-all',
            'hover:ring-2 hover:ring-primary hover:scale-105',
            'group flex-shrink-0',
            value === null
              ? 'ring-2 ring-primary bg-primary/10'
              : 'bg-muted hover:bg-muted/80'
          )}
          title="Todos os membros"
        >
          <Users className="h-5 w-5 text-muted-foreground group-hover:text-primary" />

          {/* Tooltip */}
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            <div className="bg-black/90 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
              Todos os membros
              <div className="text-[10px] text-white/70 mt-0.5">
                {membersData.reduce((sum, m) => sum + m.totalItems, 0)} itens
              </div>
            </div>
          </div>
        </button>

        {/* Avatares dos membros */}
        {membersData.map((member) => (
          <button
            key={member.clerkId}
            onClick={() => onChange(member.clerkId)}
            className={cn(
              'relative group flex-shrink-0',
              'transition-all hover:scale-105',
              value === member.clerkId && 'scale-110'
            )}
            title={member.name}
          >
            <Avatar
              className={cn(
                'h-10 w-10 cursor-pointer transition-all',
                'ring-2',
                value === member.clerkId
                  ? 'ring-primary ring-offset-2 ring-offset-background'
                  : 'ring-transparent group-hover:ring-primary group-hover:ring-offset-2 group-hover:ring-offset-background'
              )}
            >
              {member.imageUrl && (
                <AvatarImage src={member.imageUrl} alt={member.name} />
              )}
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                {initials(member.name)}
              </AvatarFallback>
            </Avatar>

            {/* Tooltip com informações */}
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              <div className="bg-black/90 text-white text-xs px-2 py-1.5 rounded shadow-lg whitespace-nowrap">
                <div className="font-medium">{member.name}</div>
                <div className="text-[10px] text-white/70 mt-0.5">
                  {member.totalItems} {member.totalItems === 1 ? 'item' : 'itens'}
                </div>
              </div>
            </div>

            {/* Badge de contagem (sempre visível quando selecionado) */}
            {value === member.clerkId && (
              <Badge
                variant="secondary"
                className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center text-[10px] px-1 shadow-sm"
              >
                {member.totalItems}
              </Badge>
            )}
          </button>
        ))}
      </div>
    </Card>
  )
}
