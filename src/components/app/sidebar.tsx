"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  CreditCard,
  Bot,
  FolderOpen,
  BookOpen,
  MessageSquare,
  Building2,
  Calendar,
  Music,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DynamicLogo } from "@/components/app/dynamic-logo";

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

export const navigationItems = [
  { name: "Painel", href: "/studio", icon: Home },
  { name: "Projetos", href: "/projects", icon: FolderOpen },
  { name: "Agenda", href: "/agenda", icon: Calendar },
  { name: "Biblioteca de Músicas", href: "/biblioteca-musicas", icon: Music },
  { name: "Organização", href: "/organization", icon: Building2 },
  { name: "Prompts", href: "/prompts", icon: MessageSquare },
  { name: "Base de Conhecimento", href: "/knowledge", icon: BookOpen },
  { name: "Chat com IA", href: "/ai-chat", icon: Bot },
  { name: "Cobrança", href: "/billing", icon: CreditCard },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "relative z-30 border-r border-border/40 bg-card/30 text-card-foreground backdrop-blur-xl supports-[backdrop-filter]:bg-card/20 glass-panel transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[64px]" : "w-64",
        "hidden md:block my-4"
      )}
      aria-label="Barra lateral principal"
    >
      <div className="flex h-14 items-center gap-2 px-3">
        <Link href="/" className={cn("flex items-center", collapsed ? "flex-1 justify-center" : "flex-1 min-w-0")}>
          {collapsed ? (
            <DynamicLogo useFull={false} className="w-9 h-9 flex-shrink-0" />
          ) : (
            <DynamicLogo useFull={true} className="h-10" />
          )}
        </Link>
        <div className={cn("flex-shrink-0", !collapsed && "ml-auto")}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            onClick={onToggle}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      
      <ScrollArea className="h-[calc(100vh-3.5rem)]">
        <nav className="flex flex-col gap-1 p-2" aria-label="Navegação principal">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href;
            const link = (
              <Link
                key={item.name}
                href={item.href}
                aria-label={collapsed ? item.name : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );

            if (!collapsed) return link;

            return (
              <Tooltip key={item.name}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" align="center">
                  {item.name}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
