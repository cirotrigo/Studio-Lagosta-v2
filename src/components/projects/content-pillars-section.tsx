'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Sparkles, Tags, Trash2, Wand2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_PILARES, MIN_PILARES, PILAR_OUTRO, PILAR_SEM_TEXTO } from '@/lib/aprendizado/pilares'
import { toast } from 'sonner'

/**
 * Pilares de conteúdo — o card da aba Marca onde a taxonomia é aprovada.
 *
 * O passe de IA PROPÕE a lista a partir do que este cliente já publicou; nada
 * classifica nada até alguém aprovar. É a mesma divisão de trabalho do resto do
 * Studio: a máquina traz o rascunho pronto, a decisão é de gente — e aqui a
 * decisão é barata (uma lista de 5 a 8 nomes) e vale para sempre.
 *
 * Logo abaixo vem o que a taxonomia destrava: as CAMPANHAS que estavam
 * escondidas no histórico passando por rotina. Confirmar uma delas é o que tira
 * o horário do festival da cadência do cliente.
 */

interface PilarDaApi {
  slug: string
  nome: string
  descricao?: string | null
  exemplos?: string[]
  aprovado?: boolean
  origem?: 'llm' | 'humano' | null
}

interface RespostaDosPilares {
  pilares: PilarDaApi[]
  distribuicao: Array<{ pilar: string | null; total: number }>
}

interface CampanhaCandidata {
  pilar: string
  inicio: string
  fim: string
  duracaoEmDias: number
  postIds: string[]
  concentracao: number
  emAndamento: boolean
  amostras: string[]
  motivo: string
}

interface InventarioDeCampanhas {
  candidatas: CampanhaCandidata[]
  naBase: Array<{ id: string; titulo: string; status: string; expiraEm: string | null; postsLigados: number }>
  postsClassificados: number
  postsNoPeriodo: number
  avisos: string[]
}

const chaveDosPilares = (projectId: number) => ['content-pillars', projectId] as const
const chaveDasCampanhas = (projectId: number) => ['campanhas-detectadas', projectId] as const

function rotuloDoPilar(slug: string | null, pilares: PilarDaApi[]): string {
  if (!slug) return 'sem classificação'
  if (slug === PILAR_OUTRO) return 'outro'
  if (slug === PILAR_SEM_TEXTO) return 'sem texto no sistema'
  return pilares.find((p) => p.slug === slug)?.nome ?? slug
}

export function ContentPillarsSection({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient()
  const [rascunho, setRascunho] = React.useState<PilarDaApi[] | null>(null)

  const { data, isLoading } = useQuery<RespostaDosPilares>({
    queryKey: chaveDosPilares(projectId),
    queryFn: () => api.get(`/api/projects/${projectId}/pilares`),
    staleTime: 60_000,
  })

  const pilares = rascunho ?? data?.pilares ?? []
  const aprovados = (data?.pilares ?? []).filter((p) => p.aprovado)
  const houveMudanca = rascunho !== null
  /**
   * Há o que aprovar quando a pessoa editou algo OU quando existe proposta
   * ainda não aprovada. Sem a segunda metade, o caminho mais comum — pedir a
   * proposta e concordar com ela — ficava com o botão desligado, e a única
   * saída era mexer em alguma coisa só para poder salvar.
   */
  const podeAprovar = houveMudanca || pilares.some((p) => !p.aprovado)

  const propor = useMutation({
    mutationFn: () => api.post<{ pilares: PilarDaApi[]; avisos: string[]; textosAnalisados: number }>(
      `/api/projects/${projectId}/pilares`,
    ),
    onSuccess: (r) => {
      setRascunho(null)
      queryClient.invalidateQueries({ queryKey: chaveDosPilares(projectId) })
      for (const aviso of r.avisos ?? []) toast.warning(aviso)
      toast.success(
        `Proposta feita a partir de ${r.textosAnalisados} publicação(ões). Revise e aprove — nada classifica nada antes disso.`,
      )
    },
    onError: (e: Error) => toast.error(e.message || 'Não consegui propor os pilares'),
  })

  const salvar = useMutation({
    mutationFn: () =>
      api.put<{ pilares: PilarDaApi[]; avisos: string[] }>(`/api/projects/${projectId}/pilares`, {
        pilares: pilares.map((p) => ({
          slug: p.slug,
          nome: p.nome,
          descricao: p.descricao ?? null,
          exemplos: p.exemplos ?? [],
        })),
      }),
    onSuccess: (r) => {
      setRascunho(null)
      queryClient.invalidateQueries({ queryKey: chaveDosPilares(projectId) })
      for (const aviso of r.avisos ?? []) toast.warning(aviso)
      toast.success('Pilares aprovados.')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar os pilares'),
  })

  const classificar = useMutation({
    mutationFn: () =>
      api.post<{ classificados: number; semTexto: number; naoClassificados: number; avisos: string[] }>(
        `/api/projects/${projectId}/pilares/classificar`,
        {},
      ),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: chaveDosPilares(projectId) })
      queryClient.invalidateQueries({ queryKey: chaveDasCampanhas(projectId) })
      for (const aviso of (r.avisos ?? []).slice(0, 3)) toast.warning(aviso)
      toast.success(
        `${r.classificados} publicação(ões) classificadas (${r.semTexto} sem texto no sistema).`,
      )
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao classificar o histórico'),
  })

  const editar = (indice: number, campo: 'nome' | 'descricao', valor: string) => {
    setRascunho((atual) => {
      const base = [...(atual ?? data?.pilares ?? [])]
      base[indice] = { ...base[indice], [campo]: valor }
      return base
    })
  }

  const remover = (indice: number) => {
    setRascunho((atual) => (atual ?? data?.pilares ?? []).filter((_, i) => i !== indice))
  }

  const acrescentar = () => {
    setRascunho((atual) => [...(atual ?? data?.pilares ?? []), { slug: '', nome: '', origem: 'humano' }])
  }

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando pilares…
      </Card>
    )
  }

  const distribuicao = (data?.distribuicao ?? []).filter((d) => d.total > 0)
  const totalClassificado = distribuicao.reduce((a, b) => a + b.total, 0)

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Tags className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Pilares de conteúdo</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Os assuntos recorrentes deste cliente, numa lista <strong>fechada</strong>. É o que
                permite ao sistema não repetir o mesmo tema duas vezes na semana e reconhecer uma
                campanha escondida no histórico.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => propor.mutate()}
              disabled={propor.isPending}
            >
              {propor.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-3.5 w-3.5" />
              )}
              Propor a partir do histórico
            </Button>
          </div>

          {pilares.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Nenhum pilar ainda. Peça uma proposta a partir do histórico deste cliente, ou escreva a
              lista à mão — de {MIN_PILARES} a {MAX_PILARES} assuntos.
            </p>
          )}

          <div className="space-y-3">
            {pilares.map((pilar, i) => (
              <div key={pilar.slug || `novo-${i}`} className="rounded-md border p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={pilar.nome}
                        placeholder="Nome do pilar (ex: Happy hour)"
                        onChange={(e) => editar(i, 'nome', e.target.value)}
                        className="h-8 max-w-xs"
                      />
                      {pilar.aprovado ? (
                        <Badge variant="secondary" className="shrink-0">
                          aprovado
                        </Badge>
                      ) : (
                        <Badge className="shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          proposto
                        </Badge>
                      )}
                      {pilar.slug && (
                        <span className="shrink-0 text-xs text-muted-foreground">{pilar.slug}</span>
                      )}
                    </div>
                    <Input
                      value={pilar.descricao ?? ''}
                      placeholder="O que entra neste pilar"
                      onChange={(e) => editar(i, 'descricao', e.target.value)}
                      className="h-8"
                    />
                    {(pilar.exemplos ?? []).length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        aparece quando o texto fala de: {(pilar.exemplos ?? []).join(', ')}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remover(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={acrescentar}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Acrescentar pilar
            </Button>
            <Button size="sm" onClick={() => salvar.mutate()} disabled={!podeAprovar || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Aprovar lista
            </Button>
            {houveMudanca && (
              <Button variant="ghost" size="sm" onClick={() => setRascunho(null)}>
                Descartar mudanças
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => classificar.mutate()}
              disabled={aprovados.length === 0 || classificar.isPending}
              title={
                aprovados.length === 0
                  ? 'Aprove a lista antes de classificar o histórico'
                  : 'Lê o histórico publicado e marca o assunto de cada peça'
              }
            >
              {classificar.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-3.5 w-3.5" />
              )}
              Classificar histórico
            </Button>
          </div>

          {totalClassificado > 0 && (
            <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">Histórico classificado</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {distribuicao.map((d) => (
                  <span key={d.pilar ?? 'nulo'}>
                    {rotuloDoPilar(d.pilar, data?.pilares ?? [])}: <strong>{d.total}</strong>
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                “sem texto no sistema” não é um assunto: é a peça cuja copy só existe dentro da
                imagem, montada fora do Studio. Ela não atrapalha as contas — fica de fora delas.
              </p>
            </div>
          )}
        </div>
      </Card>

      <CampanhasDetectadas projectId={projectId} pilares={data?.pilares ?? []} />
      <PerfilAprendidoCard projectId={projectId} />
    </div>
  )
}

interface PerfilDaApi {
  pilares: Array<{ pilar: string; nome: string; total: number; fracao: number }>
  semPilar: { outro: number; semTexto: number; naoClassificados: number }
  mineracao: {
    modeloPorPilar: Array<{ pilar: string; nome: string | null; usos: number }>
    modeloPorDia: Array<{ dia: string; nome: string | null; usos: number }>
    ajustes: Array<{ campo: string; ocorrencias: number }>
    cobertura: { usosDeModelo: number; postsComPilar: number; ressalvas: string[] }
  }
  estilo: {
    exemplos: Array<{ campo: string | null; antes: string; depois: string }>
    estatisticas: { comDiff: number; editadas: number; aceitasComoVieram: number }
  }
  alertasDeBase: { mensagem: string | null; ocorrencias: number }
  paraPrompt: string | null
}

/**
 * O que o sistema aprendeu — e o que ele vai MANDAR para a geração.
 *
 * Mostra o bloco de prompt de verdade (`paraPrompt`), pelo mesmo motivo da
 * prévia do DNA: a tela tem de mostrar o que o gerador realmente lê, não uma
 * versão bonita escrita à parte que envelhece sozinha.
 */
function PerfilAprendidoCard({ projectId }: { projectId: number }) {
  const { data, isLoading } = useQuery<PerfilDaApi>({
    queryKey: ['perfil-aprendido', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/aprendizado/perfil`),
    staleTime: 5 * 60_000,
  })

  if (isLoading || !data) return null

  const { mineracao, estilo } = data

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">O que o sistema aprendeu com o uso</h3>
          <p className="text-sm text-muted-foreground">
            Observado do que já foi publicado e do que as pessoas corrigiram. Alimenta a{' '}
            <strong>geração</strong> — não é mais uma tela para aprovar.
          </p>
        </div>

        {data.alertasDeBase.mensagem && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {data.alertasDeBase.mensagem}
          </p>
        )}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Modelo preferido por assunto</dt>
            <dd className="text-muted-foreground">
              {mineracao.modeloPorPilar.length > 0
                ? mineracao.modeloPorPilar
                    .slice(0, 4)
                    .map((m) => `${m.pilar}: ${m.nome ?? m.pilar} (${m.usos}x)`)
                    .join(' · ')
                : 'ainda sem amostra'}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Campos que mais precisam de correção</dt>
            <dd className="text-muted-foreground">
              {mineracao.ajustes.length > 0
                ? mineracao.ajustes.slice(0, 4).map((a) => `${a.campo} (${a.ocorrencias}x)`).join(', ')
                : 'ainda sem amostra'}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Copy</dt>
            <dd className="text-muted-foreground">
              {estilo.estatisticas.comDiff > 0
                ? `${estilo.estatisticas.editadas} editadas e ${estilo.estatisticas.aceitasComoVieram} usadas como vieram, de ${estilo.estatisticas.comDiff} com registro`
                : 'ainda sem registro de edição'}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Cobertura</dt>
            <dd className="text-muted-foreground">
              {mineracao.cobertura.postsComPilar} peças com assunto identificado ·{' '}
              {mineracao.cobertura.usosDeModelo} usos de modelo registrados
            </dd>
          </div>
        </dl>

        {estilo.exemplos.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Como esta marca reescreve</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {estilo.exemplos.slice(0, 4).map((e) => (
                <li key={`${e.antes}-${e.depois}`}>
                  “{e.antes}” → <strong>“{e.depois}”</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {mineracao.cobertura.ressalvas.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {mineracao.cobertura.ressalvas.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        )}

        {data.paraPrompt && (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              O que vai para o prompt de geração
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {data.paraPrompt}
            </pre>
          </details>
        )}
      </div>
    </Card>
  )
}

/** As campanhas que estavam passando por rotina no histórico. */
function CampanhasDetectadas({ projectId, pilares }: { projectId: number; pilares: PilarDaApi[] }) {
  const queryClient = useQueryClient()
  const [titulos, setTitulos] = React.useState<Record<string, string>>({})

  const { data, isLoading } = useQuery<InventarioDeCampanhas>({
    queryKey: chaveDasCampanhas(projectId),
    queryFn: () => api.get(`/api/projects/${projectId}/campanhas-detectadas`),
    staleTime: 60_000,
  })

  const confirmar = useMutation({
    mutationFn: (entrada: { candidata: CampanhaCandidata; titulo: string }) =>
      api.post<{ titulo: string; postsMarcados: number }>(
        `/api/projects/${projectId}/campanhas-detectadas`,
        {
          postIds: entrada.candidata.postIds,
          titulo: entrada.titulo,
          pilar: entrada.candidata.pilar,
          // Campanha ainda em curso não recebe data de fim automática: a última
          // peça pode não ser a última mesmo. Quem sabe o fim é quem confirma.
          ...(entrada.candidata.emAndamento ? {} : { fim: entrada.candidata.fim.slice(0, 10) }),
        },
      ),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: chaveDasCampanhas(projectId) })
      toast.success(
        `"${r.titulo}" registrada — ${r.postsMarcados} peça(s) saíram da conta de rotina do cliente.`,
      )
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao confirmar a campanha'),
  })

  if (isLoading) return null

  const candidatas = data?.candidatas ?? []

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Campanhas encontradas no histórico</h3>
          <p className="text-sm text-muted-foreground">
            Aglomerados do mesmo assunto numa janela curta — quase sempre uma campanha que ninguém
            marcou como tal. Enquanto passa por rotina, ela ensina cadência errada: o horário do
            festival vira “hábito do cliente” e continua sendo sugerido meses depois.
          </p>
        </div>

        {(data?.avisos ?? []).map((aviso) => (
          <p
            key={aviso}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            {aviso}
          </p>
        ))}

        {candidatas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma campanha candidata em {data?.postsNoPeriodo ?? 0} publicações do período (
            {data?.postsClassificados ?? 0} com assunto identificado).
          </p>
        ) : (
          <div className="space-y-3">
            {candidatas.map((c) => {
              const chave = `${c.pilar}-${c.inicio}`
              const sugestaoDeNome =
                titulos[chave] ?? `${rotuloDoPilar(c.pilar, pilares)} — ${new Date(c.inicio).toLocaleDateString('pt-BR')}`
              return (
                <div key={chave} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{rotuloDoPilar(c.pilar, pilares)}</Badge>
                    <span className="text-sm font-medium">{c.postIds.length} peças</span>
                    {c.emAndamento && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        pode estar em curso
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{c.motivo}</p>
                  {c.amostras.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {c.amostras.map((a) => (
                        <li key={a}>“{a}”</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome da campanha</Label>
                      <Input
                        className="h-8 w-72"
                        value={sugestaoDeNome}
                        onChange={(e) => setTitulos((t) => ({ ...t, [chave]: e.target.value }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={confirmar.isPending}
                      onClick={() => confirmar.mutate({ candidata: c, titulo: sugestaoDeNome })}
                    >
                      {confirmar.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Era uma campanha
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {(data?.naBase ?? []).length > 0 && (
          <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
            <p className="font-medium">Campanhas já registradas na base</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {(data?.naBase ?? []).map((c) => (
                <li key={c.id}>
                  {c.titulo}
                  {c.expiraEm ? ` — até ${new Date(c.expiraEm).toLocaleDateString('pt-BR')}` : ' — sem data de fim'}
                  {c.postsLigados > 0 ? ` · ${c.postsLigados} peça(s)` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}
