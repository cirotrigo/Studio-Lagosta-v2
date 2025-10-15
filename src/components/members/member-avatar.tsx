'use client'

import * as React from 'react'
import { useOrganization } from '@clerk/nextjs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface MemberAvatarProps {
  clerkId: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showTooltip?: boolean
}

export function MemberAvatar({ clerkId, size = 'md', className, showTooltip = false }: MemberAvatarProps) {
  const { organization } = useOrganization()
  const [memberData, setMemberData] = React.useState<{
    imageUrl?: string
    name?: string
    email?: string
  } | null>(null)

  React.useEffect(() => {
    if (!organization) return

    // Buscar dados do membro via Clerk
    const fetchMemberData = async () => {
      try {
        const membershipList = await organization.getMemberships()
        const member = membershipList.data.find((m) => m.publicUserData.userId === clerkId)

        if (member) {
          setMemberData({
            imageUrl: member.publicUserData.imageUrl,
            name: member.publicUserData.firstName
              ? `${member.publicUserData.firstName} ${member.publicUserData.lastName || ''}`.trim()
              : member.publicUserData.identifier || 'Usuário',
            email: member.publicUserData.identifier,
          })
        }
      } catch (error) {
        console.error('Error fetching member data:', error)
      }
    }

    fetchMemberData()
  }, [organization, clerkId])

  const sizeClasses = {
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-10 w-10 text-sm',
  }

  const initials = React.useMemo(() => {
    if (!memberData?.name) return '?'
    const parts = memberData.name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    }
    return memberData.name.slice(0, 2).toUpperCase()
  }, [memberData?.name])

  return (
    <Avatar className={cn(sizeClasses[size], className)} title={showTooltip && memberData ? memberData.name : undefined}>
      {memberData?.imageUrl && (
        <AvatarImage src={memberData.imageUrl} alt={memberData.name || 'User'} />
      )}
      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
