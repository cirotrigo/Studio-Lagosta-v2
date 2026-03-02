import { NavLink } from 'react-router-dom'
import { Calendar, Settings, Image, MessageSquare, Palette } from 'lucide-react'
import ProjectSelector from './ProjectSelector'
import { cn } from '@/lib/utils'

const navItems = [
  {
    to: '/scheduler',
    icon: Calendar,
    label: 'Agendador',
    disabled: false,
  },
  {
    to: '/templates',
    icon: Palette,
    label: 'Templates',
    disabled: true,
  },
  {
    to: '/chat',
    icon: MessageSquare,
    label: 'Chat IA',
    disabled: true,
  },
  {
    to: '/images',
    icon: Image,
    label: 'Imagens IA',
    disabled: true,
  },
]

export default function Sidebar() {
  return (
    <aside className="flex h-full w-[220px] flex-shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <span className="text-sm font-bold text-primary">SL</span>
          </div>
          <span className="font-semibold text-text">Lagosta Tools</span>
        </div>
      </div>

      {/* Project Selector */}
      <div className="px-3 py-2">
        <ProjectSelector />
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 h-px bg-border" />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                'transition-all duration-200',
                item.disabled
                  ? 'pointer-events-none opacity-50'
                  : 'hover:bg-card',
                isActive && !item.disabled
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted'
              )
            }
          >
            <item.icon size={18} />
            <span>{item.label}</span>
            {item.disabled && (
              <span className="ml-auto rounded bg-card px-1.5 py-0.5 text-[10px] text-text-subtle">
                Em breve
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-2 h-px bg-border" />

      {/* Settings */}
      <div className="px-3 py-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
              'transition-all duration-200 hover:bg-card',
              isActive ? 'bg-primary/10 text-primary' : 'text-text-muted'
            )
          }
        >
          <Settings size={18} />
          <span>Configurações</span>
        </NavLink>
      </div>

      {/* Version */}
      <div className="px-4 py-3 text-xs text-text-subtle">
        v1.0.0
      </div>
    </aside>
  )
}
