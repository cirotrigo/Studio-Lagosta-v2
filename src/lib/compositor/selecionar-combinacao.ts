/** Seleção opt-in sobre uma lista já curada pelo ranking do acervo. */
import { CreativeError } from '@/lib/creatives/errors'
import { compararComBaseline, leituraComparavel, type LeituraComparavel } from './comparar-baseline'
import { lerCaixaDoAssunto } from './assunto-da-foto'
import type { SpecDePeca } from './spec'
import type { ResultadoDaComposicao, OpcoesDeComposicao } from './compor'

export interface DiagnosticoDaSelecao {
  combinacoes: Array<{ foto: string; variante: string; impedimentos: string[]; pontos?: number; transitorio?: boolean; leitura?: LeituraComparavel; comparacao?: string[]; baseline?: boolean; detalhes?: Record<string, unknown> }>
  decisao?: 'baseline' | 'dominancia-tecnica'
  alternativas?: Array<{ foto: string; variante: string; motivos: string[] }>
  limite: number
  janelaMs: number
  interrompida: boolean
}

export const LIMITE_COMBINACOES = 6
export const JANELA_DE_SELECAO_MS = 30_000

/** Não confunde OCR/score com aprovação: os bloqueios ficam separados. */
export function avaliarCombinacao(r: ResultadoDaComposicao) {
  const d = r.diagnostico
  const impedimentos: string[] = []
  if (!d.contraste?.length) impedimentos.push('Contraste não medido; confira a foto e tente novamente.')
  for (const c of d.contraste ?? []) {
    if (!c.ok) impedimentos.push(`Contraste insuficiente em ${c.grupo}; escolha outra foto ou variante aprovada.`)
  }
  // A caixa estimada por energia não é segmentação semântica. É um risco,
  // não prova de que texto ocultou um prato (especialmente em ambientes).
  const cobertura = d.candidatos.every((c) => c.descartado)
  if (cobertura && d.assuntoOrigem === 'catalogo') impedimentos.push('Todas as posições cobrem ou recortam excessivamente o assunto catalogado; escolha outro enquadramento/foto.')
  return {
    impedimentos,
    transitorio: !d.contraste?.length,
    pontos: d.posicao.pontuacao - (cobertura ? 1 : 0) - d.blocos.reduce((s, b) => s + (1 - b.escala), 0),
  }
}

export async function selecionarCombinacao(spec: SpecDePeca) {
  const { comporPeca, paginasDeAssinatura } = await import('./compor')
  const { lerCatalogoDoProjeto } = await import('@/lib/creatives/acervo')
  const inicio = Date.now()
  const cacheDeFotos: NonNullable<OpcoesDeComposicao['cacheDeFotos']> = new Map()
  const { paginas } = await paginasDeAssinatura(spec.projectId)
  const variantes = paginas.filter((p) => p.formato === spec.formato && spec.blocos.every((b) => p.papeis.includes(b.papel)))
  const fotos: NonNullable<SpecDePeca['foto']>[] = spec.foto?.driveFileId || spec.foto?.url ? [spec.foto] :
    [...new Set(spec.fotosCandidatas ?? [])].slice(0, 3).map((driveFileId) => ({ driveFileId }))
  if (!fotos.length) throw new CreativeError('SPEC_INVALIDA', 'Seleção experimental exige foto explícita ou candidatas curadas.', 422)
  if (!variantes.length) throw new CreativeError('SEM_COMBINACAO', 'Nenhuma variante do formato comporta todos os papéis pedidos. Preserve serviço e condições obrigatórias.', 422)
  let catalogo: Awaited<ReturnType<typeof lerCatalogoDoProjeto>> | null = null
  const avisos: string[] = []
  try { catalogo = await lerCatalogoDoProjeto(spec.projectId) } catch {
    avisos.push('Catálogo indisponível: conteúdo, unidade e campanha exigem revisão.')
  }
  const assuntosDoCatalogo = new Map(fotos.flatMap((foto) => foto.driveFileId
    ? [[foto.driveFileId, lerCaixaDoAssunto(catalogo?.todas.find((i) => i.driveFileId === foto.driveFileId)?.assunto)] as const] : []))
  type Registro = DiagnosticoDaSelecao['combinacoes'][number]
  type Avaliada = { spec: SpecDePeca; registro: Registro; leitura: LeituraComparavel }
  const diagnosticos: Registro[] = []
  const avaliadas: Avaliada[] = []
  const bloqueadas = new Set<string>()
  const idFoto = (foto: NonNullable<SpecDePeca['foto']>) => foto.driveFileId ?? foto.url ?? ''
  const cabemTentativas = () => diagnosticos.length < LIMITE_COMBINACOES && Date.now() - inicio < JANELA_DE_SELECAO_MS
  const tentar = async (foto: NonNullable<SpecDePeca['foto']>, variante: string | undefined, baseline: boolean): Promise<Avaliada | null> => {
    if (!cabemTentativas() || bloqueadas.has(idFoto(foto))) return null
    const registro: Registro = { foto: idFoto(foto), variante: variante ?? '(baseline automático)', impedimentos: [], baseline }
    diagnosticos.push(registro)
    const dados = catalogo?.todas.find((i) => i.driveFileId === foto.driveFileId)
    if (dados?.precoLegivel) registro.impedimentos.push('Preço legível na foto; escolha outra foto sem preço.')
    if (dados?.marcaDeTerceiro) registro.impedimentos.push(`Marca de terceiro em destaque: ${dados.marcaDeTerceiro}; escolha outra foto.`)
    if (registro.impedimentos.length) { bloqueadas.add(idFoto(foto)); return null }
    const candidata: SpecDePeca = { ...spec, selecaoExperimental: undefined, fotosCandidatas: undefined, foto, preferencias: { ...spec.preferencias, variante } }
    try {
      const r = await comporPeca(candidata, { somenteAvaliar: true, medirComparacao: true, cacheDeFotos, assuntosDoCatalogo })
      Object.assign(registro, avaliarCombinacao(r))
      registro.variante = r.diagnostico.assinatura.pageId ?? registro.variante
      const leitura = leituraComparavel(r)
      registro.leitura = leitura
      const resolvida = { ...candidata, preferencias: { ...candidata.preferencias, variante: registro.variante } }
      const avaliada = { spec: resolvida, registro, leitura }
      avaliadas.push(avaliada)
      return avaliada
    } catch (erro) {
      registro.transitorio = !(erro instanceof CreativeError) || erro.status >= 500 || erro.code === 'FOTO_INDISPONIVEL'
      if (erro instanceof CreativeError) registro.detalhes = erro.details
      registro.impedimentos.push(erro instanceof Error ? erro.message : 'Falha na avaliação')
      return null
    }
  }
  // Primeiro a MESMA escolha do caminho anterior. A ordem das páginas não é baseline.
  const baseline = await tentar(fotos[0], spec.preferencias?.variante, true)
  let interrompida = false
  if (!spec.preferencias?.variante) {
    for (const variante of variantes) {
      for (const foto of fotos) {
        if (baseline && baseline.registro.variante === variante.id && baseline.registro.foto === idFoto(foto)) continue
        if (bloqueadas.has(idFoto(foto))) continue
        if (!cabemTentativas()) { interrompida = true; break }
        await tentar(foto, variante.id, false)
      }
      if (interrompida) break
    }
  }
  const validas = avaliadas.filter((a) => !a.registro.impedimentos.length)
  const dominantes = validas.filter((a) => {
    if (a === baseline) return false
    const comparacao = baseline ? compararComBaseline(baseline.leitura, a.leitura, baseline.registro.foto === a.registro.foto)
      : { domina: false, motivos: ['Baseline indisponível para comparação: revisão humana necessária.'] }
    a.registro.comparacao = comparacao.motivos
    return comparacao.domina
  })
  const naoDominadas = dominantes.filter((a) => !dominantes.some((b) => a !== b && compararComBaseline(a.leitura, b.leitura, a.registro.foto === b.registro.foto).domina))
  const baselineValido = baseline && !baseline.registro.impedimentos.length ? baseline : null
  // Sem dominância única, conserva o baseline válido. Empate não vira gosto automático.
  const escolhida = naoDominadas.length === 1 ? naoDominadas[0] : baselineValido
  const alternativas = validas.filter((a) => a !== escolhida).sort((a, b) => (a.leitura.tom?.alteracaoMedia ?? Infinity) - (b.leitura.tom?.alteracaoMedia ?? Infinity) || a.registro.variante.localeCompare(b.registro.variante)).slice(0, 2).map((a) => ({ foto: a.registro.foto, variante: a.registro.variante, motivos: a.registro.comparacao ?? ['Revisão visual necessária; sem preferência estética automática.'] }))
  const diagnostico: DiagnosticoDaSelecao = { combinacoes: diagnosticos, limite: LIMITE_COMBINACOES, janelaMs: JANELA_DE_SELECAO_MS, interrompida, alternativas }
  if (!escolhida) throw new CreativeError(!diagnosticos.length || diagnosticos.some((d) => d.transitorio) ? 'SELECAO_INDISPONIVEL' : 'SEM_COMBINACAO', 'Nenhuma escolha sustentada pela comparação. Confira os impedimentos e alternativas, sem remover condições obrigatórias.', 422, { diagnosticos, alternativas, limite: LIMITE_COMBINACOES, janelaMs: JANELA_DE_SELECAO_MS })
  diagnostico.decisao = escolhida === baseline ? 'baseline' : 'dominancia-tecnica'
  avisos.push(`Seleção experimental: ${diagnostico.decisao === 'baseline' ? 'baseline preservado; melhoria não demonstrada' : 'dominância técnica relativa, sem aprovação estética'}. Logo, nitidez, peso tipográfico, conteúdo e gosto exigem revisão visual.`)
  return { spec: escolhida.spec, avisos, diagnostico, cacheDeFotos, assuntosDoCatalogo }
}
