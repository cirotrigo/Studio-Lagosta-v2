'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { AgendaCalendarView } from '@/components/agenda/calendar/agenda-calendar-view'
import { Loader2 } from 'lucide-react'

export default function AgendaPage() {
  const { isLoaded, user } = useUser()

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return <AgendaCalendarView />
}
