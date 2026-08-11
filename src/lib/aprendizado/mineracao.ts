/**
 * Mineração do histórico de templates — o COLD START da destilação (F2).
 *
 * A captura da F1 só enxerga o que acontecer daqui para a frente, e as três
 * semanas de bancada combinadas com o Ciro ainda não passaram. Mas a via de
 * template — a mais usada, e a que não gasta API de imagem — já vinha deixando
 * rastro sem que ninguém consultasse: qual página-modelo virou arte, com que
 * foto, que campo alguém mandou ajustar. Isto aqui é a leitura desse rastro.
 *
 * ⚠️ **A instrumentação é rasa e recente, e o relatório diz isso.** Medido em
 * 11/08/2026 no banco de produção: 3.188 Generations com `source`, mas só 55
 * com `sourcePageId` no Json (3 na coluna nova), 50 `AICreativeGeneration` de
 * template e 44 registros de `ajustes` — 40 deles de um cliente só. Toda
 * resposta daqui vem com `cobertura`, porque "o modelo X é o mais usado" com
 * base em duas amostras não é um achado, é ruído com aparência de dado.
 *
 * Não reimplementa a união dos dois livros-caixa: quem faz isso é
 * `historico-de-artes.ts`, que já resolve a ambiguidade do `sourcePageId` e a
 * dupla contagem do `finalize`.
 */

import { db } from '@/lib/db'
import { contarUsosPorModelo, lerUsosDeModelo, type UsoDeModelo } from './historico-de-artes'
import { PILAR_OUTRO, PILAR_SEM_TEXTO } from './pilares'
import { DIAS_SEMANA_CADENCIA, emBRT } from '@/lib/posts/cadencia'

/** Abaixo disto o número existe, mas não sustenta conclusão nenhuma. */
export const AMOSTRA_MINIMA = 3

const JANELA_PADRAO_DIAS = 180

export interface ModeloMinerado {
  pageId: string
  nome: string | null
  /** Ainda está no pool de candidatos? (`Page.isTemplate`) */
  ehModelo: boolean
  usos: number
  ultimoUso: Date | null
  /** Dia da semana em que este modelo costuma ser usado (nome → contagem). */
  porDia: Array<{ dia: string; total: number }>
  /** Pilar de conteúdo dos posts feitos com ele. */
  porPilar: Array<{ pilar: string; total: number }>
  /** Quantos usos viraram publicação de fato (agendada ou publicada). */
  virouPost: number
  /** `virouPost / usos`, ou `null` quando a amostra é pequena demais. */
  taxaDeAprovacao: number | null
}

export interface FotoMinerada {
  driveImageId: string
  usos: number
  pilares: Array<{ pilar: string; total: number }>
  ultimoUso: Date | null
}

export interface AjusteMinerado {
  /** O campo do template que alguém mandou ajustar ("titulo", "subtitulo"…). */
  campo: string
  ocorrencias: number
  exemplos: string[]
}

export interface Cobertura {
  generationsNoPeriodo: number
  usosDeModelo: number
  postsNoPeriodo: number
  postsComPilar: number
  ajustesRegistrados: number
  fotosRegistradas: number
  /** Frases honestas sobre o que estes números NÃO sustentam. */
  ressalvas: string[]
}

export interface MineracaoDoHistorico {
  modelos: ModeloMinerado[]
  /** Modelo preferido por pilar — só onde a amostra sustenta. */
  modeloPorPilar: Array<{ pilar: string; pageId: string; nome: string | null; usos: number }>
  /** Idem por dia da semana. */
  modeloPorDia: Array<{ dia: string; pageId: string; nome: string | null; usos: number }>
  fotos: FotoMinerada[]
  ajustes: AjusteMinerado[]
  cobertura: Cobertura
}

interface PostDoPeriodo {
  id: string
  generationId: string | null
  pageId: string | null
  status: string
  quando: Date | null
  pilar: string | null
}

/** Um pilar "de verdade" — nem o balde do resto, nem o do que não deu para ler. */
function pilarReal(pilar: string | null | undefined): string | null {
  if (!pilar || pilar === PILAR_OUTRO || pilar === PILAR_SEM_TEXTO) return null
  return pilar
}

function maisComum<T>(itens: T[], chave: (t: T) => string | null): Array<{ chave: string; total: number }> {
  const contagem = new Map<string, number>()
  for (const item of itens) {
    const k = chave(item)
    if (!k) continue
    contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  return [...contagem.entries()]
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Lê tudo que o histórico de templates tem a dizer sobre um cliente.
 *
 * Nunca lança: cada bloco falha em silêncio para o seu próprio vazio, com a
 * ressalva registrada. Um relatório parcial é útil; uma exceção no meio de uma
 * tela de leitura, não.
 */
export async function minerarHistorico(
  projectId: number,
  opcoes: { desde?: Date } = {},
): Promise<MineracaoDoHistorico> {
  const desde = opcoes.desde ?? new Date(Date.now() - JANELA_PADRAO_DIAS * 24 * 3600_000)
  const ressalvas: string[] = []

  const [usos, posts, ajustesBrutos, fotosBrutas, generationsNoPeriodo] = await Promise.all([
    lerUsosDeModelo({ projectId, desde }).catch((e) => {
      console.warn('[mineracao] usos de modelo indisponíveis:', e)
      ressalvas.push('Não consegui ler o histórico de uso de modelos.')
      return [] as UsoDeModelo[]
    }),
    db.socialPost
      .findMany({
        where: { projectId, createdAt: { gte: desde } },
        select: {
          id: true,
          generationId: true,
          pageId: true,
          status: true,
          scheduledDatetime: true,
          pilar: true,
        },
      })
      .then((linhas) =>
        linhas.map<PostDoPeriodo>((p) => ({
          id: p.id,
          generationId: p.generationId,
          pageId: p.pageId,
          status: p.status,
          quando: p.scheduledDatetime,
          pilar: p.pilar,
        })),
      )
      .catch(() => [] as PostDoPeriodo[]),
    db.$queryRaw<Array<{ ajustes: Record<string, unknown> | null }>>`
      select "fieldValues"->'ajustes' as ajustes
        from "Generation"
       where "projectId" = ${projectId}
         and "createdAt" >= ${desde}
         and "fieldValues" ? 'ajustes'`.catch(() => []),
    db.$queryRaw<Array<{ genId: string; foto: string | null; criadaEm: Date }>>`
      select "id" as "genId",
             "fieldValues"->>'driveImageId' as foto,
             "createdAt" as "criadaEm"
        from "Generation"
       where "projectId" = ${projectId}
         and "createdAt" >= ${desde}
         and "fieldValues"->>'driveImageId' is not null`.catch(() => []),
    db.generation.count({ where: { projectId, createdAt: { gte: desde } } }).catch(() => 0),
  ])

  // ── Ligações: do uso do modelo para o post que nasceu dele ────────────────
  const porGeneration = new Map<string, PostDoPeriodo>()
  const porPagina = new Map<string, PostDoPeriodo>()
  for (const p of posts) {
    if (p.generationId) porGeneration.set(p.generationId, p)
    if (p.pageId) porPagina.set(p.pageId, p)
  }
  const postDoUso = (uso: UsoDeModelo): PostDoPeriodo | undefined =>
    (uso.generationId ? porGeneration.get(uso.generationId) : undefined) ??
    (uso.copiaPageId ? porPagina.get(uso.copiaPageId) : undefined)

  const contagens = contarUsosPorModelo(usos)
  const paginas = await db.page
    .findMany({
      where: { id: { in: [...contagens.keys()] } },
      select: { id: true, name: true, isTemplate: true },
    })
    .catch(() => [] as Array<{ id: string; name: string; isTemplate: boolean }>)
  const nomeDaPagina = new Map(paginas.map((p) => [p.id, p]))

  const modelos: ModeloMinerado[] = []
  for (const [pageId, contagem] of contagens) {
    const daquele = usos.filter((u) => u.modeloPageId === pageId)
    const postsDaquele = daquele.map(postDoUso).filter((p): p is PostDoPeriodo => !!p)
    const virouPost = postsDaquele.filter((p) => p.status === 'POSTED' || p.status === 'SCHEDULED').length

    modelos.push({
      pageId,
      nome: nomeDaPagina.get(pageId)?.name ?? null,
      ehModelo: nomeDaPagina.get(pageId)?.isTemplate ?? false,
      usos: contagem.total,
      ultimoUso: contagem.ultimoUso,
      porDia: maisComum(postsDaquele, (p) =>
        p.quando ? DIAS_SEMANA_CADENCIA[emBRT(p.quando).dia] : null,
      ).map(({ chave, total }) => ({ dia: chave, total })),
      porPilar: maisComum(postsDaquele, (p) => pilarReal(p.pilar)).map(({ chave, total }) => ({
        pilar: chave,
        total,
      })),
      virouPost,
      // Taxa sobre 2 usos não é taxa. Melhor devolver `null` e deixar quem lê
      // ver a contagem crua do que estampar "50% de aprovação".
      taxaDeAprovacao:
        contagem.total >= AMOSTRA_MINIMA ? Math.round((virouPost / contagem.total) * 100) / 100 : null,
    })
  }
  modelos.sort((a, b) => b.usos - a.usos)

  // ── Preferência por pilar e por dia ───────────────────────────────────────
  const melhorPor = (
    extrair: (m: ModeloMinerado) => Array<{ chave: string; total: number }>,
  ): Map<string, { pageId: string; nome: string | null; usos: number }> => {
    const out = new Map<string, { pageId: string; nome: string | null; usos: number }>()
    for (const m of modelos) {
      for (const { chave, total } of extrair(m)) {
        const atual = out.get(chave)
        if (!atual || total > atual.usos) out.set(chave, { pageId: m.pageId, nome: m.nome, usos: total })
      }
    }
    return out
  }

  const modeloPorPilar = [...melhorPor((m) => m.porPilar.map((x) => ({ chave: x.pilar, total: x.total }))).entries()]
    .map(([pilar, v]) => ({ pilar, ...v }))
    .sort((a, b) => b.usos - a.usos)
  const modeloPorDia = [...melhorPor((m) => m.porDia.map((x) => ({ chave: x.dia, total: x.total }))).entries()]
    .map(([dia, v]) => ({ dia, ...v }))
    .sort((a, b) => b.usos - a.usos)

  // ── Fotos por pilar ───────────────────────────────────────────────────────
  const fotosPorId = new Map<string, { usos: number; ultimoUso: Date | null; pilares: string[] }>()
  for (const linha of fotosBrutas) {
    if (!linha.foto) continue
    const post = porGeneration.get(linha.genId)
    const atual = fotosPorId.get(linha.foto) ?? { usos: 0, ultimoUso: null, pilares: [] }
    atual.usos += 1
    if (!atual.ultimoUso || linha.criadaEm > atual.ultimoUso) atual.ultimoUso = linha.criadaEm
    const pilar = pilarReal(post?.pilar)
    if (pilar) atual.pilares.push(pilar)
    fotosPorId.set(linha.foto, atual)
  }
  const fotos: FotoMinerada[] = [...fotosPorId.entries()]
    .map(([driveImageId, v]) => ({
      driveImageId,
      usos: v.usos,
      ultimoUso: v.ultimoUso,
      pilares: maisComum(v.pilares, (p) => p).map(({ chave, total }) => ({ pilar: chave, total })),
    }))
    .sort((a, b) => b.usos - a.usos)
    .slice(0, 40)

  // ── Onde a IA mais erra: os campos que alguém mandou ajustar ─────────────
  const porCampo = new Map<string, { ocorrencias: number; exemplos: string[] }>()
  for (const linha of ajustesBrutos) {
    const ajustes = linha.ajustes
    if (!ajustes || typeof ajustes !== 'object') continue
    for (const [campo, valor] of Object.entries(ajustes)) {
      const atual = porCampo.get(campo) ?? { ocorrencias: 0, exemplos: [] }
      atual.ocorrencias += 1
      if (typeof valor === 'string' && atual.exemplos.length < 3) {
        atual.exemplos.push(valor.replace(/\s+/g, ' ').slice(0, 80))
      }
      porCampo.set(campo, atual)
    }
  }
  const ajustes: AjusteMinerado[] = [...porCampo.entries()]
    .map(([campo, v]) => ({ campo, ...v }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)

  // ── Cobertura: o que estes números NÃO sustentam ─────────────────────────
  const postsComPilar = posts.filter((p) => pilarReal(p.pilar)).length
  if (usos.length < AMOSTRA_MINIMA) {
    ressalvas.push(
      `Só ${usos.length} uso(s) de modelo registrado(s) no período — a preferência de modelo deste cliente ainda não é mensurável. A contagem por página passou a ser gravada em 11/08/2026 (F1); antes disso, ausência de registro é ausência de telemetria, não de uso.`,
    )
  }
  if (postsComPilar === 0 && posts.length > 0) {
    ressalvas.push(
      'Nenhum post do período está classificado em um pilar — sem isso não dá para dizer "modelo preferido por tema". Aprove os pilares na aba Marca e classifique o histórico.',
    )
  }
  if (ajustesBrutos.length === 0) {
    ressalvas.push('Nenhum ajuste de arte registrado no período — "onde a IA erra" ainda não tem amostra neste cliente.')
  }

  return {
    modelos,
    modeloPorPilar,
    modeloPorDia,
    fotos,
    ajustes,
    cobertura: {
      generationsNoPeriodo,
      usosDeModelo: usos.length,
      postsNoPeriodo: posts.length,
      postsComPilar,
      ajustesRegistrados: ajustesBrutos.length,
      fotosRegistradas: fotosBrutas.length,
      ressalvas,
    },
  }
}
