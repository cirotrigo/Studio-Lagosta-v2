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
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import type { CanalDaArte } from '@/lib/creatives/canal'
import { enfileirarComposicao, pedirNovaTentativa, type ComposicaoJobArgs } from '@/lib/ai/generation-queue'

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
  }
}
