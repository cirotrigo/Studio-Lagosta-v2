/**
 * O PERFIL APRENDIDO de um cliente — a destilação (F2).
 *
 * Junta num objeto só o que o sistema aprendeu por USO: em que assuntos este
 * cliente publica, que modelo ele prefere para cada um, que foto, onde a IA
 * costuma errar e como a pessoa reescreve a copy.
 *
 * ── PARA QUE ISTO EXISTE ──────────────────────────────────────────────────
 * Para alimentar a GERAÇÃO, não para virar mais uma tela de conferência. Em 10
 * e 11/08/2026 três mecanismos de verificação foram desligados (retry de
 * qualidade, revisão visual, crivo de aprovação) pela mesma razão: verificação
 * que atrasa, erra ou bloqueia treina o usuário a ignorá-la. O aprendizado tem
 * de chegar antes — no prompt que escreve a peça —, e é por isso que a saída
 * daqui é um bloco de texto para prompt (`perfilParaPrompt`), e não um
 * relatório para alguém aprovar.
 *
 * ── A BLINDAGEM, DO LADO DA LEITURA ───────────────────────────────────────
 * `perfilParaPrompt` lê SOMENTE as observações de causa `estilo`. As de causa
 * `fato` (preço, horário, promoção corrigidos) existem no objeto para virar
 * alerta de "base desatualizada" numa tela, e **não têm caminho nenhum até um
 * prompt**. Somada à trava da escrita (`sanitizarParaPerfil`, em
 * `causa-do-diff.ts`) e à conferência final desta função, são três portas na
 * mesma parede: o perfil nunca pode ser a fonte de um preço.
 */

import { db } from '@/lib/db'
import {
  alertaDeBaseDesatualizada,
  classificarDiff,
  contemDadoProibido,
  sanitizarParaPerfil,
  type AlteracaoComCausa,
} from './causa-do-diff'
import type { DiffDeCopy } from './diff-copy'
import { minerarHistorico, type MineracaoDoHistorico } from './mineracao'
import { nomeDoPilar, PILAR_OUTRO, PILAR_SEM_TEXTO, type Pilar } from './pilares'
import { taxonomiaAprovada } from './pilares-service'

const JANELA_PADRAO_DIAS = 180
/** Quantos exemplos de reescrita entram no perfil (e no prompt). */
const MAX_EXEMPLOS_DE_ESTILO = 12

export interface DistribuicaoDePilar {
  pilar: string
  nome: string
  total: number
  /** Fração sobre os posts que TÊM pilar de verdade (sem `outro`/`sem-texto`). */
  fracao: number
}

export interface ExemploDeEstilo {
  campo: string | null
  antes: string
  depois: string
}

export interface EstatisticasDeCopy {
  /** Sinais de copy com diff legível no período. */
  comDiff: number
  aceitasComoVieram: number
  editadas: number
  /** Média de quanto da copy proposta não sobreviveu intacta (0..1). */
  proporcaoMediaAlterada: number
}

export interface PerfilAprendido {
  projectId: number
  geradoEm: string
  taxonomia: Pilar[]
  pilares: DistribuicaoDePilar[]
  /** Posts sem pilar de verdade, separados pelos dois motivos. */
  semPilar: { outro: number; semTexto: number; naoClassificados: number }
  mineracao: MineracaoDoHistorico
  estilo: {
    exemplos: ExemploDeEstilo[]
    estatisticas: EstatisticasDeCopy
  }
  /** NUNCA vai para prompt — é aviso de que a base pode estar velha. */
  alertasDeBase: { mensagem: string | null; ocorrencias: number }
}

/** Linha de `LearningSignal` que interessa aqui. */
interface SinalDeCopy {
  diff: unknown
}

/**
 * Monta o perfil. Nunca lança: cada bloco degrada para vazio.
 */
export async function montarPerfil(
  projectId: number,
  opcoes: { desde?: Date } = {},
): Promise<PerfilAprendido> {
  const desde = opcoes.desde ?? new Date(Date.now() - JANELA_PADRAO_DIAS * 24 * 3600_000)

  const [taxonomia, contagemDePilar, sinais, mineracao] = await Promise.all([
    taxonomiaAprovada(projectId).catch(() => [] as Pilar[]),
    db.socialPost
      .groupBy({
        by: ['pilar'],
        where: { projectId, status: 'POSTED', scheduledDatetime: { gte: desde } },
        _count: { _all: true },
      })
      .catch(() => [] as Array<{ pilar: string | null; _count: { _all: number } }>),
    db.learningSignal
      .findMany({
        where: { projectId, tipo: 'copy', createdAt: { gte: desde }, diff: { not: undefined } },
        select: { diff: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => [] as SinalDeCopy[]),
    minerarHistorico(projectId, { desde }).catch(() => null),
  ])

  // ── Distribuição por pilar ────────────────────────────────────────────────
  let outro = 0
  let semTexto = 0
  let naoClassificados = 0
  const reais: Array<{ pilar: string; total: number }> = []
  for (const linha of contagemDePilar) {
    const total = linha._count._all
    if (!linha.pilar) naoClassificados += total
    else if (linha.pilar === PILAR_OUTRO) outro += total
    else if (linha.pilar === PILAR_SEM_TEXTO) semTexto += total
    else reais.push({ pilar: linha.pilar, total })
  }
  const totalReal = reais.reduce((a, b) => a + b.total, 0)
  const pilares: DistribuicaoDePilar[] = reais
    .map((p) => ({
      pilar: p.pilar,
      nome: nomeDoPilar(p.pilar, taxonomia),
      total: p.total,
      fracao: totalReal > 0 ? Math.round((p.total / totalReal) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // ── Estilo: o que as pessoas reescrevem ──────────────────────────────────
  const exemplos: ExemploDeEstilo[] = []
  const alertas: AlteracaoComCausa[] = []
  let comDiff = 0
  let aceitas = 0
  let editadas = 0
  let somaProporcao = 0

  for (const sinal of sinais) {
    const diff = sinal.diff as DiffDeCopy | null
    if (!diff || typeof diff !== 'object' || diff.ilegivel) continue
    comDiff += 1
    if (diff.mudou) editadas += 1
    else aceitas += 1
    somaProporcao += typeof diff.proporcaoAlterada === 'number' ? diff.proporcaoAlterada : 0

    const classificado = classificarDiff(diff)
    alertas.push(...classificado.alertasDeBase)
    for (const a of classificado.paraOPerfil) {
      if (exemplos.length >= MAX_EXEMPLOS_DE_ESTILO) break
      const antes = sanitizarParaPerfil(a.antes)
      const depois = sanitizarParaPerfil(a.depois)
      if (!antes || !depois) continue
      exemplos.push({ campo: a.campo, antes, depois })
    }
  }

  return {
    projectId,
    geradoEm: new Date().toISOString(),
    taxonomia,
    pilares,
    semPilar: { outro, semTexto, naoClassificados },
    mineracao:
      mineracao ?? {
        modelos: [],
        modeloPorPilar: [],
        modeloPorDia: [],
        fotos: [],
        ajustes: [],
        cobertura: {
          generationsNoPeriodo: 0,
          usosDeModelo: 0,
          postsNoPeriodo: 0,
          postsComPilar: 0,
          ajustesRegistrados: 0,
          fotosRegistradas: 0,
          ressalvas: ['Não consegui minerar o histórico de templates agora.'],
        },
      },
    estilo: {
      exemplos,
      estatisticas: {
        comDiff,
        aceitasComoVieram: aceitas,
        editadas,
        proporcaoMediaAlterada: comDiff > 0 ? Math.round((somaProporcao / comDiff) * 100) / 100 : 0,
      },
    },
    alertasDeBase: { mensagem: alertaDeBaseDesatualizada(alertas), ocorrencias: alertas.length },
  }
}

/**
 * O perfil como bloco de texto para prompt de geração.
 *
 * 🔴 **A porta estreita.** Só passa por aqui: os pilares do cliente, a
 * preferência de modelo e os exemplos de REESCRITA de causa `estilo`. Preço,
 * horário, data e promoção não têm caminho — as alterações de causa `fato` nem
 * são lidas, e o que sobra ainda passa por uma conferência final linha a linha
 * (`contemDadoProibido`), porque uma trava que depende de todas as anteriores
 * terem funcionado não é uma trava.
 *
 * `null` quando não há nada aprendido que valha ocupar espaço no prompt.
 */
export function perfilParaPrompt(perfil: PerfilAprendido): string | null {
  const blocos: string[] = []

  if (perfil.pilares.length > 0) {
    blocos.push(
      `ASSUNTOS DESTE CLIENTE (o que ele publica, do mais para o menos frequente):\n${perfil.pilares
        .map((p) => `- ${p.nome} (${Math.round(p.fracao * 100)}% das peças com assunto identificado)`)
        .join('\n')}`,
    )
  }

  const porPilar = perfil.mineracao.modeloPorPilar.filter((m) => m.usos >= 2 && m.nome)
  if (porPilar.length > 0) {
    blocos.push(
      `MODELO QUE ESTE CLIENTE COSTUMA USAR EM CADA ASSUNTO:\n${porPilar
        .map((m) => `- ${nomeDoPilar(m.pilar, perfil.taxonomia)}: "${m.nome}" (${m.usos}x)`)
        .join('\n')}`,
    )
  }

  // A conferência final: linha que carregue dado protegido é descartada aqui,
  // mesmo já tendo passado pela trava da escrita.
  const reescritas = perfil.estilo.exemplos
    .filter((e) => !contemDadoProibido(e.antes) && !contemDadoProibido(e.depois))
    .slice(0, 8)
  if (reescritas.length > 0) {
    blocos.push(
      `COMO ESTA MARCA REESCREVE (o que a IA propôs → o que a pessoa preferiu):\n${reescritas
        .map((e) => `- "${e.antes}" → "${e.depois}"`)
        .join('\n')}`,
    )
  }

  const ajustes = perfil.mineracao.ajustes.filter((a) => a.ocorrencias >= 2).slice(0, 5)
  if (ajustes.length > 0) {
    blocos.push(
      `CAMPOS QUE COSTUMAM PRECISAR DE CORREÇÃO NESTE CLIENTE (capriche neles): ${ajustes
        .map((a) => `${a.campo} (${a.ocorrencias}x)`)
        .join(', ')}`,
    )
  }

  if (blocos.length === 0) return null
  return [
    'O QUE O SISTEMA APRENDEU COM O USO DESTE CLIENTE',
    '(observado do que já foi publicado e do que as pessoas corrigiram; não é regra da marca — o DNA e a base de conhecimento continuam mandando, e preço, horário e promoção SÓ podem vir da base.)',
    '',
    ...blocos,
  ].join('\n')
}
