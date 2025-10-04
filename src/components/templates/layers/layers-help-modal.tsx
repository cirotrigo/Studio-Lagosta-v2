"use client"

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Keyboard,
  Mouse,
  GripVertical,
  Eye,
  Lock,
  Trash2,
  Copy,
  MoveUp,
  MoveDown,
  Search,
  CheckSquare,
} from 'lucide-react'

interface LayersHelpModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LayersHelpModal({ open, onOpenChange }: LayersHelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manual do Painel de Camadas</DialogTitle>
          <DialogDescription>
            Aprenda a usar todas as funcionalidades do gerenciador de camadas
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {/* Atalhos de Teclado */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Atalhos de Teclado</h3>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                <ShortcutItem
                  keys={['Ctrl', 'A']}
                  description="Selecionar todas as camadas visíveis"
                />
                <ShortcutItem
                  keys={['Ctrl', 'D']}
                  description="Duplicar camadas selecionadas"
                />
                <ShortcutItem
                  keys={['Ctrl', 'F']}
                  description="Focar no campo de busca"
                />
                <ShortcutItem
                  keys={['Delete']}
                  description="Deletar camadas selecionadas"
                  badge="Confirmação"
                />
                <ShortcutItem
                  keys={['Escape']}
                  description="Limpar seleção atual"
                />
                <ShortcutItem
                  keys={['Duplo clique']}
                  description="Renomear camada"
                />
              </div>
            </section>

            {/* Ações do Mouse */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Mouse className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Ações do Mouse</h3>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                <ActionItem
                  icon={<Mouse className="h-4 w-4" />}
                  action="Click simples"
                  description="Seleciona uma camada"
                />
                <ActionItem
                  icon={<Mouse className="h-4 w-4" />}
                  action="Ctrl/Shift + Click"
                  description="Seleção múltipla (adiciona à seleção)"
                />
                <ActionItem
                  icon={<GripVertical className="h-4 w-4" />}
                  action="Arrastar pelo ⋮⋮"
                  description="Reordena camadas com drag & drop"
                />
                <ActionItem
                  icon={<Mouse className="h-4 w-4" />}
                  action="Duplo clique no nome"
                  description="Ativa modo de edição para renomear"
                />
              </div>
            </section>

            {/* Botões e Controles */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Controles Disponíveis</h3>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                <ControlItem
                  icon={<Eye className="h-4 w-4" />}
                  name="Visibilidade"
                  description="Mostrar ou ocultar camada no canvas"
                />
                <ControlItem
                  icon={<Lock className="h-4 w-4" />}
                  name="Bloqueio"
                  description="Bloquear camada para evitar edições acidentais"
                />
                <ControlItem
                  icon={<Search className="h-4 w-4" />}
                  name="Busca"
                  description="Filtrar camadas por nome ou tipo"
                />
                <ControlItem
                  icon={<Copy className="h-4 w-4" />}
                  name="Duplicar"
                  description="Criar cópia da camada com offset"
                />
                <ControlItem
                  icon={<MoveUp className="h-4 w-4" />}
                  name="Trazer para Frente"
                  description="Move camada para o topo do z-index"
                />
                <ControlItem
                  icon={<MoveDown className="h-4 w-4" />}
                  name="Enviar para Trás"
                  description="Move camada para o fundo do z-index"
                />
                <ControlItem
                  icon={<Trash2 className="h-4 w-4" />}
                  name="Deletar"
                  description="Remove camada permanentemente"
                  badge="Cuidado"
                />
              </div>
            </section>

            {/* Menu de Contexto */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
                <h3 className="font-semibold">Menu de Contexto (⋮)</h3>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-2 text-sm text-muted-foreground">
                  Clique no botão de três pontos (⋮) em cada camada para acessar:
                </p>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Duplicar</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <MoveUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Trazer para Frente</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <MoveDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Enviar para Trás</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg
                      className="h-3.5 w-3.5 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    <span>Renomear</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    <span>Deletar</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Dicas */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <h3 className="font-semibold">Dicas Úteis</h3>
              </div>
              <div className="space-y-2 rounded-lg border bg-primary/5 p-4">
                <TipItem
                  tip="Use Ctrl+F para encontrar rapidamente uma camada pelo nome"
                />
                <TipItem
                  tip="Camadas bloqueadas não podem ser editadas no canvas"
                />
                <TipItem
                  tip="A ordem visual do painel reflete o z-index (topo = frente)"
                />
                <TipItem
                  tip="Segure Ctrl/Shift ao clicar para selecionar múltiplas camadas"
                />
                <TipItem
                  tip="Use Delete para remover várias camadas de uma vez"
                />
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function ShortcutItem({
  keys,
  description,
  badge,
}: {
  keys: string[]
  description: string
  badge?: string
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {keys.map((key, index) => (
          <React.Fragment key={key}>
            <kbd className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold shadow-sm">
              {key}
            </kbd>
            {index < keys.length - 1 && <span className="text-muted-foreground">+</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{description}</span>
        {badge && (
          <Badge variant="secondary" className="text-xs">
            {badge}
          </Badge>
        )}
      </div>
    </div>
  )
}

function ActionItem({
  icon,
  action,
  description,
}: {
  icon: React.ReactNode
  action: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="font-medium">{action}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

function ControlItem({
  icon,
  name,
  description,
  badge,
}: {
  icon: React.ReactNode
  name: string
  description: string
  badge?: string
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{name}</span>
          {badge && (
            <Badge variant="destructive" className="text-xs">
              {badge}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

function TipItem({ tip }: { tip: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
      <span className="text-muted-foreground">{tip}</span>
    </div>
  )
}
