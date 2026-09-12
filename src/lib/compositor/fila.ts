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
import { payloadParaHash, validarIdentidadeDeLote, type DesfechoDoItemDeLote, type IdentidadeDeLote, type SituacaoDaPecaDoLote } from '@/lib/lotes/identidade'
import { reservarItemDeLote } from '@/lib/lotes/reserva'

import { comporPeca } from './compor'
import { garantirPasta } from './pastas'
import { validarSpec, type SpecDePeca } from './spec'

export interface PecaEnfileirada {
  generationId: string
  jobId: string
  spec: SpecDePeca
  /**
   * Presente quando a peça veio com identidade de lote (`opcoes.lote`): o que
   * a chamada fez com o item e como a peça dele está agora. O conflito não
   * aparece aqui — ele LANÇA `LOTE_ITEM_CONFLITO` (409) sem escrever nada.
   */
  lote?: { loteId: string; itemId: string; desfecho: DesfechoDoItemDeLote; situacao: SituacaoDaPecaDoLote }
}

export interface OpcoesDeEnfileirar {
  decididoPor?: string | null
  canal?: CanalDaArte | null
  autor?: string | null
  itemAtualizadoEm?: Date | string
  /**
   * A identidade durável do item (PR 11): `loteId` + `itemId` vindos de quem
   * chama, estáveis entre retentativas. Com ela a peça passa pela reserva de
   * `src/lib/lotes/reserva.ts` — repetir a chamada devolve a MESMA Generation
   * e o MESMO job; outro conteúdo sob a mesma chave é conflito. Sem ela, o
   * comportamento de sempre.
   */
  lote?: { loteId: string; itemId: string } | null
}

type ProjetoDaPeca = { id: number; name: string; userId: string }
type Pasta = Awaited<ReturnType<typeof garantirPasta>>

/** A Generation PROCESSING que a fila fecha — a mesma com e sem identidade de lote. */
function dadosDaGeracao(spec: SpecDePeca, projeto: ProjetoDaPeca, coletor: Pasta, opcoes: OpcoesDeEnfileirar) {
  return {
    status: 'PROCESSING' as const,
    templateId: coletor.id,
    projectId: spec.projectId,
    createdBy: opcoes.autor ?? projeto.userId,
    authorName: 'compositor',
    canal: opcoes.canal ?? null,
    templateName: coletor.name,
    projectName: projeto.name,
    fieldValues: { source: 'compositor', spec, fila: 'aguardando' } as never,
  }
}

/** Cria a Generation PROCESSING e o job. Idempotente por Generation (e, com `opcoes.lote`, por item do lote). */
export async function enfileirarPeca(entrada: unknown, opcoes: OpcoesDeEnfileirar = {}): Promise<PecaEnfileirada> {
  const v = validarSpec(entrada)
  if (!v.spec) throw new CreativeError('SPEC_INVALIDA', `Spec inválida — ${v.problemas.join('; ')}`, 400, { problemas: v.problemas })
  const spec = v.spec

  let identidade: IdentidadeDeLote | null = null
  if (opcoes.lote != null) {
    const r = validarIdentidadeDeLote(opcoes.lote)
    if (!r.identidade) throw new CreativeError('LOTE_IDENTIDADE_INVALIDA', `Identidade de lote inválida — ${r.problemas.join('; ')}`, 400, { problemas: r.problemas })
    identidade = r.identidade
  }

  const projeto = await db.project.findUnique({ where: { id: spec.projectId }, select: { id: true, name: true, userId: true } })
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${spec.projectId} não encontrado`, 404)

  if (identidade) return enfileirarPecaDoLote(spec, projeto, identidade, opcoes)

  const coletor = await garantirPasta(spec.projectId, projeto.userId, spec.quando ?? null, spec.formato)

  const data = dadosDaGeracao(spec, projeto, coletor, opcoes)
  if (spec.itemDePlanoId) {
    const { enfileirarComposicaoDoPlano } = await import('@/lib/planos/enfileirar-composicao')
    return enfileirarComposicaoDoPlano(spec, data, opcoes.decididoPor ?? null, opcoes.autor ?? null, opcoes.itemAtualizadoEm)
  }
  const generation = await db.generation.create({ data, select: { id: true } })

  const jobId = await enfileirarComposicao({ generationId: generation.id, projectId: spec.projectId, spec, decididoPor: opcoes.decididoPor ?? null, autor: opcoes.autor ?? null })
  await reapontarItemDoPlano(spec, 'na-fila', { generationId: generation.id, decididoPor: opcoes.decididoPor ?? null })
  return { generationId: generation.id, jobId, spec }
}

/**
 * O caminho COM identidade de lote. A pasta só é garantida quando é preciso
 * criar (a repetição de uma leva viva não escreve nada), e Generation + job
 * nascem dentro da transação que segura a linha do item — ver `reserva.ts`.
 *
 * Com `itemDePlanoId`, quem cria é o caminho do plano (na mesma transação), e
 * ele pode devolver a Generation que o item já tinha na mesma revisão. Mas a
 * repetição de uma chave VIVA é decidida pela identidade de lote antes de
 * chegar ao plano: mesma chave e mesmo payload são a mesma peça, mesmo que o
 * item tenha sido revisado fora da spec (campanha, escopo) — revisão nova pede
 * lote ou item novo.
 */
async function enfileirarPecaDoLote(spec: SpecDePeca, projeto: ProjetoDaPeca, identidade: IdentidadeDeLote, opcoes: OpcoesDeEnfileirar): Promise<PecaEnfileirada> {
  const decididoPor = opcoes.decididoPor ?? null
  const autor = opcoes.autor ?? null
  let coletor: Pasta | null = null
  const pasta = async () => (coletor ??= await garantirPasta(spec.projectId, projeto.userId, spec.quando ?? null, spec.formato))

  const r = await reservarItemDeLote({
    projectId: spec.projectId,
    identidade,
    payload: payloadParaHash(spec),
    preparar: async () => {
      await pasta()
    },
    criar: async (tx, { recuperacao }) => {
      const data = dadosDaGeracao(spec, projeto, await pasta(), opcoes)
      if (spec.itemDePlanoId) {
        // A decisão da retomada vai junto: sem ela o caminho do plano reaproveitava
        // o job terminal (R01) e recusava o item em voo sem job (R02).
        const { enfileirarComposicaoDoPlanoEm } = await import('@/lib/planos/enfileirar-composicao')
        const p = await enfileirarComposicaoDoPlanoEm(tx, spec, data, decididoPor, autor, opcoes.itemAtualizadoEm, recuperacao)
        return { generationId: p.generationId, jobId: p.jobId, reaproveitado: p.reaproveitado }
      }
      const generation = await tx.generation.create({ data, select: { id: true } })
      const jobId = await enfileirarComposicao({ generationId: generation.id, projectId: spec.projectId, spec, decididoPor, autor }, tx)
      return { generationId: generation.id, jobId }
    },
    // O job do item de plano carrega a revisão do item: só o caminho do plano o
    // monta, e recebe a retomada "só o job" pela `recuperacao` de `criar`.
    ...(spec.itemDePlanoId
      ? {}
      : { criarJob: (tx, generationId) => enfileirarComposicao({ generationId, projectId: spec.projectId, spec, decididoPor, autor }, tx) }),
  })
  return {
    generationId: r.generationId,
    jobId: r.jobId,
    spec,
    lote: { loteId: r.loteId, itemId: r.itemId, desfecho: r.desfecho, situacao: r.situacao },
  }
}

/** O runner do job COMPOR. Nunca lança: o desfecho fica na Generation. */
export async function processarComposicaoEmBackground(args: ComposicaoJobArgs & { queueJobId?: string | null }): Promise<void> {
  /**
   * Mesma fila, trabalho diferente: RECOMPOR refaz a arte de uma página que já
   * existe e troca a posição dela nos posts que a invalidação não alcança (o
   * slide de carrossel). Ver `recompor.ts` — inclusive por que aquele runner
   * LANÇA na falha e este não.
   */
  if (args.recompor) {
    const { processarRecomposicaoEmBackground } = await import('./recompor')
    await processarRecomposicaoEmBackground({
      generationId: args.generationId,
      projectId: args.projectId,
      recompor: args.recompor,
      decididoPor: args.decididoPor ?? null,
      queueJobId: args.queueJobId ?? null,
    })
    return
  }

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
        generationEsperada: args.generationId,
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
    const deterministico = ['SPEC_INVALIDA', 'ASSINATURA_INCOMPLETA', 'TEXTO_NAO_CABE_NA_COLUNA', 'TEXTO_NAO_CABE', 'PROJECT_NOT_FOUND', 'PAPEIS_INCOMPATIVEIS', 'SEM_COMBINACAO'].includes(code)
    if (!deterministico && (await pedirNovaTentativa(args.queueJobId, msg))) return
    const atual = await db.generation.findUnique({ where: { id: args.generationId }, select: { fieldValues: true } })
    const fv = (atual?.fieldValues && typeof atual.fieldValues === 'object' ? atual.fieldValues : {}) as Record<string, unknown>
    await db.generation.update({
      where: { id: args.generationId },
      data: { status: 'FAILED', fieldValues: { ...fv, error: msg, errorCode: code, ...(erro instanceof CreativeError && erro.details ? { errorDetails: erro.details } : {}) } as never },
    })
    await reapontarItemDoPlano(specDe(args.spec), 'erro', { erro: msg, decididoPor: args.decididoPor ?? null, generationEsperada: args.generationId })
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
  extras: { generationEsperada?: string; generationId?: string; pageId?: string; erro?: string; decididoPor?: string | null } = {},
): Promise<StatusDoItem | null> {
  if (!spec?.itemDePlanoId) return null
  try {
    const item = await db.itemDePlano.findFirst({
      where: { id: spec.itemDePlanoId, projectId: spec.projectId, ...(spec.planoId ? { planoId: spec.planoId } : {}) },
      select: { id: true, planoId: true, status: true, generationId: true, updatedAt: true },
    })
    if (!item) {
      console.warn(`[compositor] item de plano ${spec.itemDePlanoId} não encontrado no projeto ${spec.projectId} — a peça fica só na galeria`)
      return null
    }
    const de = normalizarStatusDoItem(item.status) ?? 'proposto'
    if (extras.generationEsperada && (item.generationId !== extras.generationEsperada || !['na-fila', 'gerando'].includes(de))) return de
    const passos = caminhoAte(de, para)
    if (passos === null) {
      console.warn(`[compositor] item ${item.id} está em "${de}" e não pode ir para "${para}" — não reaponto`)
      return de
    }
    if (passos.length === 0) return de

    if (extras.generationEsperada) {
      // O caminho foi validado acima. Publica o desfecho em um único CAS:
      // uma revisão/edição entre a leitura e a escrita não pode ser perdida.
      const atualizado = await db.itemDePlano.updateMany({
        where: { id: item.id, projectId: spec.projectId, planoId: item.planoId,
          generationId: extras.generationEsperada, status: item.status, updatedAt: item.updatedAt },
        data: { status: para, ...(extras.generationId !== undefined ? { generationId: extras.generationId } : {}),
          ...(extras.pageId !== undefined ? { pageId: extras.pageId } : {}),
          ...(extras.erro !== undefined ? { erro: extras.erro } : {}) },
      })
      return atualizado.count === 1 ? para : null
    }

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
