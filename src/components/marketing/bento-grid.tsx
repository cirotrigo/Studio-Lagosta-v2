"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Lock, Search, Settings, Sparkles, CreditCard, Bot, Router, MessageCircle, Image, ShieldCheck, Upload, DollarSign } from "lucide-react"
import { GlowingEffect } from "@/components/ui/glowing-effect"

export function BentoGrid() {
  return (
    <ul className="grid grid-cols-1 grid-rows-none gap-4 md:grid-cols-3 md:grid-rows-4 lg:gap-4">
      <GridItem
        area="md:[grid-area:1/1/2/2]"
        icon={<Sparkles className="h-4 w-4 text-sky-500" />}
        title="Sistema de Créditos"
        description="Custos por feature tipados, validação e dedução transacional com logs de uso."
      />
      <GridItem
        area="md:[grid-area:1/2/2/3]"
        icon={<Lock className="h-4 w-4 text-emerald-500" />}
        title="Autenticação Clerk"
        description="Login, inscrição e sessões com rotas públicas/protegidas e middleware."
      />
      <GridItem
        area="md:[grid-area:1/3/2/4]"
        icon={<Settings className="h-4 w-4 text-purple-500" />}
        title="PostgreSQL + Prisma"
        description="Esquema, migrações e helpers tipados para operações seguras."
      />
      <GridItem
        area="md:[grid-area:2/1/3/2]"
        icon={<CreditCard className="h-4 w-4 text-blue-500" />}
        title="Billing (Stripe)"
        description="Assinaturas e packs de créditos com webhooks integrados."
      />
      <GridItem
        area="md:[grid-area:2/2/3/3]"
        icon={<ShieldCheck className="h-4 w-4 text-orange-500" />}
        title="Painel Admin"
        description="Gerencie usuários, créditos e visualize análises detalhadas."
      />
      <GridItem
        area="md:[grid-area:2/3/3/4]"
        icon={<Bot className="h-4 w-4 text-red-500" />}
        title="Integração Vercel AI"
        description="Chat com streaming em tempo real usando Vercel AI SDK."
      />
      <GridItem
        area="md:[grid-area:3/1/4/2]"
        icon={<Router className="h-4 w-4 text-green-500" />}
        title="Suporte Open Router"
        description="Conecte-se a qualquer modelo de linguagem grande com Open Router."
      />
      <GridItem
        area="md:[grid-area:3/2/4/3]"
        icon={<Upload className="h-4 w-4 text-violet-500" />}
        title="Upload de Arquivos"
        description="Sistema de upload e gerenciamento de arquivos com armazenamento seguro."
      />
      <GridItem
        area="md:[grid-area:3/3/4/4]"
        // eslint-disable-next-line jsx-a11y/alt-text
        icon={<Image className="h-4 w-4 text-indigo-500" />}
        title="Geração de Imagens"
        description="Gere imagens com os modelos mais recentes de IA."
      />
      <GridItem
        area="md:[grid-area:4/1/5/2]"
        icon={<DollarSign className="h-4 w-4 text-teal-500" />}
        title="Custos Configuráveis"
        description="Configure custos por feature e créditos por plano via admin."
      />
      <GridItem
        area="md:[grid-area:4/2/5/3]"
        icon={<MessageCircle className="h-4 w-4 text-yellow-500" />}
        title="Chat com qualquer LLM"
        description="Interface de chat completa com histórico e contexto persistente."
      />
      <GridItem
        area="md:[grid-area:4/3/5/4]"
        icon={<Search className="h-4 w-4 text-amber-500" />}
        title="UI + App Router"
        description="Tailwind v4 + Radix UI com componentes prontos para produção."
      />
    </ul>
  )
}

interface GridItemProps {
  area: string
  icon: React.ReactNode
  title: string
  description: React.ReactNode
}

const GridItem = ({ area, icon, title, description }: GridItemProps) => {
  return (
    <li className={cn("min-h-[14rem] list-none", area)}>
      <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
        <GlowingEffect
          spread={40}
          glow={true}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          borderWidth={3}
        />
        <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border-[0.75px] bg-background p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)] md:p-6">
          <div className="relative flex flex-1 flex-col justify-between gap-3">
            <div className="w-fit rounded-lg border-[0.75px] border-border bg-muted p-2">
              {icon}
            </div>
            <div className="space-y-3">
              <h3 className="pt-0.5 text-xl leading-[1.375rem] font-semibold font-sans tracking-[-0.04em] md:text-2xl md:leading-[1.875rem] text-balance text-foreground">
                {title}
              </h3>
              <h2 className="[&_b]:md:font-semibold [&_strong]:md:font-semibold font-sans text-sm leading-[1.125rem] md:text-base md:leading-[1.375rem] text-muted-foreground">
                {description}
              </h2>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

// export via named function acima
