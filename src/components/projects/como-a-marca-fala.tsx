'use client'

import * as React from 'react'
import { AlertTriangle, ChevronDown, Loader2, MessageSquareQuote, Plus, RefreshCw, Replace, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ESCOPOS_DA_REGRA, TETO_DO_PROMPT_DA_VOZ, lerVoz, vozParaPrompt, type EscopoDaRegra } from '@/lib/brand/voz'
import {
  FORMULARIO_VAZIO,
  REESCRITA_VAZIA,
  formularioParaVoz,
  formulariosIguais,
  podeReativar,
  podeRemoverRegra,
  reativarRegraNoFormulario,
  regraEmBranco,
  removerRegraNoFormulario,
  substituidaPor,
  substituirRegraNoFormulario,
  sucessoraAtiva,
  vozParaFormulario,
  type FormularioDaVoz,
  type ReescritaNoFormulario,
  type RegraNoFormulario,
} from '@/lib/brand/voz-formulario'
import { useSalvarVozDaMarca, useVozDaMarca } from '@/hooks/use-aba-marca'
import { BrandDnaSection } from '@/components/projects/brand-dna-section'
import type { VozDaMarca } from '@/lib/brand/aba-marca'

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
 *
 * 🔴 O que chega do servidor NUNCA apaga uma edição local não salva (PR14-02):
 * a resposta só substitui o formulário quando ele não tem mudança pendente;
 * quando o nosso salvamento chegou e a pessoa já digitou mais, a base avança
 * e o rascunho fica; quando OUTRA pessoa salvou por baixo, a tela avisa e a
 * pessoa decide recarregar (o CAS recusa a gravação até lá). Enquanto o
 * salvamento e a releitura correm, os campos ficam desabilitados.
 */
const ESCOPO_LABEL: Record<EscopoDaRegra, string> = { copy: 'só na copy', arte: 'só na arte', ambas: 'copy e arte' }

function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

interface Estado {
  form: FormularioDaVoz
  base: FormularioDaVoz
  versaoLida: number | null
  /** O servidor tem uma versão que não é a que este formulário partiu, e há edição local não salva. */
  divergente: number | null
}

const ESTADO_INICIAL: Estado = { form: FORMULARIO_VAZIO, base: FORMULARIO_VAZIO, versaoLida: null, divergente: null }

function formDoServidor(d: VozDaMarca): { form: FormularioDaVoz; versao: number | null } {
  // Leitura que CONFIRMOU ausência envia 0 na gravação (o serviço aceita): se outra pessoa criou a v1 no meio, o
  // conflito volta como VOZ_DIVERGENTE e cai no caminho tratado — com null vinha VOZ_VERSAO_OBRIGATORIA sem saída (PR14-09).
  return { form: vozParaFormulario(d.registro?.voz ?? null), versao: d.registro?.versao ?? 0 }
}

export function ComoAMarcaFala({ projectId }: { projectId: number }) {
  const { data, isLoading, isError, error, refetch } = useVozDaMarca(projectId)
  const salvar = useSalvarVozDaMarca(projectId)
  const [estado, setEstado] = React.useState<Estado>(ESTADO_INICIAL)
  const enviadoRef = React.useRef<FormularioDaVoz | null>(null)
  const [substituindo, setSubstituindo] = React.useState<{ id: string; texto: string; motivo: string; escopo: EscopoDaRegra } | null>(null)
  // A substituição em andamento é RASCUNHO fora de `form`: conta como edição local para a releitura não a apagar (PR14-12).
  const substituindoRef = React.useRef<typeof substituindo>(null)
  substituindoRef.current = substituindo
  const [legadoAberto, setLegadoAberto] = React.useState(false)
  const [legadoJaAbriu, setLegadoJaAbriu] = React.useState(false)
  const abrirLegado = (v: boolean) => {
    setLegadoAberto(v)
    if (v) setLegadoJaAbriu(true)
  }

  React.useEffect(() => {
    if (!data) return
    const servidor = formDoServidor(data)
    setEstado((e) => {
      const semEdicaoLocal = formulariosIguais(e.form, e.base) && !substituindoRef.current
      if (semEdicaoLocal) return { form: servidor.form, base: servidor.form, versaoLida: servidor.versao, divergente: null }
      // Há edição local não salva. O que chegou é o NOSSO salvamento? Então a base avança e o rascunho fica.
      if (enviadoRef.current && formulariosIguais(servidor.form, enviadoRef.current)) return { ...e, base: servidor.form, versaoLida: servidor.versao, divergente: null }
      // Nada mudou no servidor (releitura de fundo): só a versão se confirma.
      if (formulariosIguais(servidor.form, e.base)) return { ...e, versaoLida: servidor.versao, divergente: null }
      // Outra pessoa salvou por baixo: não descartar nada; a pessoa decide.
      return { ...e, divergente: servidor.versao }
    })
  }, [data])

  const { form, base, versaoLida, divergente } = estado
  const mudou = React.useMemo(() => !formulariosIguais(form, base), [form, base])
  const previa = React.useMemo(() => lerVoz(formularioParaVoz(form)), [form])
  const caracteres = previa.voz ? vozParaPrompt(previa.voz, { escopo: 'copy' }).length : 0

  const setForm = (fn: (f: FormularioDaVoz) => FormularioDaVoz) => setEstado((e) => ({ ...e, form: fn(e.form) }))
  const set = <K extends keyof FormularioDaVoz>(k: K, v: FormularioDaVoz[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setRegra = (id: string, patch: Partial<RegraNoFormulario>) => setForm((f) => ({ ...f, regras: f.regras.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))

  const adotarServidor = () => {
    if (!data) return
    const servidor = formDoServidor(data)
    enviadoRef.current = null
    setSubstituindo(null)
    setEstado({ form: servidor.form, base: servidor.form, versaoLida: servidor.versao, divergente: null })
    void refetch()
  }

  const gravar = () => {
    if (!previa.voz) {
      toast.error(`A voz ainda não passa no contrato: ${previa.problemas.map((p) => `${p.caminho}: ${p.mensagem}`).slice(0, 3).join(' · ')}`)
      return
    }
    enviadoRef.current = form
    salvar.mutate(
      { voz: formularioParaVoz(form), versaoEsperada: versaoLida },
      {
        onSuccess: (r) => toast.success(r.gravada.criada ? 'Voz criada (versão 1). Ela passa a valer na copy quando o cliente for migrado.' : `Voz salva (versão ${r.gravada.versao}).`),
        onError: (e: Error & { code?: string; status?: number }) => {
          enviadoRef.current = null
          if (/VOZ_DIVERGENTE|VOZ_VERSAO_OBRIGATORIA|mudou enquanto/.test(`${e.code ?? ''} ${e.message}`)) {
            toast.error('Alguém salvou a voz enquanto você editava. O que você escreveu continua aqui, NÃO salvo: carregue a versão atual e refaça por cima.')
            setEstado((s) => ({ ...s, divergente: s.divergente ?? -1 }))
            void refetch()
            return
          }
          toast.error(e.message || 'Erro ao salvar a voz')
        },
      },
    )
  }

  if (isError) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 border-destructive/40 p-6 text-sm">
        <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Não consegui ler a voz da marca: {(error as Error)?.message || 'erro ao consultar'}.</span>
        <Button size="sm" variant="outline" onClick={() => void refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar de novo</Button>
      </Card>
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
  /** As regras que o servidor conhece: só as que ainda não foram gravadas podem ser REMOVIDAS (PR14-05); as outras são histórico e só desativam. */
  const idsGravados = base.regras.map((r) => r.id)
  const salvando = salvar.isPending

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <fieldset disabled={salvando} className="space-y-5 disabled:opacity-80">
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

          {divergente !== null && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {divergente > 0 ? `A voz mudou no servidor (versão ${divergente}) enquanto você editava.` : 'A voz mudou no servidor enquanto você editava.'} O que está aqui NÃO foi salvo e não será gravado por cima.
              </span>
              <Button size="sm" variant="outline" onClick={adotarServidor}>Carregar a versão atual (descarta o não salvo)</Button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Campo id="voz-descricao" label="Descrição" dica="Como a marca fala, em poucas linhas (até 600 caracteres)." className="md:col-span-2">
              <Textarea id="voz-descricao" rows={3} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Direta e quente, com orgulho do fogo de chão; fala de comida como quem convida para a mesa." />
            </Campo>
            <Campo id="voz-tratamento" label="Tratamento" dica="Como se dirige à pessoa: você, tu, a gente…">
              <Textarea id="voz-tratamento" rows={1} value={form.tratamento} onChange={(e) => set('tratamento', e.target.value)} placeholder="você" className="min-h-9" />
            </Campo>
            <Campo id="voz-termos" label="Termos da casa" dica="Na grafia exata (até 40).">
              <ListaDeItens id="voz-termos" itens={form.termos} onChange={(v) => set('termos', v)} max={40} placeholder="costela no bafo" rotuloAdicionar="termo" />
            </Campo>
            <Campo id="voz-exemplos" label="Exemplos aprovados" dica="Frases como saíram (até 12).">
              <ListaDeItens id="voz-exemplos" itens={form.exemplos} onChange={(v) => set('exemplos', v)} max={12} placeholder="Sexta é dia de costela." rotuloAdicionar="exemplo" />
            </Campo>
            <Campo id="voz-antesdepois" label="Reescritas (antes → depois, por quê)" dica="O que estava, o que ficou e o motivo (até 12).">
              <ListaDeReescritas itens={form.antesDepois} onChange={(v) => set('antesDepois', v)} max={12} />
            </Campo>
            <Campo id="voz-proibicoes" label="Proibições" dica="Poucas e curtas (até 20). Preço e horário nunca entram aqui." className="md:col-span-2">
              <ListaDeItens id="voz-proibicoes" itens={form.proibicoes} onChange={(v) => set('proibicoes', v)} max={20} placeholder={'"o melhor da cidade"'} rotuloAdicionar="proibição" />
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
                    {podeRemoverRegra(form.regras, r.id, idsGravados) ? (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" title="Esta regra ainda não foi gravada: sai da lista sem deixar histórico" onClick={() => set('regras', removerRegraNoFormulario(form.regras, r.id, idsGravados))}>
                        <X className="mr-1 h-3 w-3" /> Remover
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setRegra(r.id, { ativa: false })}>Desativar</Button>
                    )}
                  </span>
                </div>
                <Textarea rows={2} value={r.texto} onChange={(e) => setRegra(r.id, { texto: e.target.value })} placeholder="A regra, no imperativo (até 240 caracteres)." />
                <Textarea rows={1} value={r.motivo} onChange={(e) => setRegra(r.id, { motivo: e.target.value })} placeholder="O caso concreto que a gerou (até 300 caracteres)." className="min-h-9" />
                {substituindo?.id === r.id && (
                  <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
                    <p className="text-xs text-muted-foreground">A regra acima fica INATIVA (no histórico) e esta passa a valer no lugar dela.</p>
                    <Textarea rows={2} value={substituindo.texto} onChange={(e) => setSubstituindo({ ...substituindo, texto: e.target.value })} placeholder="A regra nova." />
                    <Textarea rows={1} value={substituindo.motivo} onChange={(e) => setSubstituindo({ ...substituindo, motivo: e.target.value })} placeholder="Por que ela substitui a anterior." className="min-h-9" />
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
                  {regrasInativas.map((r) => {
                    const substituta = substituidaPor(form.regras, r.id)
                    // A cadeia pode ter mais de um elo (A → B → C): voltar ao texto de A é substituir a que vale HOJE (PR14-06).
                    const atual = sucessoraAtiva(form.regras, r.id)
                    return (
                      <div key={r.id} className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-1">{r.id}</code>
                        <span className="line-through">{r.texto}</span>
                        {podeReativar(form.regras, r.id) ? (
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => set('regras', reativarRegraNoFormulario(form.regras, r.id))}>reativar</Button>
                        ) : substituta ? (
                          <>
                            <span>substituída por <code className="rounded bg-muted px-1">{substituta.id}</code>{atual && atual.id !== substituta.id && <> · vale hoje: <code className="rounded bg-muted px-1">{atual.id}</code></>}</span>
                            {atual && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs"
                                title="Abre uma substituição da regra que vale hoje com este texto — o histórico fica"
                                onClick={() => setSubstituindo({ id: atual.id, texto: r.texto, motivo: '', escopo: r.escopo })}
                              >
                                voltar a este texto (nova substituição)
                              </Button>
                            )}
                          </>
                        ) : null}
                      </div>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {substituindo && !regrasAtivas.some((r) => r.id === substituindo.id) && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="text-xs">A regra <code className="rounded bg-muted px-1">{substituindo.id}</code> que você estava substituindo deixou de estar ativa (outra pessoa mexeu nela). O texto que você escreveu está aqui; use-o numa regra nova ou descarte.</p>
              <Textarea rows={2} value={substituindo.texto} onChange={(e) => setSubstituindo({ ...substituindo, texto: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSubstituindo(null)}>Descartar</Button>
                <Button size="sm" onClick={() => { const nova = regraEmBranco(form.regras, hojeEmBrasilia()); set('regras', [...form.regras, { ...nova, texto: substituindo.texto, motivo: substituindo.motivo, escopo: substituindo.escopo }]); setSubstituindo(null) }}>Virar regra nova</Button>
              </div>
            </div>
          )}

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
            <Button onClick={gravar} disabled={!mudou || salvando || divergente !== null}>
              {salvando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…</> : <><Save className="mr-2 h-4 w-4" /> Salvar voz</>}
            </Button>
          </div>
        </fieldset>
      </Card>

      <Collapsible open={legadoAberto} onOpenChange={abrirLegado}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-card/60 px-4 py-2 text-left text-sm text-muted-foreground hover:bg-card">
          <ChevronDown className="h-4 w-4" />
          {migrado ? 'DNA de texto ARQUIVADO (só leitura — a voz manda desde ' : 'DNA de texto LEGADO (manda na copy até a migração'}
          {migrado ? `${new Date(contexto.migradaEm ?? Date.now()).toLocaleDateString('pt-BR')})` : ')'}
          {!migrado && (legado.toneOfVoice || legado.contentRules) && (
            <span className="ml-auto text-xs">{((legado.toneOfVoice?.length ?? 0) + (legado.contentRules?.length ?? 0)).toLocaleString()} caracteres</span>
          )}
        </CollapsibleTrigger>
        {/* Montado depois da primeira abertura e só ESCONDIDO ao recolher: o editor do DNA guarda rascunho em estado local (PR14-11). */}
        <CollapsibleContent forceMount hidden={!legadoAberto} className="mt-3">
          {legadoJaAbriu && (
          <BrandDnaSection
            projectId={projectId}
            secoes={['toneOfVoice', 'contentRules']}
            titulo={migrado ? 'DNA de texto (arquivado)' : 'DNA de texto (legado)'}
            descricao={migrado ? 'O que mandava antes da migração. A arte continua lendo as Regras (proibição não é estilo); a copy lê a voz acima.' : 'Tom de voz e Regras como estão no DNA: é isto que a copy lê hoje. A voz acima substitui os dois quando o cliente for migrado.'}
            mostrarPrevia={false}
            mostrarImportacaoDoTom={!migrado}
            somenteLeitura={migrado}
          />
          )}
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

/** Um item por campo: o valor viaja literal (travessão, seta, marcador, quebra de linha são conteúdo). */
function ListaDeItens({ id, itens, onChange, max, placeholder, rotuloAdicionar }: { id: string; itens: string[]; onChange: (v: string[]) => void; max: number; placeholder: string; rotuloAdicionar: string }) {
  return (
    <div className="space-y-1.5">
      {itens.map((item, i) => (
        <div key={i} className="flex items-start gap-1">
          <Textarea
            id={i === 0 ? id : undefined}
            rows={1}
            value={item}
            onChange={(e) => onChange(itens.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={placeholder}
            className="min-h-9"
          />
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Tirar este item" onClick={() => onChange(itens.filter((_, j) => j !== i))}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={itens.length >= max} onClick={() => onChange([...itens, ''])}>
        <Plus className="mr-2 h-3.5 w-3.5" /> {rotuloAdicionar}
      </Button>
    </div>
  )
}

function ListaDeReescritas({ itens, onChange, max }: { itens: ReescritaNoFormulario[]; onChange: (v: ReescritaNoFormulario[]) => void; max: number }) {
  const setItem = (i: number, patch: Partial<ReescritaNoFormulario>) => onChange(itens.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div className="space-y-2">
      {itens.map((r, i) => (
        <div key={i} className="flex items-start gap-1">
          <div className="grid flex-1 gap-1">
            <Textarea rows={1} value={r.antes} onChange={(e) => setItem(i, { antes: e.target.value })} placeholder="antes: Venha conhecer nossas opções" className="min-h-9" />
            <Textarea rows={1} value={r.depois} onChange={(e) => setItem(i, { depois: e.target.value })} placeholder="depois: Vem provar" className="min-h-9" />
            <Textarea rows={1} value={r.motivo} onChange={(e) => setItem(i, { motivo: e.target.value })} placeholder="por quê: menos institucional" className="min-h-9" />
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Tirar esta reescrita" onClick={() => onChange(itens.filter((_, j) => j !== i))}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={itens.length >= max} onClick={() => onChange([...itens, { ...REESCRITA_VAZIA }])}>
        <Plus className="mr-2 h-3.5 w-3.5" /> reescrita
      </Button>
    </div>
  )
}
