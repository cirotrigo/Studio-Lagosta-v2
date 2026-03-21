import { NavLink } from 'react-router-dom'
import { Calendar, Settings, Wand2, Layers3, Images, Sparkles } from 'lucide-react'
import ProjectSelector from './ProjectSelector'
import SyncStatusIndicator from './SyncStatusIndicator'
import { cn } from '@/lib/utils'

const navItems = [
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
    to: '/scheduler',
    icon: Calendar,
    label: 'Agendador',
    disabled: false,
  },
  {
    to: '/arts',
    icon: Images,
    label: 'Artes',
    disabled: false,
  },
  {
    to: '/bulk-generator',
    icon: Sparkles,
    label: 'IA em Massa',
    disabled: false,
  },
]

export default function Sidebar() {
  return (
    <aside className="relative flex h-full w-[220px] flex-shrink-0 flex-col bg-white/[0.02] backdrop-blur-xl">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-white/[0.03]">
        <div className="flex items-center gap-3">
          <div className="relative group perspective-1000">
             <div className="absolute -inset-2 bg-orange-500/20 blur-md -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
             <img src="./icon.png" alt="Lagosta" className="h-8 w-8 rounded-lg object-cover border border-white/10 shadow-lg" />
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold leading-tight tracking-tight text-sm flex items-center gap-1">
              Studio
              <span className="flex h-1 w-1 rounded-full bg-orange-500"></span>
            </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-300 via-orange-500 to-orange-600 font-semibold text-sm leading-tight tracking-tight">
              Lagosta
            </span>
          </div>
        </div>
      </div>

      {/* Project Selector */}
      <div className="px-3 py-4">
        <ProjectSelector />
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-2 scrollbar-hide overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }: { isActive: boolean }) =>
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
            <span className="font-semibold tracking-wide text-[13px]">{item.label}</span>
            {item.disabled && (
              <span className="ml-auto rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase text-white/40">
                Breve
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Sync Status */}
      <div className="px-3 py-1">
        <SyncStatusIndicator />
      </div>

      {/* Settings */}
      <div className="px-3 py-2">
        <NavLink
          to="/settings"
          className={({ isActive }: { isActive: boolean }) =>
            cn(
              'nav-item',
              isActive ? 'nav-item-active' : 'nav-item-default'
            )
          }
        >
          <Settings size={18} />
          <span className="font-semibold tracking-wide text-[13px]">Configurações</span>
        </NavLink>
      </div>

      {/* Version */}
      <div className="px-5 py-4 flex items-center justify-between opacity-50">
        <span className="text-[10px] font-bold tracking-widest uppercase text-white">Versão</span>
        <span className="text-[10px] font-mono text-white">1.0.0</span>
      </div>
    </aside>
  )
}
