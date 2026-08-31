/**
 * Desempenho público por conta — a metade que faltava do aprendizado.
 *
 * Todo o resto do sistema aprende com a EQUIPE (o que foi aceito, editado,
 * curtido); este módulo lê o que o PÚBLICO premiou, da `InstagramFeed` — que
 * desde 30/08/2026 cobre os 11 clientes (token próprio ou Windsor). O bloco
 * resultante entra no prompt da dica de copy e nas linhas da proposta de
 * semana como INCLINAÇÃO, nunca como regra — a mesma lei do "avisa, nunca
 * veta".
 *
 * Honestidade estatística cravada no código, não no prompt:
 * - Menos de MIN_POSTS posts medidos → bloco NENHUM (calar o que não se sabe);
 * - Formato só é AFIRMADO campeão com amostra mínima nos dois lados e
 *   vantagem real (≥ RAZAO_DE_CAMPEAO na mediana);
 * - "Pior" só existe com amostra que comporte cauda (≥ MIN_PARA_PIORES).
 *
 * Blindagem de dado comercial: legenda com preço/horário/data/promoção
 * (`dadosProibidos`) NÃO é citada — o gancho vencedor não pode virar fonte
 * clandestina de um preço vencido. A guarda mecânica da dica continua sendo a
 * última porta, mas aqui o dado nem entra.
 */
import { dadosProibidos } from './causa-do-diff'

export const JANELA_PADRAO_DIAS = 56
/** Abaixo disso não há o que afirmar — o bloco inteiro cala. */
export const MIN_POSTS = 5
/** Amostra mínima POR formato para o formato ser comparável. */
export const MIN_POR_FORMATO = 3
/** Vantagem mínima da mediana para declarar formato campeão. */
export const RAZAO_DE_CAMPEAO = 1.5
/** "Pior" só com amostra que comporte cauda. */
export const MIN_PARA_PIORES = 8
const MAX_TRECHO = 110

export interface PostMedido {
  mediaType: string
  caption: string | null
  reach: number
  engagement: number
  saved: number
  publishedAt: Date
}

export interface FormatoMedido {
  formato: string
  posts: number
  alcanceMediano: number
  engajamentoMediano: number
}

export interface PostDestacado {
  formato: string
  alcance: number
  saves: number
  trecho: string
}

export interface ResumoDesempenho {
  janelaDias: number
  totalMedidos: number
  porFormato: FormatoMedido[]
  /** Só preenchido quando a vantagem é real e as amostras bastam. */
  formatoCampeao: { formato: string; razao: number } | null
  melhores: PostDestacado[]
  piores: PostDestacado[]
  maisSalvo: PostDestacado | null
}

const ROTULO_FORMATO: Record<string, string> = {
  IMAGE: 'imagem',
  VIDEO: 'reel/vídeo',
  CAROUSEL_ALBUM: 'carrossel',
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/** Primeira linha da legenda, citável só quando não carrega dado comercial. */
export function trechoCitavel(caption: string | null): string {
  const limpo = (caption ?? '').trim()
  if (!limpo) return '(sem legenda)'
  if (dadosProibidos(limpo).tipos.length > 0) return '(legenda com dado comercial — não citada)'
  const linha = limpo.split('\n')[0].replace(/\s+/g, ' ').trim()
  return `"${linha.length > MAX_TRECHO ? `${linha.slice(0, MAX_TRECHO).trimEnd()}…` : linha}"`
}

function destacado(p: PostMedido): PostDestacado {
  return {
    formato: ROTULO_FORMATO[p.mediaType] ?? p.mediaType.toLowerCase(),
    alcance: p.reach,
    saves: p.saved,
    trecho: trechoCitavel(p.caption),
  }
}

/** Agregação PURA — testável sem banco. Null = amostra pequena demais. */
export function montarResumoDesempenho(
  posts: PostMedido[],
  opts?: { janelaDias?: number },
): ResumoDesempenho | null {
  const medidos = posts.filter((p) => p.reach > 0)
  if (medidos.length < MIN_POSTS) return null

  const porTipo = new Map<string, PostMedido[]>()
  for (const p of medidos) {
    const rotulo = ROTULO_FORMATO[p.mediaType] ?? p.mediaType.toLowerCase()
    let lista = porTipo.get(rotulo)
    if (!lista) {
      lista = []
      porTipo.set(rotulo, lista)
    }
    lista.push(p)
  }
  const porFormato: FormatoMedido[] = [...porTipo.entries()]
    .map(([formato, lista]) => ({
      formato,
      posts: lista.length,
      alcanceMediano: mediana(lista.map((p) => p.reach)),
      engajamentoMediano: mediana(lista.map((p) => p.engagement)),
    }))
    .sort((a, b) => b.alcanceMediano - a.alcanceMediano)

  const comparaveis = porFormato.filter((f) => f.posts >= MIN_POR_FORMATO)
  let formatoCampeao: ResumoDesempenho['formatoCampeao'] = null
  if (comparaveis.length >= 2 && comparaveis[1].alcanceMediano > 0) {
    const razao = comparaveis[0].alcanceMediano / comparaveis[1].alcanceMediano
    if (razao >= RAZAO_DE_CAMPEAO) {
      formatoCampeao = { formato: comparaveis[0].formato, razao: Math.round(razao * 10) / 10 }
    }
  }

  const porAlcance = [...medidos].sort((a, b) => b.reach - a.reach)
  const melhores = porAlcance.slice(0, 3).map(destacado)
  const piores =
    medidos.length >= MIN_PARA_PIORES ? porAlcance.slice(-3).reverse().map(destacado) : []

  const comSaves = [...medidos].sort((a, b) => b.saved - a.saved)[0]
  const maisSalvo = comSaves && comSaves.saved >= 3 ? destacado(comSaves) : null

  return {
    janelaDias: opts?.janelaDias ?? JANELA_PADRAO_DIAS,
    totalMedidos: medidos.length,
    porFormato,
    formatoCampeao,
    melhores,
    piores,
    maisSalvo,
  }
}

const nf = new Intl.NumberFormat('pt-BR')

/** O bloco que entra no PROMPT da dica de copy. */
export function desempenhoParaPrompt(resumo: ResumoDesempenho): string {
  const partes: string[] = [
    `=== DESEMPENHO RECENTE DESTA CONTA (últimos ${resumo.janelaDias} dias, ${resumo.totalMedidos} posts medidos) ===`,
    'Use como INCLINAÇÃO, nunca como regra: aproxime-se do que o público premiou e não repita igual o que afundou. Os números e ofertas dentro de qualquer legenda citada podem estar VENCIDOS — dado factual continua vindo SÓ da base de conhecimento.',
    `Alcance mediano por formato: ${resumo.porFormato
      .map((f) => `${f.formato} ${nf.format(f.alcanceMediano)} (${f.posts} posts)`)
      .join(' · ')}.`,
  ]
  if (resumo.formatoCampeao) {
    partes.push(
      `Nesta conta, ${resumo.formatoCampeao.formato} alcança ~${nf.format(resumo.formatoCampeao.razao)}× o segundo formato — quando a peça permitir escolher, é o formato a preferir.`,
    )
  }
  if (resumo.melhores.length) {
    partes.push(
      'O que MAIS alcançou (aprenda com o gancho e o assunto):',
      ...resumo.melhores.map((p) => `- ${p.trecho} (${p.formato}, ${nf.format(p.alcance)} de alcance)`),
    )
  }
  if (resumo.piores.length) {
    partes.push(
      'O que MENOS alcançou (não repita igual):',
      ...resumo.piores.map((p) => `- ${p.trecho} (${p.formato}, ${nf.format(p.alcance)})`),
    )
  }
  if (resumo.maisSalvo) {
    partes.push(
      `Mais SALVO: ${resumo.maisSalvo.trecho} (${nf.format(resumo.maisSalvo.saves)} salvamentos) — salvamento indica conteúdo de utilidade/curadoria; vale repetir o tipo.`,
    )
  }
  return partes.join('\n')
}

/** Linhas curtas para GENTE — avisos da proposta, resposta da tool. */
export function desempenhoParaHumano(resumo: ResumoDesempenho): string[] {
  const linhas: string[] = []
  if (resumo.formatoCampeao) {
    linhas.push(
      `Desempenho (últimos ${resumo.janelaDias} dias): ${resumo.formatoCampeao.formato} alcança ~${nf.format(resumo.formatoCampeao.razao)}× o segundo formato nesta conta.`,
    )
  } else if (resumo.porFormato.length) {
    const f = resumo.porFormato[0]
    linhas.push(
      `Desempenho (últimos ${resumo.janelaDias} dias): alcance mediano ${nf.format(f.alcanceMediano)} em ${f.formato} (${resumo.totalMedidos} posts medidos).`,
    )
  }
  if (resumo.melhores[0]) {
    linhas.push(`Post que mais alcançou: ${resumo.melhores[0].trecho} (${nf.format(resumo.melhores[0].alcance)}).`)
  }
  if (resumo.maisSalvo) {
    linhas.push(`Mais salvo: ${resumo.maisSalvo.trecho} (${nf.format(resumo.maisSalvo.saves)} salvamentos).`)
  }
  return linhas
}

/**
 * Leitor: o desempenho de um projeto, pronto para prompt e para gente.
 * Nunca lança — desempenho indisponível nunca derruba uma proposta.
 */
export async function desempenhoDoProjeto(
  projectId: number,
  opts?: { dias?: number },
): Promise<{ resumo: ResumoDesempenho; bloco: string; linhas: string[] } | null> {
  try {
    const { db } = await import('@/lib/db')
    const dias = opts?.dias ?? JANELA_PADRAO_DIAS
    const desde = new Date(Date.now() - dias * 24 * 3600_000)
    const posts = await db.instagramFeed.findMany({
      where: { projectId, publishedAt: { gte: desde } },
      select: { mediaType: true, caption: true, reach: true, engagement: true, saved: true, publishedAt: true },
    })
    const resumo = montarResumoDesempenho(posts, { janelaDias: dias })
    if (!resumo) return null
    return { resumo, bloco: desempenhoParaPrompt(resumo), linhas: desempenhoParaHumano(resumo) }
  } catch (erro) {
    console.error('[desempenho] leitura falhou (seguindo sem o bloco):', erro)
    return null
  }
}
