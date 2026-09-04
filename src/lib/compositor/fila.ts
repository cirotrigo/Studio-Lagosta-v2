/**
 * A composição na FILA DURÁVEL (F3 do plano editor-como-usina).
 *
 * Cada peça pedida vira uma Generation PROCESSING + um job COMPOR; quem
 * executa é o cron `generation-jobs`, em série, dentro de um orçamento de
 * tempo — 63 peças saem em poucas varreduras sem disputar o teto de 300s da
 * invocação que as pediu. Mesmo desenho da F0.3 (fila de IA), com uma
 * diferença que importa: aqui não há chamada paga, então `maxAttempts` é 3.
 *
 * O MCP e a rota HTTP só ENFILEIRAM (`enfileirarPeca`); o runner
 * (`processarComposicaoEmBackground`) chama `comporPeca` com o `generationId`
 * e o persist FECHA a Generation em vez de criar outra. Falha grava FAILED com
 * motivo legível em `fieldValues.error` — é o que `fecharJob` lê.
 *
 * **O item do plano é reapontado AQUI, não por quem enfileirou.** Quando a
 * spec traz `itemDePlanoId`, a fila é a única que sabe quando a peça existe:
 * ao enfileirar o item vai para `na-fila`; a peça pronta o leva a `pronto`
 * com `generationId`/`pageId`; a falha definitiva, a `erro`. Nada disso
 * derruba a composição — é contabilidade do plano (mesma regra do `mover` de
 * `executar-plano.ts`). Medido em 04/09/2026 (Espeto, 20 peças): sem isso os
 * 20 itens ficavam `proposto` com a arte pronta na galeria e tinham de ser
 * ligados um a um com `editar-item-do-plano`.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import type { CanalDaArte } from '@/lib/creatives/canal'
import { enfileirarComposicao, pedirNovaTentativa, type ComposicaoJobArgs } from '@/lib/ai/generation-queue'
import { caminhoAte } from '@/lib/planos/execucao'
import { normalizarStatusDoItem, type StatusDoItem } from '@/lib/planos/vocabulario'

import { comporPeca } from './compor'
import { garantirPasta } from './pastas'
import { validarSpec, type SpecDePeca } from './spec'

export interface PecaEnfileirada {
  generationId: string
  jobId: string
  spec: SpecDePeca
}

/** Cria a Generation PROCESSING e o job. Idempotente por Generation. */
export async function enfileirarPeca(entrada: unknown, opcoes: { decididoPor?: string | null; canal?: CanalDaArte | null; autor?: string | null } = {}): Promise<PecaEnfileirada> {
  const v = validarSpec(entrada)
  if (!v.spec) throw new CreativeError('SPEC_INVALIDA', `Spec inválida — ${v.problemas.join('; ')}`, 400, { problemas: v.problemas })
  const spec = v.spec

  const projeto = await db.project.findUnique({ where: { id: spec.projectId }, select: { id: true, name: true, userId: true } })
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${spec.projectId} não encontrado`, 404)

  const coletor = await garantirPasta(spec.projectId, projeto.userId, spec.quando ?? null)

  const generation = await db.generation.create({
    data: {
      status: 'PROCESSING',
      templateId: coletor.id,
      projectId: spec.projectId,
      createdBy: opcoes.autor ?? projeto.userId,
      authorName: 'compositor',
      canal: opcoes.canal ?? null,
      templateName: coletor.name,
      projectName: projeto.name,
      fieldValues: { source: 'compositor', spec, fila: 'aguardando' } as never,
    },
    select: { id: true },
  })

  const jobId = await enfileirarComposicao({ generationId: generation.id, projectId: spec.projectId, spec, decididoPor: opcoes.decididoPor ?? null, autor: opcoes.autor ?? null })
  await reapontarItemDoPlano(spec, 'na-fila', { generationId: generation.id, decididoPor: opcoes.decididoPor ?? null })
  return { generationId: generation.id, jobId, spec }
}

/** O runner do job COMPOR. Nunca lança: o desfecho fica na Generation. */
export async function processarComposicaoEmBackground(args: ComposicaoJobArgs & { queueJobId?: string | null }): Promise<void> {
  const t0 = Date.now()
  try {
    const r = await comporPeca(args.spec, { generationId: args.generationId, decididoPor: args.decididoPor ?? null, autor: args.autor ?? null })
    console.log(
      `[compositor] ${args.generationId} pronta em ${Math.round((Date.now() - t0) / 1000)}s — ${r.diagnostico.posicao.ancora}/${r.diagnostico.posicao.alinha}@${r.diagnostico.posicao.crop}` +
        (r.diagnostico.avisos.length ? ` | avisos: ${r.diagnostico.avisos.join(' · ')}` : ''),
    )
    // O contrato é a peça fechar a Generation da fila. Se um dia voltar a
    // nascer outra, `fecharJob` vai ler PROCESSING e marcar o job FAILED — e
    // este aviso é o que diz por quê.
    if (r.persistido && r.persistido.generationId !== args.generationId) {
      console.warn(`[compositor] ${args.generationId}: a peça foi gravada em OUTRA Generation (${r.persistido.generationId}) — a da fila ficou aberta`)
    }
    if (r.persistido) {
      await reapontarItemDoPlano(specDe(args.spec), 'pronto', {
        generationId: r.persistido.generationId,
        pageId: r.persistido.pageId,
        decididoPor: args.decididoPor ?? null,
      })
    }
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro)
    const code = erro instanceof CreativeError ? erro.code : 'ERRO'
    console.error(`[compositor] ${args.generationId} falhou (${code}): ${msg}`)
    // Erro determinístico (spec, assinatura, texto que não cabe) não melhora
    // tentando de novo; erro de infra (foto, fonte, render) ganha outra vez.
    const deterministico = ['SPEC_INVALIDA', 'ASSINATURA_INCOMPLETA', 'TEXTO_NAO_CABE_NA_COLUNA', 'TEXTO_NAO_CABE', 'PROJECT_NOT_FOUND'].includes(code)
    if (!deterministico && (await pedirNovaTentativa(args.queueJobId, msg))) return
    const atual = await db.generation.findUnique({ where: { id: args.generationId }, select: { fieldValues: true } })
    const fv = (atual?.fieldValues && typeof atual.fieldValues === 'object' ? atual.fieldValues : {}) as Record<string, unknown>
    await db.generation.update({
      where: { id: args.generationId },
      data: { status: 'FAILED', fieldValues: { ...fv, error: msg, errorCode: code, ...(erro instanceof CreativeError && erro.details ? { errorDetails: erro.details } : {}) } as never },
    })
    await reapontarItemDoPlano(specDe(args.spec), 'erro', { erro: msg, decididoPor: args.decididoPor ?? null })
  }
}

/** A spec do payload, sem validar de novo — quem chegou aqui já passou por `validarSpec`. */
function specDe(spec: unknown): SpecDePeca | null {
  return spec && typeof spec === 'object' ? (spec as SpecDePeca) : null
}

/**
 * Move o item do plano ligado à peça, caminhando pelas transições válidas
 * (`na-fila` → `gerando` → `pronto`: a tabela não tem atalho, e `caminhoAte`
 * é quem sabe o caminho — nunca uma cópia da tabela aqui).
 *
 * Nunca lança. Devolve a situação em que o item ficou, ou `null` quando não
 * há item na spec, ele não existe, ou não pôde ser movido — o log diz qual.
 */
export async function reapontarItemDoPlano(
  spec: SpecDePeca | null,
  para: 'na-fila' | 'pronto' | 'erro',
  extras: { generationId?: string; pageId?: string; erro?: string; decididoPor?: string | null } = {},
): Promise<StatusDoItem | null> {
  if (!spec?.itemDePlanoId) return null
  try {
    const item = await db.itemDePlano.findFirst({
      where: { id: spec.itemDePlanoId, projectId: spec.projectId, ...(spec.planoId ? { planoId: spec.planoId } : {}) },
      select: { id: true, planoId: true, status: true },
    })
    if (!item) {
      console.warn(`[compositor] item de plano ${spec.itemDePlanoId} não encontrado no projeto ${spec.projectId} — a peça fica só na galeria`)
      return null
    }
    const de = normalizarStatusDoItem(item.status) ?? 'proposto'
    const passos = caminhoAte(de, para)
    if (passos === null) {
      console.warn(`[compositor] item ${item.id} está em "${de}" e não pode ir para "${para}" — não reaponto`)
      return de
    }
    if (passos.length === 0) return de

    const { transicionarItem } = await import('@/lib/planos/plano-service')
    for (const passo of passos) {
      await transicionarItem({
        projectId: spec.projectId,
        planoId: item.planoId,
        itemId: item.id,
        para: passo,
        decididoPor: extras.decididoPor ?? undefined,
        // Os vínculos e o motivo só acompanham o passo FINAL — um `gerando`
        // intermediário não é o momento em que a arte apareceu.
        ...(passo === para
          ? {
              ...(extras.generationId !== undefined ? { generationId: extras.generationId } : {}),
              ...(extras.pageId !== undefined ? { pageId: extras.pageId } : {}),
              ...(extras.erro !== undefined ? { erro: extras.erro } : {}),
            }
          : {}),
      })
    }
    return para
  } catch (erro) {
    console.error(`[compositor] não deu para mover o item ${spec.itemDePlanoId} para "${para}" (a peça segue na galeria):`, erro)
    return null
  }
}
