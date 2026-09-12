/**
 * A voz compacta no BANCO — a única casa do módulo que importa o Prisma
 * (PR 7 de "Marca simples, copy melhor", 12/09/2026). O contrato, a
 * precedência e o "virar regra" são puros em `voz.ts`; aqui mora só a
 * gravação (com compare-and-set na versão), a migração e a leitura.
 *
 * Regras:
 * - `BrandVoice` é 1:1 com o projeto; `versao` cresce a cada gravação e é o
 *   CAS: quem grava manda a versão que leu (`versaoEsperada`), e uma voz que
 *   mudou embaixo recusa (`VOZ_DIVERGENTE`, 409) em vez de sobrescrever a
 *   edição de outra pessoa. Sem registro ainda, a primeira gravação cria.
 * - Voz inválida NUNCA é gravada (`VOZ_INVALIDA`, 400, com TODOS os
 *   problemas) — o contrato é a régua, e a leitura tolera só o que passou.
 * - MIGRAR não apaga o DNA: liga a precedência (`migradaEm`) e guarda o
 *   snapshot do DNA de texto (`dnaArquivado`) — o caminho de volta é
 *   `desfazerMigracao`, que só desliga a precedência. Quem decide migrar é o
 *   Ciro, cliente a cliente (PR 13); este serviço só oferece a alavanca.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import {
  aplicarRegraNaVoz,
  arquivoDoDna,
  lerVoz,
  precedenciaDaVoz,
  regrasAtivas,
  type ContextoDeVoz,
  type NovaRegra,
  type RegraDaVoz,
  type ResultadoDeRegra,
  type VozCompacta,
} from './voz'

export interface RegistroDaVoz {
  id: number
  projectId: number
  versao: number
  /** A voz como está gravada (pode estar inválida se o contrato mudou depois). */
  voz: VozCompacta | null
  problemas: Array<{ caminho: string; mensagem: string }>
  migradaEm: Date | null
  dnaArquivado: unknown
  updatedAt: Date
}

export async function lerRegistroDaVoz(projectId: number): Promise<RegistroDaVoz | null> {
  const r = await db.brandVoice.findUnique({ where: { projectId } })
  if (!r) return null
  const { voz, problemas } = lerVoz(r.voz)
  return { id: r.id, projectId: r.projectId, versao: r.versao, voz, problemas, migradaEm: r.migradaEm, dnaArquivado: r.dnaArquivado, updatedAt: r.updatedAt }
}

/** A precedência resolvida para UM projeto (o que `loadBrandContext` também entrega em `brand.voz`). */
export async function contextoDeVoz(projectId: number): Promise<ContextoDeVoz> {
  const [registro, dna] = await Promise.all([
    db.brandVoice.findUnique({ where: { projectId }, select: { voz: true, versao: true, migradaEm: true } }),
    db.brandDNA.findUnique({ where: { projectId }, select: { toneOfVoice: true, contentRules: true } }),
  ])
  return precedenciaDaVoz({ registro, dna: { toneOfVoice: dna?.toneOfVoice ?? null, contentRules: dna?.contentRules ?? null } })
}

export interface GravarVozArgs {
  projectId: number
  voz: unknown
  /** A versão que quem grava LEU. Obrigatória quando já existe registro (CAS). */
  versaoEsperada?: number
}

export async function gravarVoz(args: GravarVozArgs): Promise<{ versao: number; voz: VozCompacta; criada: boolean }> {
  const { voz, problemas } = lerVoz(args.voz)
  if (!voz) {
    throw new CreativeError('VOZ_INVALIDA', `A voz não passa no contrato (${problemas.length} problema${problemas.length === 1 ? '' : 's'}): ${problemas.map((p) => `${p.caminho}: ${p.mensagem}`).join(' · ')}`, 400, { problemas })
  }
  const atual = await db.brandVoice.findUnique({ where: { projectId: args.projectId }, select: { versao: true } })
  if (!atual) {
    if (args.versaoEsperada != null && args.versaoEsperada !== 0) {
      throw new CreativeError('VOZ_DIVERGENTE', 'Ainda não há voz gravada para este cliente; a versão esperada não bate.', 409, { versaoEsperada: args.versaoEsperada, versaoAtual: null })
    }
    const criada = await db.brandVoice.create({ data: { projectId: args.projectId, versao: 1, voz: voz as never }, select: { versao: true } })
    return { versao: criada.versao, voz, criada: true }
  }
  if (args.versaoEsperada == null) {
    throw new CreativeError('VOZ_VERSAO_OBRIGATORIA', `Já existe uma voz gravada (versão ${atual.versao}): mande a versão que você leu para não sobrescrever a edição de outra pessoa.`, 400, { versaoAtual: atual.versao })
  }
  const gravada = await db.brandVoice.updateMany({
    where: { projectId: args.projectId, versao: args.versaoEsperada },
    data: { voz: voz as never, versao: { increment: 1 } },
  })
  if (gravada.count === 0) {
    throw new CreativeError('VOZ_DIVERGENTE', `A voz mudou enquanto você editava (versão esperada ${args.versaoEsperada}, atual ${atual.versao}). Leia de novo antes de gravar.`, 409, { versaoEsperada: args.versaoEsperada, versaoAtual: atual.versao })
  }
  return { versao: args.versaoEsperada + 1, voz, criada: false }
}

/**
 * Liga a voz para o cliente: daqui para a frente a copy lê a voz, não o DNA de
 * texto. O DNA fica intacto (a arte continua lendo `contentRules`); o snapshot
 * dele vai para `dnaArquivado`, para o registro do que valia até aqui.
 */
export async function migrarParaVoz(args: { projectId: number; versaoEsperada: number; em?: Date }): Promise<{ migradaEm: Date; jaEstava: boolean; versao: number }> {
  const registro = await lerRegistroDaVoz(args.projectId)
  if (!registro) throw new CreativeError('VOZ_INEXISTENTE', 'Não há voz gravada para migrar: grave a voz primeiro.', 404)
  if (!registro.voz) throw new CreativeError('VOZ_INVALIDA', `A voz gravada não passa no contrato: ${registro.problemas.map((p) => `${p.caminho}: ${p.mensagem}`).join(' · ')}`, 400, { problemas: registro.problemas })
  if (registro.migradaEm) return { migradaEm: registro.migradaEm, jaEstava: true, versao: registro.versao }
  if (registro.versao !== args.versaoEsperada) {
    throw new CreativeError('VOZ_DIVERGENTE', `A voz mudou (versão esperada ${args.versaoEsperada}, atual ${registro.versao}). Releia a voz antes de migrar.`, 409, { versaoEsperada: args.versaoEsperada, versaoAtual: registro.versao })
  }
  const dna = await db.brandDNA.findUnique({ where: { projectId: args.projectId }, select: { toneOfVoice: true, contentRules: true, updatedAt: true } })
  const em = args.em ?? new Date()
  const gravada = await db.brandVoice.updateMany({
    where: { projectId: args.projectId, versao: args.versaoEsperada, migradaEm: null },
    data: { migradaEm: em, dnaArquivado: arquivoDoDna({ toneOfVoice: dna?.toneOfVoice ?? null, contentRules: dna?.contentRules ?? null, updatedAt: dna?.updatedAt ?? null }, em) as never },
  })
  if (gravada.count === 0) throw new CreativeError('VOZ_DIVERGENTE', 'A voz mudou enquanto a migração era gravada. Releia e tente de novo.', 409)
  return { migradaEm: em, jaEstava: false, versao: args.versaoEsperada }
}

/** Desliga a precedência da voz: o DNA de texto volta a mandar na copy. A voz e o snapshot ficam. */
export async function desfazerMigracao(args: { projectId: number }): Promise<{ desfeita: boolean }> {
  const r = await db.brandVoice.updateMany({ where: { projectId: args.projectId, migradaEm: { not: null } }, data: { migradaEm: null } })
  return { desfeita: r.count > 0 }
}

export interface VirarRegraNaVozArgs extends NovaRegra {
  projectId: number
  /** Sem isto nada é gravado: devolve só a proposta. */
  confirmado?: boolean
  /**
   * A versão da voz que a PRÉVIA mostrou (`versaoLida`). OBRIGATÓRIA ao
   * confirmar: entre a prévia e a confirmação outra edição pode ter mudado a
   * regra que seria substituída, mantendo o id — confirmar contra a versão
   * atual desativaria uma regra que a pessoa não viu (PR7-04 da revisão do
   * Codex, 12/09/2026). Versão que não bate → VOZ_DIVERGENTE, nada gravado.
   */
  versaoEsperada?: number
}

export type VirarRegraNaVozResult =
  | {
      destino: 'voz'
      ok: true
      versaoLida: number
      versaoGravada: number | null
      regra: RegraDaVoz
      substituida: RegraDaVoz | null
      conflitos: RegraDaVoz[]
      proibicoesRelacionadas: string[]
      /** As regras ativas de copy/arte ANTES e DEPOIS — é o "antes/depois" que a pessoa confirma. */
      antes: string[]
      depois: string[]
      gravado: boolean
    }
  | { destino: 'voz'; ok: false; versaoLida: number; erro: Extract<ResultadoDeRegra, { ok: false }>['erro']; mensagem: string; conflitos: RegraDaVoz[]; proibicoesRelacionadas: string[]; gravado: false }

/**
 * "Virar regra" no cliente MIGRADO: aplica na voz (substitui / aponta conflito /
 * convive) e grava com CAS na versão lida. Nunca grava sem `confirmado`.
 */
export async function virarRegraNaVoz(args: VirarRegraNaVozArgs): Promise<VirarRegraNaVozResult> {
  const registro = await lerRegistroDaVoz(args.projectId)
  if (!registro?.voz) throw new CreativeError('VOZ_INEXISTENTE', 'Este cliente não tem voz compacta válida gravada.', 404)
  if (args.versaoEsperada != null && args.versaoEsperada !== registro.versao) {
    throw new CreativeError('VOZ_DIVERGENTE', `A voz mudou desde a proposta (versão mostrada ${args.versaoEsperada}, atual ${registro.versao}). Peça a proposta de novo antes de confirmar.`, 409, { versaoEsperada: args.versaoEsperada, versaoAtual: registro.versao })
  }
  if (args.confirmado && args.versaoEsperada == null) {
    throw new CreativeError('VOZ_VERSAO_OBRIGATORIA', `Para gravar a regra mande a versão da voz que a proposta mostrou (versaoLida = ${registro.versao}). Sem ela a confirmação pode desativar uma regra que a pessoa não viu.`, 400, { versaoAtual: registro.versao })
  }
  const resultado = aplicarRegraNaVoz(registro.voz, args)
  // Igualdade explícita: sem strictNullChecks o TS não estreita a união por `!ok`.
  if (resultado.ok === false) {
    return { destino: 'voz', ok: false, versaoLida: registro.versao, erro: resultado.erro, mensagem: resultado.mensagem, conflitos: resultado.conflitos, proibicoesRelacionadas: resultado.proibicoesRelacionadas, gravado: false }
  }
  const texto = (v: VozCompacta) => [...regrasAtivas(v, 'copy'), ...regrasAtivas(v, 'arte').filter((r) => r.escopo === 'arte')].map((r) => `${r.texto} [${r.escopo}]`)
  let versaoGravada: number | null = null
  if (args.confirmado) {
    const g = await gravarVoz({ projectId: args.projectId, voz: resultado.voz, versaoEsperada: registro.versao })
    versaoGravada = g.versao
  }
  return {
    destino: 'voz',
    ok: true,
    versaoLida: registro.versao,
    versaoGravada,
    regra: resultado.regra,
    substituida: resultado.substituida,
    conflitos: resultado.conflitos,
    proibicoesRelacionadas: resultado.proibicoesRelacionadas,
    antes: texto(registro.voz),
    depois: texto(resultado.voz),
    gravado: !!args.confirmado,
  }
}
