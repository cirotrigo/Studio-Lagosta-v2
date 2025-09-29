"use client"

import { Bot, Sparkles, Zap, Rocket } from "lucide-react"
import { GlowingEffect } from "@/components/ui/glowing-effect"

export function AIStarter() {
  const tools = [
    "Replit Agents",
    "Cursor AI",
    "Claude Code",
    "OpenAI Codex",
    "Google Gemini",
    "Bolt.new",
  ]

  return (
    <section id="ai-starter" className="relative mt-28">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[520px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(50%_50%_at_50%_0%,hsl(var(--primary)/0.15)_0%,transparent_70%)] blur-2xl" />
      </div>

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <Rocket className="h-3.5 w-3.5 text-primary" /> Starter para agentes & IDEs
          </span>
          <h2 className="mt-4 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-4xl">
            Funciona com qualquer IA, sem lock‑in
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Use este template como ponto de partida em Replit, Cursor, Claude Code, Codex, Gemini, Bolt e mais.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-6xl">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Card 1 */}
            <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <div className="relative flex h-full flex-col justify-between gap-4 overflow-hidden rounded-xl border-[0.75px] bg-background p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)]">
                <span className="inline-flex size-8 items-center justify-center rounded-lg border-[0.75px] border-border bg-muted">
                  <Sparkles className="h-4 w-4 text-sky-500" />
                </span>
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">Base pronta para produção</h3>
                  <p className="text-sm text-muted-foreground">Auth (Clerk), DB (Prisma), billing (Stripe) e créditos.</p>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <div className="relative flex h-full flex-col justify-between gap-4 overflow-hidden rounded-xl border-[0.75px] bg-background p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)]">
                <span className="inline-flex size-8 items-center justify-center rounded-lg border-[0.75px] border-border bg-muted">
                  <Bot className="h-4 w-4 text-emerald-500" />
                </span>
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">Ideal para agentes</h3>
                  <p className="text-sm text-muted-foreground">Validação com Zod, APIs e handlers tipados, estrutura clara.</p>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <div className="relative flex h-full flex-col justify-between gap-4 overflow-hidden rounded-xl border-[0.75px] bg-background p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)]">
                <span className="inline-flex size-8 items-center justify-center rounded-lg border-[0.75px] border-border bg-muted">
                  <Zap className="h-4 w-4 text-amber-500" />
                </span>
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">Sem lock‑in</h3>
                  <p className="text-sm text-muted-foreground">Troque provedores quando quiser.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tools row styled like bento */}
          <div className="mt-6">
            <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <div className="relative overflow-hidden rounded-xl border-[0.75px] bg-background p-4 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)]">
                <div className="flex flex-wrap items-center gap-2">
                  {tools.map((t) => (
                    <span
                      key={t}
                      className="px-3 py-1.5 text-xs rounded-md bg-black/5 text-gray-700 backdrop-blur-sm transition-all duration-200 hover:bg-black/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20"
                    >
                      {t}
                    </span>
                  ))}
                  <span className="px-3 py-1.5 text-xs rounded-md bg-black/5 text-gray-700 backdrop-blur-sm transition-all duration-200 hover:bg-black/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20">
                    e mais…
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
