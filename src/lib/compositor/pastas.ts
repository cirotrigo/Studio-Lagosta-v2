/**
 * As pastas da programação no banco: garante o template da semana (ou das
 * avulsas do mês) e move uma página entre pastas quando ela ganha data.
 */

import { db } from '@/lib/db'

import { CATEGORIA_AVULSAS, dataDe, pastaDaPeca, type PastaDaPeca } from './pasta-da-semana'

export interface PastaGarantida {
  id: number
  name: string
  pasta: PastaDaPeca
}

/** Acha (pela tag-chave) ou cria o template da pasta. */
export async function garantirPasta(projectId: number, userId: string, quando: string | Date | null | undefined): Promise<PastaGarantida> {
  const pasta = pastaDaPeca(quando)
  const existente = await db.template.findFirst({
    where: { projectId, tags: { has: pasta.chave } },
    select: { id: true, name: true },
  })
  if (existente) return { ...existente, pasta }
  const criado = await db.template.create({
    data: {
      name: pasta.nome,
      // O tipo do template é só rótulo aqui: a pasta mistura story e feed, e
      // cada página carrega o próprio tamanho.
      type: 'STORY',
      dimensions: '1080x1920',
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

export interface Movimentacao {
  moveu: boolean
  de: { id: number; name: string } | null
  para: { id: number; name: string } | null
}

/**
 * Página que estava nas AVULSAS (ou num coletor do compositor) e ganhou data:
 * vai para a semana. Só move página de peça composta; nunca move modelo. Erro
 * vira `moveu: false` — mover pasta não pode derrubar agendamento.
 */
export async function moverPaginaParaSemana(pageId: string, quando: string | Date, userId: string): Promise<Movimentacao> {
  try {
    if (!dataDe(quando)) return { moveu: false, de: null, para: null }
    const page = await db.page.findUnique({
      where: { id: pageId },
      select: { id: true, isTemplate: true, tags: true, Template: { select: { id: true, name: true, category: true, projectId: true } } },
    })
    if (!page || page.isTemplate) return { moveu: false, de: null, para: null }
    const ehComposta = page.tags.includes('compositor')
    const emAvulsas = page.Template.category === CATEGORIA_AVULSAS || page.Template.category === 'arte-rapida'
    if (!ehComposta || !emAvulsas) return { moveu: false, de: page.Template, para: null }

    const destino = await garantirPasta(page.Template.projectId, userId, quando)
    if (destino.id === page.Template.id) return { moveu: false, de: page.Template, para: destino }
    const max = await db.page.aggregate({ where: { templateId: destino.id }, _max: { order: true } })
    await db.page.update({ where: { id: pageId }, data: { templateId: destino.id, order: (max._max.order ?? -1) + 1 } })
    return { moveu: true, de: page.Template, para: { id: destino.id, name: destino.name } }
  } catch (erro) {
    console.warn('[compositor] não deu para mover a página para a semana:', (erro as Error).message)
    return { moveu: false, de: null, para: null }
  }
}
