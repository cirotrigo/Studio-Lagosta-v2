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
}

export function MemberFilter({
  organizationId,
  value,
  onChange,
  disabled = false,
  items = [],
}: MemberFilterProps) {
  const { organization } = useOrganization()
  const { data: analyticsData, isLoading } = useOrganizationMemberAnalytics(organizationId)
  const [membersData, setMembersData] = React.useState<MemberData[]>([])

  const members = React.useMemo(
    () => analyticsData?.members ?? [],
    [analyticsData?.members]
  )

  // Contar itens por membro na lista atual
  const itemCountsByMember = React.useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach((item) => {
      if (item.createdBy) {
        counts[item.createdBy] = (counts[item.createdBy] || 0) + 1
      }
    })
    return counts
  }, [items])

  // Buscar dados dos membros do Clerk
  React.useEffect(() => {
    if (!organization || members.length === 0) return

    const fetchMembersData = async () => {
      try {
        const membershipList = await organization.getMemberships()

        const enrichedMembers = members.map((member) => {
          const clerkMember = membershipList.data.find(
            (m) => m.publicUserData.userId === member.clerkId
          )

          // Usar contagem real da lista de itens se disponível
          const totalItems = items.length > 0
            ? (itemCountsByMember[member.clerkId] || 0)
            : (member.stats.imageGenerations + member.stats.videoGenerations)

          return {
            clerkId: member.clerkId,
            imageUrl: clerkMember?.publicUserData.imageUrl,
            name: clerkMember?.publicUserData.firstName
              ? `${clerkMember.publicUserData.firstName} ${clerkMember.publicUserData.lastName || ''}`.trim()
              : clerkMember?.publicUserData.identifier || member.name || member.email || 'Usuário',
            totalItems,
          }
        })

        setMembersData(enrichedMembers.filter(m => m.totalItems > 0))
      } catch (error) {
        console.error('Error fetching members data:', error)
      }
    }

    fetchMembersData()
  }, [organization, members, items.length, itemCountsByMember])

  if (isLoading || !organizationId || disabled) {
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
    <Card className="p-2">
      <div className="flex items-center gap-2">
        {/* Botão "Todos" */}
        <button
          onClick={() => onChange(null)}
          className={cn(
            'relative flex items-center justify-center h-10 w-10 rounded-full transition-all',
            'hover:ring-2 hover:ring-primary hover:scale-105',
            'group',
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
              'relative group',
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
