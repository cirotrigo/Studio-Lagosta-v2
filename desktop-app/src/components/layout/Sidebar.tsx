import { NavLink } from 'react-router-dom'
import { Calendar, Settings, Image, MessageSquare, Palette, Wand2, Layers3, Images } from 'lucide-react'
import ProjectSelector from './ProjectSelector'
import SyncStatusIndicator from './SyncStatusIndicator'
import { cn } from '@/lib/utils'

const navItems = [
  {
    to: '/scheduler',
    icon: Calendar,
    label: 'Agendador',
    disabled: false,
  },
  {
    to: '/project',
    icon: Wand2,
    label: 'Arte Rapida',
    disabled: false,
  },
  {
    to: '/editor',
    icon: Layers3,
    label: 'Editor',
    disabled: false,
  },
  {
    to: '/arts',
    icon: Images,
    label: 'Artes',
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
    <aside className="relative flex h-full w-[220px] flex-shrink-0 flex-col bg-white/[0.02] backdrop-blur-xl">
      {/* Logo */}
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-2">
          <img src="/icon.png" alt="Lagosta" className="h-8 w-8 rounded-lg object-cover" />
          <img src="/logo.png" alt="Lagosta Tools" className="h-5 object-contain" />
        </div>
      </div>

      {/* Project Selector */}
      <div className="px-3 py-2">
        <ProjectSelector />
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 h-px bg-white/[0.06]" />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'nav-item',
                item.disabled
                  ? 'nav-item-disabled'
                  : isActive
                    ? 'nav-item-active'
                    : 'nav-item-default'
              )
            }
          >
            <item.icon size={18} />
            <span>{item.label}</span>
            {item.disabled && (
              <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
                Em breve
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-2 h-px bg-white/[0.06]" />

      {/* Sync Status */}
      <div className="px-3 py-1">
        <SyncStatusIndicator />
      </div>

      {/* Settings */}
      <div className="px-3 py-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'nav-item',
              isActive ? 'nav-item-active' : 'nav-item-default'
            )
          }
        >
          <Settings size={18} />
          <span>Configuracoes</span>
        </NavLink>
      </div>

      {/* Version */}
      <div className="px-4 py-3 text-xs text-white/30">
        v1.0.0
      </div>
    </aside>
  )
}
