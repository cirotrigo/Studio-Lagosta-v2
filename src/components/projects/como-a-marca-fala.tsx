'use client'

import * as React from 'react'
import { ChevronDown, Loader2, MessageSquareQuote, Plus, Replace, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ESCOPOS_DA_REGRA, TETO_DO_PROMPT_DA_VOZ, lerVoz, vozParaPrompt, type EscopoDaRegra } from '@/lib/brand/voz'
import {
  FORMULARIO_VAZIO,
  formularioParaVoz,
  formulariosIguais,
  regraEmBranco,
  substituirRegraNoFormulario,
  vozParaFormulario,
  type FormularioDaVoz,
  type RegraNoFormulario,
} from '@/lib/brand/voz-formulario'
import { useSalvarVozDaMarca, useVozDaMarca } from '@/hooks/use-aba-marca'
import { BrandDnaSection } from '@/components/projects/brand-dna-section'

/**
 * "Como a marca fala" — a primeira das três áreas da aba Marca (plano "Marca
 * simples, copy melhor", §8): descrição curta, tratamento, exemplos aprovados,
 * reescritas antes → depois → motivo, termos próprios, poucas proibições e as
 * regras recentes COM substituição (não só acréscimo).
 *
 * O que a tela edita é a VOZ COMPACTA do PR 7 (`BrandVoice`), gravada com a
 * versão lida (CAS): duas pessoas editando ao mesmo tempo não se sobrescrevem
 * em silêncio. Quem MANDA na copy hoje é dito no topo — a voz só passa a
 * valer quando o cliente é MIGRADO (manifesto do PR 13, decisão do Ciro);
 * até lá o DNA de texto legado continua editável aqui, recolhido.
 */
const ESCOPO_LABEL: Record<EscopoDaRegra, string> = { copy: 'só na copy', arte: 'só na arte', ambas: 'copy e arte' }

function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function ComoAMarcaFala({ projectId }: { projectId: number }) {
  const { data, isLoading, refetch } = useVozDaMarca(projectId)
  const salvar = useSalvarVozDaMarca(projectId)
  const [form, setForm] = React.useState<FormularioDaVoz>(FORMULARIO_VAZIO)
  const [base, setBase] = React.useState<FormularioDaVoz>(FORMULARIO_VAZIO)
  const [versaoLida, setVersaoLida] = React.useState<number | null>(null)
  const [substituindo, setSubstituindo] = React.useState<{ id: string; texto: string; motivo: string; escopo: EscopoDaRegra } | null>(null)

  React.useEffect(() => {
    if (!data) return
    const f = vozParaFormulario(data.registro?.voz ?? null)
    setForm(f)
    setBase(f)
    setVersaoLida(data.registro?.versao ?? null)
  }, [data])

  const mudou = React.useMemo(() => !formulariosIguais(form, base), [form, base])
  const previa = React.useMemo(() => lerVoz(formularioParaVoz(form)), [form])
  const caracteres = previa.voz ? vozParaPrompt(previa.voz, { escopo: 'copy' }).length : 0

  const set = <K extends keyof FormularioDaVoz>(k: K, v: FormularioDaVoz[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setRegra = (id: string, patch: Partial<RegraNoFormulario>) => setForm((f) => ({ ...f, regras: f.regras.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))

  const gravar = () => {
    if (!previa.voz) {
      toast.error(`A voz ainda não passa no contrato: ${previa.problemas.map((p) => `${p.caminho}: ${p.mensagem}`).slice(0, 3).join(' · ')}`)
      return
    }
    salvar.mutate(
      { voz: formularioParaVoz(form), versaoEsperada: versaoLida },
      {
        onSuccess: (r) => toast.success(r.gravada.criada ? 'Voz criada (versão 1). Ela passa a valer na copy quando o cliente for migrado.' : `Voz salva (versão ${r.gravada.versao}).`),
        onError: (e: Error & { code?: string; status?: number }) => {
          if (/VOZ_DIVERGENTE|mudou enquanto/.test(`${e.code ?? ''} ${e.message}`)) {
            toast.error('Alguém salvou a voz enquanto você editava. Recarreguei a versão atual — refaça a sua mudança por cima.')
            void refetch()
            return
          }
          toast.error(e.message || 'Erro ao salvar a voz')
        },
      },
    )
  }

  if (isLoading || !data) {
    return (
      <Card className="flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando a voz da marca…
      </Card>
    )
  }

  const { contexto, registro, legado } = data
  const migrado = contexto.fonte === 'voz'
  const regrasAtivas = form.regras.filter((r) => r.ativa)
  const regrasInativas = form.regras.filter((r) => !r.ativa)

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MessageSquareQuote className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Como a marca fala</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                A síntese que o Claude lê antes de escrever: descrição, tratamento, exemplos, reescritas, termos, proibições e regras recentes. Fato (preço, horário, promoção) não entra aqui — vai para a base.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs">
              {migrado ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Manda na copy · versão {registro?.versao}</Badge>
              ) : registro ? (
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Prévia (versão {registro.versao}) · o DNA legado ainda manda</Badge>
              ) : (
                <Badge variant="outline">Sem voz ainda · o DNA legado manda</Badge>
              )}
              <span className={cn('text-muted-foreground', caracteres > TETO_DO_PROMPT_DA_VOZ && 'text-destructive')}>
                {caracteres.toLocaleString()}/{TETO_DO_PROMPT_DA_VOZ.toLocaleString()} caracteres no prompt
              </span>
            </div>
          </div>

          {registro && registro.problemas.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              A voz gravada não passa mais no contrato ({registro.problemas.length}): {registro.problemas.map((p) => `${p.caminho}: ${p.mensagem}`).join(' · ')}. Enquanto isso a copy lê o legado.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Campo id="voz-descricao" label="Descrição" dica="Como a marca fala, em poucas linhas (até 600 caracteres)." className="md:col-span-2">
              <Textarea id="voz-descricao" rows={3} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Direta e quente, com orgulho do fogo de chão; fala de comida como quem convida para a mesa." />
            </Campo>
            <Campo id="voz-tratamento" label="Tratamento" dica="Como se dirige à pessoa: você, tu, a gente…">
              <Input id="voz-tratamento" value={form.tratamento} onChange={(e) => set('tratamento', e.target.value)} placeholder="você" />
            </Campo>
            <Campo id="voz-termos" label="Termos da casa" dica="Um por linha, na grafia exata (até 40).">
              <Textarea id="voz-termos" rows={3} value={form.termos} onChange={(e) => set('termos', e.target.value)} placeholder={'costela no bafo\nhappy em dobro'} />
            </Campo>
            <Campo id="voz-exemplos" label="Exemplos aprovados" dica="Frases como saíram, uma por linha (até 12).">
              <Textarea id="voz-exemplos" rows={4} value={form.exemplos} onChange={(e) => set('exemplos', e.target.value)} placeholder={'Sexta é dia de costela.\nVem pra cá.'} />
            </Campo>
            <Campo id="voz-antesdepois" label="Reescritas (antes → depois — motivo)" dica="Uma por linha, com a seta; o motivo depois do travessão (até 12).">
              <Textarea id="voz-antesdepois" rows={4} value={form.antesDepois} onChange={(e) => set('antesDepois', e.target.value)} placeholder={'Venha conhecer nossas opções → Vem provar — menos institucional'} />
            </Campo>
            <Campo id="voz-proibicoes" label="Proibições" dica="Poucas e curtas, uma por linha (até 20). Preço e horário nunca entram aqui." className="md:col-span-2">
              <Textarea id="voz-proibicoes" rows={3} value={form.proibicoes} onChange={(e) => set('proibicoes', e.target.value)} placeholder={'"o melhor da cidade"\nemoji na manchete'} />
            </Campo>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Regras recentes ({regrasAtivas.length} ativa{regrasAtivas.length === 1 ? '' : 's'})</Label>
              <Button size="sm" variant="outline" onClick={() => set('regras', [...form.regras, regraEmBranco(form.regras, hojeEmBrasilia())])}>
                <Plus className="mr-2 h-3.5 w-3.5" /> Nova regra
              </Button>
            </div>
            {regrasAtivas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma regra ativa. Regra nasce de um caso concreto: escreva a regra, o motivo e a data.</p>}
            {regrasAtivas.map((r) => (
              <div key={r.id} className="space-y-2 rounded-md border border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <code className="rounded bg-muted px-1">{r.id}</code>
                  <span>{r.em}</span>
                  <select className="rounded border bg-background px-1 py-0.5 text-xs" value={r.escopo} onChange={(e) => setRegra(r.id, { escopo: e.target.value as EscopoDaRegra })} aria-label="Escopo da regra">
                    {ESCOPOS_DA_REGRA.map((esc) => (
                      <option key={esc} value={esc}>{ESCOPO_LABEL[esc]}</option>
                    ))}
                  </select>
                  {r.substitui && <span>substitui <code className="rounded bg-muted px-1">{r.substitui}</code></span>}
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSubstituindo({ id: r.id, texto: r.texto, motivo: '', escopo: r.escopo })}>
                      <Replace className="mr-1 h-3 w-3" /> Substituir
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setRegra(r.id, { ativa: false })}>Desativar</Button>
                  </span>
                </div>
                <Textarea rows={2} value={r.texto} onChange={(e) => setRegra(r.id, { texto: e.target.value })} placeholder="A regra, no imperativo (até 240 caracteres)." />
                <Input value={r.motivo} onChange={(e) => setRegra(r.id, { motivo: e.target.value })} placeholder="O caso concreto que a gerou (até 300 caracteres)." />
                {substituindo?.id === r.id && (
                  <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
                    <p className="text-xs text-muted-foreground">A regra acima fica INATIVA (no histórico) e esta passa a valer no lugar dela.</p>
                    <Textarea rows={2} value={substituindo.texto} onChange={(e) => setSubstituindo({ ...substituindo, texto: e.target.value })} placeholder="A regra nova." />
                    <Input value={substituindo.motivo} onChange={(e) => setSubstituindo({ ...substituindo, motivo: e.target.value })} placeholder="Por que ela substitui a anterior." />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSubstituindo(null)}>Cancelar</Button>
                      <Button
                        size="sm"
                        disabled={!substituindo.texto.trim() || !substituindo.motivo.trim()}
                        onClick={() => {
                          set('regras', substituirRegraNoFormulario(form.regras, r.id, { texto: substituindo.texto, motivo: substituindo.motivo, em: hojeEmBrasilia(), escopo: substituindo.escopo }))
                          setSubstituindo(null)
                        }}
                      >
                        Substituir
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {regrasInativas.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
                  <ChevronDown className="h-3 w-3" /> {regrasInativas.length} regra{regrasInativas.length === 1 ? '' : 's'} no histórico (substituídas ou desativadas)
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {regrasInativas.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-1">{r.id}</code>
                      <span className="line-through">{r.texto}</span>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setRegra(r.id, { ativa: true })}>reativar</Button>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {!previa.voz && mudou && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              Ainda não dá para salvar: {previa.problemas.slice(0, 4).map((p) => `${p.caminho}: ${p.mensagem}`).join(' · ')}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              {migrado
                ? 'Salvar vale na próxima copy. O conector (consultar-voz) lê a mesma versão.'
                : 'Salvar grava a voz como PRÉVIA: a copy continua lendo o DNA legado até a migração deste cliente.'}
            </p>
            <Button onClick={gravar} disabled={!mudou || salvar.isPending}>
              {salvar.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…</> : <><Save className="mr-2 h-4 w-4" /> Salvar voz</>}
            </Button>
          </div>
        </div>
      </Card>

      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-card/60 px-4 py-2 text-left text-sm text-muted-foreground hover:bg-card">
          <ChevronDown className="h-4 w-4" />
          {migrado ? 'DNA de texto ARQUIVADO (só leitura — a voz manda desde ' : 'DNA de texto LEGADO (manda na copy até a migração'}
          {migrado ? `${new Date(contexto.migradaEm ?? Date.now()).toLocaleDateString('pt-BR')})` : ')'}
          {!migrado && (legado.toneOfVoice || legado.contentRules) && (
            <span className="ml-auto text-xs">{((legado.toneOfVoice?.length ?? 0) + (legado.contentRules?.length ?? 0)).toLocaleString()} caracteres</span>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <BrandDnaSection
            projectId={projectId}
            secoes={['toneOfVoice', 'contentRules']}
            titulo={migrado ? 'DNA de texto (arquivado)' : 'DNA de texto (legado)'}
            descricao={migrado ? 'O que mandava antes da migração. A arte continua lendo as Regras (proibição não é estilo); a copy lê a voz acima.' : 'Tom de voz e Regras como estão no DNA: é isto que a copy lê hoje. A voz acima substitui os dois quando o cliente for migrado.'}
            mostrarPrevia={false}
            mostrarImportacaoDoTom={!migrado}
            somenteLeitura={migrado}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function Campo({ id, label, dica, className, children }: { id: string; label: string; dica?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}{dica && <span className="ml-1 text-xs font-normal text-muted-foreground">· {dica}</span>}</Label>
      {children}
    </div>
  )
}
