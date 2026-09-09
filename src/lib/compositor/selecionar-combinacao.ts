/** Seleção opt-in sobre uma lista já curada pelo ranking do acervo. */
import { CreativeError } from '@/lib/creatives/errors'
import { lerCaixaDoAssunto } from './assunto-da-foto'
import type { SpecDePeca } from './spec'
import type { ResultadoDaComposicao, OpcoesDeComposicao } from './compor'

export interface DiagnosticoDaSelecao {
  combinacoes: Array<{ foto: string; variante: string; impedimentos: string[]; pontos?: number; detalhes?: Record<string, unknown> }>
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
    pontos: d.posicao.pontuacao - (cobertura ? 1 : 0) - d.blocos.reduce((s, b) => s + (1 - b.escala), 0),
  }
}

export async function selecionarCombinacao(spec: SpecDePeca) {
  const { comporPeca, paginasDeAssinatura } = await import('./compor')
  const { lerCatalogoDoProjeto } = await import('@/lib/creatives/acervo')
  const inicio = Date.now()
  const cacheDeFotos: NonNullable<OpcoesDeComposicao['cacheDeFotos']> = new Map()
  const { paginas } = await paginasDeAssinatura(spec.projectId)
  const explicita = spec.preferencias?.variante?.trim().toLowerCase()
  const variantes = paginas.filter((p) => p.formato === spec.formato &&
    (!explicita || p.id.toLowerCase() === explicita || p.name.toLowerCase().includes(explicita) || p.tags.some((t) => t.toLowerCase() === explicita)) &&
    spec.blocos.every((b) => p.papeis.includes(b.papel)))
  if (!variantes.length) throw new CreativeError('SEM_COMBINACAO', 'Nenhuma variante do formato comporta todos os papéis pedidos. Confira a variante explícita e mantenha o serviço/condições obrigatórias.', 422)

  const fotos: NonNullable<SpecDePeca['foto']>[] = spec.foto?.driveFileId || spec.foto?.url ? [spec.foto] :
    [...new Set(spec.fotosCandidatas ?? [])].slice(0, 3).map((driveFileId) => ({ driveFileId }))
  let catalogo: Awaited<ReturnType<typeof lerCatalogoDoProjeto>> | null = null
  const avisos: string[] = []
  try { catalogo = await lerCatalogoDoProjeto(spec.projectId) } catch {
    avisos.push('Catálogo indisponível: seleção usa medição local; conteúdo, unidade e campanha exigem revisão.')
  }
  const assuntosDoCatalogo = new Map(fotos.flatMap((foto) => foto.driveFileId
    ? [[foto.driveFileId, lerCaixaDoAssunto(catalogo?.todas.find((i) => i.driveFileId === foto.driveFileId)?.assunto)] as const]
    : []))
  const diagnosticos: DiagnosticoDaSelecao['combinacoes'] = []
  let melhor: { spec: SpecDePeca; pontos: number } | null = null
  // Rodadas por variante: todas as fotos recebem uma chance antes da segunda variante.
  for (const variante of variantes) {
    for (const foto of fotos) {
      if (diagnosticos.length >= LIMITE_COMBINACOES || Date.now() - inicio >= JANELA_DE_SELECAO_MS) break
      const registro: DiagnosticoDaSelecao['combinacoes'][number] = { foto: foto.driveFileId ?? foto.url ?? '', variante: variante.id, impedimentos: [] as string[] }
      diagnosticos.push(registro)
      const dados = catalogo?.todas.find((i) => i.driveFileId === foto.driveFileId)
      if (dados?.precoLegivel) registro.impedimentos.push('Preço legível na foto; confirme a condição em outra foto sem preço.')
      if (dados?.marcaDeTerceiro) registro.impedimentos.push(`Marca de terceiro em destaque: ${dados.marcaDeTerceiro}; escolha outra foto.`)
      if (registro.impedimentos.length) continue
      const candidata: SpecDePeca = { ...spec, fotosCandidatas: undefined, foto, preferencias: { ...spec.preferencias, variante: variante.id } }
      try {
        const r = await comporPeca(candidata, { somenteAvaliar: true, cacheDeFotos, assuntosDoCatalogo })
        const avaliacao = avaliarCombinacao(r)
        Object.assign(registro, avaliacao)
        // Relevância/qualidade/aprendizado já ordenaram as fotos na busca.
        // Em empate, mantém essa ordem; não usa "nunca usada" como qualidade.
        if (!avaliacao.impedimentos.length && (!melhor || avaliacao.pontos > melhor.pontos)) melhor = { spec: candidata, pontos: avaliacao.pontos }
      } catch (erro) {
        if (erro instanceof CreativeError) registro.detalhes = erro.details
        registro.impedimentos.push(erro instanceof Error ? erro.message : 'Falha na avaliação da combinação')
      }
    }
    if (diagnosticos.length >= LIMITE_COMBINACOES || Date.now() - inicio >= JANELA_DE_SELECAO_MS) break
  }
  if (!melhor) throw new CreativeError('SEM_COMBINACAO', 'Nenhuma combinação avaliada passou. Troque a foto ou escolha uma variante compatível, sem eliminar condições obrigatórias.', 422, { diagnosticos, limite: LIMITE_COMBINACOES, janelaMs: JANELA_DE_SELECAO_MS })
  avisos.push(`Seleção foto/assinatura: ${diagnosticos.length} combinações avaliadas. Assunto por energia é estimativa; logo, campanha, unidade e conteúdo exigem revisão visual.`)
  const diagnostico: DiagnosticoDaSelecao = { combinacoes: diagnosticos, limite: LIMITE_COMBINACOES, janelaMs: JANELA_DE_SELECAO_MS, interrompida: diagnosticos.length < variantes.length * fotos.length }
  return { spec: melhor.spec, avisos, diagnostico, cacheDeFotos, assuntosDoCatalogo }
}
