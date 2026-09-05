/**
 * As pastas da programação no banco: garante o template da semana (ou das
 * avulsas do mês) NO FORMATO da peça, e move uma página entre pastas quando
 * ela ganha data.
 *
 * Desde 04/09/2026 a pasta é por semana **e por formato** — ver
 * `pasta-da-semana.ts`. A consequência para quem escreve código novo: quem
 * cria página de peça composta precisa dizer o FORMATO, e a ordem dentro da
 * pasta é calculada (`ordemNaPasta`), nunca deixada no default 0 do schema.
 */

import { db } from '@/lib/db'

import type { Formato } from './spec'
import {
  CATEGORIA_AVULSAS,
  CATEGORIA_PROGRAMACAO,
  dataDe,
  nomeDaPagina,
  ordemDaPagina,
  pastaDaPeca,
  SLIDES_POR_MINUTO,
  type PastaDaPeca,
} from './pasta-da-semana'

export interface PastaGarantida {
  id: number
  name: string
  pasta: PastaDaPeca
}

/**
 * Acha (pela tag-chave, que inclui o formato) ou cria a pasta.
 *
 * `agora` só é lido quando a peça não tem data — é o mês das avulsas. Existe
 * como parâmetro para a migração conseguir reconstruir a pasta de um mês que
 * não é o de hoje.
 */
export async function garantirPasta(
  projectId: number,
  userId: string,
  quando: string | Date | null | undefined,
  formato: Formato,
  agora: Date = new Date(),
): Promise<PastaGarantida> {
  const pasta = pastaDaPeca(quando, formato, agora)
  const existente = await db.template.findFirst({
    where: { projectId, tags: { has: pasta.chave } },
    select: { id: true, name: true },
  })
  if (existente) return { ...existente, pasta }
  const criado = await db.template.create({
    data: {
      name: pasta.nome,
      // Uma pasta, um formato: o `type` e as `dimensions` finalmente dizem a
      // verdade sobre o que está dentro.
      type: pasta.tipo,
      dimensions: pasta.dimensoes,
      designData: {},
      category: pasta.categoria,
      tags: pasta.tags,
      projectId,
      createdBy: userId,
    },
    select: { id: true, name: true },
  })
  return { ...criado, pasta }
}

/**
 * A ordem de postagem da página na pasta. Sem data (avulsas) não há ordem de
 * postagem a respeitar: a peça entra no fim da fila, por chegada.
 *
 * A ordem calculada é DESEMPATADA contra o que já está na pasta. Sem isso,
 * carrossel composto sem declarar o slide empataria tudo no mesmo número e a
 * pasta voltaria à ordem arbitrária do Postgres — foi o que aconteceu numa
 * leva real de 04/09/2026: os quatro slides do Empório nasceram todos com
 * `order` 549000. Quem passa `carrossel.slide` cai na posição certa; quem não
 * passa fica ao menos na ordem em que compôs, que num carrossel é a ordem dos
 * slides.
 */
export interface OrdemNaPasta {
  ordem: number
  /**
   * Quantas peças já ocupavam este minuto. 0 = a primeira. Serve para dar nome
   * próprio a irmão de carrossel composto SEM declarar o slide — que é o único
   * caso em que o compositor não tem como saber a posição.
   */
  repeticao: number
}

export async function ordemNaPasta(templateId: number, quando: string | Date | null | undefined, slide?: number | null): Promise<OrdemNaPasta> {
  const base = ordemDaPagina(quando, slide)
  if (base === null) {
    const max = await db.page.aggregate({ where: { templateId }, _max: { order: true } })
    return { ordem: (max._max.order ?? -1) + 1, repeticao: 0 }
  }
  // Só o bloco do MESMO minuto interessa: fora dele não há empate possível.
  const teto = base - (base % SLIDES_POR_MINUTO) + SLIDES_POR_MINUTO
  const vizinhas = await db.page.findMany({
    where: { templateId, order: { gte: base, lt: teto } },
    select: { order: true },
  })
  const ocupadas = new Set(vizinhas.map((p) => p.order))
  let ordem = base
  while (ocupadas.has(ordem) && ordem < teto - 1) ordem++
  return { ordem, repeticao: ordem - base }
}

/** O formato de uma página já gravada: a tag que o compositor escreveu, ou o tamanho. */
export function formatoDaPagina(page: { tags?: string[] | null; width: number; height: number }): Formato {
  const tags = page.tags ?? []
  if (tags.includes('story')) return 'story'
  if (tags.includes('feed')) return 'feed'
  if (tags.includes('quadrado')) return 'quadrado'
  if (page.width === page.height) return 'quadrado'
  return page.height > page.width * 1.6 ? 'story' : 'feed'
}

export interface Movimentacao {
  moveu: boolean
  de: { id: number; name: string } | null
  para: { id: number; name: string } | null
}

/**
 * Página que estava nas AVULSAS (ou num coletor do compositor) e ganhou data:
 * vai para a semana, na pasta do formato dela. Só move página de peça
 * composta; nunca move modelo. Erro vira `moveu: false` — mover pasta não pode
 * derrubar agendamento.
 */
export async function moverPaginaParaSemana(pageId: string, quando: string | Date, userId: string): Promise<Movimentacao> {
  try {
    if (!dataDe(quando)) return { moveu: false, de: null, para: null }
    const page = await db.page.findUnique({
      where: { id: pageId },
      select: { id: true, isTemplate: true, tags: true, width: true, height: true, Template: { select: { id: true, name: true, category: true, projectId: true } } },
    })
    if (!page || page.isTemplate) return { moveu: false, de: null, para: null }
    const ehComposta = page.tags.includes('compositor')
    const emAvulsas = page.Template.category === CATEGORIA_AVULSAS || page.Template.category === 'arte-rapida'
    if (!ehComposta || !emAvulsas) return { moveu: false, de: page.Template, para: null }

    const destino = await garantirPasta(page.Template.projectId, userId, quando, formatoDaPagina(page))
    if (destino.id === page.Template.id) return { moveu: false, de: page.Template, para: destino }
    // O slide sai da Generation da peça: é lá que o compositor o registrou, e
    // sem ele os irmãos de um carrossel empatariam no mesmo minuto.
    const { ordem } = await ordemNaPasta(destino.id, quando, await slideDaPagina(pageId))
    await db.page.update({ where: { id: pageId }, data: { templateId: destino.id, order: ordem } })
    return { moveu: true, de: page.Template, para: { id: destino.id, name: destino.name } }
  } catch (erro) {
    console.warn('[compositor] não deu para mover a página para a semana:', (erro as Error).message)
    return { moveu: false, de: null, para: null }
  }
}

/** O `slideOrder` gravado na Generation da página, quando ela é slide de carrossel. */
async function slideDaPagina(pageId: string): Promise<number | null> {
  try {
    const g = await db.generation.findFirst({
      where: { fieldValues: { path: ['pageId'], equals: pageId }, slideOrder: { not: null } },
      select: { slideOrder: true },
      orderBy: { createdAt: 'desc' },
    })
    return g?.slideOrder ?? null
  } catch {
    return null
  }
}

export interface Refilagem {
  /** Quantas páginas mudaram de pasta, de nome ou de ordem. */
  refiladas: number
  /** O que foi pulado e por quê — para quem chama poder contar a quem editou. */
  avisos: string[]
}

/**
 * O post foi REMARCADO: as páginas dele seguem para a semana nova.
 *
 * Por que não é `moverPaginaParaSemana`: aquela só aceita peça que ainda está
 * num coletor ou nas avulsas (`ehComposta && emAvulsas`) e **não renomeia** —
 * ela existe para a peça que ACABOU de ganhar data. Página que já está
 * arquivada numa pasta de semana cai fora do gate dela e fica para trás, com o
 * nome carregando a data velha ("Sex 18/09 · 09:00 · Coronel Picanha" num post
 * que hoje sai em 25/09). Como a pasta da semana é o que a equipe abre para
 * revisar e aprovar, pasta e nome mentindo a data desfazem justamente o que a
 * separação por formato veio resolver.
 *
 * 🔴 O identificador embutido no nome do arquivo do render NÃO é sempre o da
 * página: o compositor nomeia por PÁGINA (`<pageId>-<epoch>.png`) e o render de
 * post avulso nomeia pelo POST (`<postId>-<epoch>.png`). Sem descartar o id do
 * próprio post, o carrossel adotaria uma página que não existe.
 *
 * 🔴 Mídia única NÃO é slide. Story e post de imagem única também têm a arte
 * nomeada pelo id da página, então sem o corte por `length > 1` a peça avulsa
 * viraria "slide 1" e a ordem sairia deslocada dentro do minuto.
 *
 * Nunca lança: mover pasta não pode derrubar um reagendamento — mesmo contrato
 * de `moverPaginaParaSemana` e de `sendWhatsAppText`.
 */
export async function refilarPaginasDoPost(postId: string, quando: string | Date, userId: string): Promise<Refilagem> {
  const avisos: string[] = []
  try {
    if (!dataDe(quando)) return { refiladas: 0, avisos: [] }
    const post = await db.socialPost.findUnique({
      where: { id: postId },
      select: { id: true, projectId: true, pageId: true, mediaUrls: true },
    })
    if (!post) return { refiladas: 0, avisos: [] }

    // A posição do slide vem da ORDEM em `mediaUrls`, que é a ordem em que o
    // Instagram publica — a fonte de verdade sobre "slide 2 de 5".
    const urls = Array.isArray(post.mediaUrls) ? (post.mediaUrls as unknown[]).map(String) : []
    const daPagina = new Map<string, { slide: number | null; de: number | null }>()
    if (post.pageId) daPagina.set(post.pageId, { slide: null, de: null })
    if (urls.length > 1) {
      for (const [i, url] of urls.entries()) {
        const arquivo = url.split('/').pop() ?? ''
        const m = arquivo.match(/^(c[a-z0-9]+)-\d{13}\./)
        if (!m || m[1] === post.id) continue
        daPagina.set(m[1], { slide: i + 1, de: urls.length })
      }
    }
    if (daPagina.size === 0) return { refiladas: 0, avisos: [] }

    let refiladas = 0
    for (const [pageId, carrossel] of daPagina) {
      const page = await db.page.findUnique({
        where: { id: pageId },
        select: {
          id: true, name: true, order: true, isTemplate: true, tags: true, width: true, height: true,
          Template: { select: { id: true, category: true, projectId: true } },
        },
      })
      if (!page) continue
      // Modelo é acervo do cliente, não peça de uma semana: promover ou
      // despromover é curadoria, e refilar por causa de um post seria mexer no
      // acervo pela porta errada.
      if (page.isTemplate) { avisos.push(`"${page.name}" é modelo e ficou onde estava.`); continue }
      if (!page.tags.includes('compositor')) { avisos.push(`"${page.name}" não é peça composta e ficou onde estava.`); continue }
      const cat = page.Template.category
      if (cat !== CATEGORIA_PROGRAMACAO && cat !== CATEGORIA_AVULSAS) continue

      const formato = formatoDaPagina(page)
      const destino = await garantirPasta(page.Template.projectId, userId, quando, formato)
      const slide = carrossel.slide
      const { ordem } = await ordemNaPasta(destino.id, quando, slide ?? (await slideDaPagina(pageId)))
      const nome = nomeDaPagina({
        quando,
        tema: await temaDaPagina(pageId, page.name),
        carrossel: slide && slide > 1 ? { slide, de: carrossel.de ?? undefined } : null,
      })
      if (destino.id === page.Template.id && nome === page.name && ordem === page.order) continue
      await db.page.update({ where: { id: pageId }, data: { templateId: destino.id, name: nome, order: ordem } })
      refiladas++
    }
    return { refiladas, avisos }
  } catch (erro) {
    console.warn('[compositor] não deu para refilar as páginas do post:', (erro as Error).message)
    return { refiladas: 0, avisos }
  }
}

/**
 * O assunto que vai no nome da página. A spec da composição é a fonte boa; o
 * nome atual é o fallback, e funciona porque a migração de 04/09/2026
 * normalizou todos eles em "Dia dd/mm · HH:MM · tema[ · slide n/N]".
 */
async function temaDaPagina(pageId: string, nomeAtual: string): Promise<string | null> {
  try {
    const g = await db.generation.findFirst({
      where: { fieldValues: { path: ['pageId'], equals: pageId } },
      select: { fieldValues: true },
      orderBy: { createdAt: 'desc' },
    })
    const tema = (g?.fieldValues as { spec?: { tema?: unknown; nome?: unknown } } | null)?.spec?.tema
    if (typeof tema === 'string' && tema.trim()) return tema
  } catch {
    // segue para o fallback
  }
  const partes = nomeAtual.split(' · ')
  return partes.length >= 3 ? partes[2] : null
}
