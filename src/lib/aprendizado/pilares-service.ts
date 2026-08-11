/**
 * A taxonomia de pilares no banco: ler, propor, aprovar, classificar.
 *
 * Serviço puro de dados + orquestração. Rota HTTP e tool de MCP embrulham
 * ISTO — nunca reimplementam (regra da casa).
 *
 * Duas travas de segurança que valem a leitura:
 *
 * 1. **A proposta NUNCA toca pilar aprovado.** Repropor com a taxonomia já em
 *    uso não pode apagar nem renomear o que já classificou centenas de posts:
 *    `slug` é chave de junção. A proposta só ACRESCENTA o que ainda não existe.
 * 2. **`taxonomiaAprovada` é a única fonte do classificador.** Enquanto ninguém
 *    aprovar, ela devolve vazio e a classificação não roda — em vez de rodar
 *    contra uma lista que o olho humano nunca viu.
 */

import { db } from '@/lib/db'
import {
  MIN_PILARES,
  validarTaxonomia,
  type Pilar,
} from './pilares'
import { proporPilaresDeTextos, type PropostaDePilares } from './proposta-de-pilares'
import { textoDoPost } from './textos-do-post'
import {
  classificarLote,
  TAMANHO_DO_LOTE,
  VERSAO_DO_CLASSIFICADOR,
  type PostParaClassificar,
} from './classificador'
import { restantesDaPassada } from './rodada-de-pilares'
import { haTempo } from '@/lib/creatives/reconciliacao'

/** Janela padrão do histórico lido para propor e classificar. */
const JANELA_PADRAO_DIAS = 180

/**
 * Sentinela do `notIn` quando NADA sobrevive: sem ele o filtro viraria
 * `notIn: []`, que não exclui ninguém — e o `deleteMany` apagaria a lista
 * inteira. Slug é sempre kebab-case (`slugDePilar`), então este valor nunca
 * colide com um pilar real.
 *
 * 🔴 Aqui havia um byte NUL **cru** dentro da string. Funcionava, e por isso
 * sobreviveu: o custo não era de runtime. Ele fazia o git tratar o arquivo como
 * BINÁRIO (`Bin 0 -> 10297 bytes` no diff da F2 — ou seja, o arquivo não podia
 * ser revisado em PR) e o `grep -r` pulá-lo inteiro, em silêncio. Fonte que sai
 * da busca do repo é fonte que ninguém acha: foi assim que a substituição total
 * de `salvarPilares` ficou meses sem estar documentada em lugar nenhum.
 */
const SLUG_IMPOSSIVEL = '__nenhum__'

function paraPilar(linha: {
  slug: string
  nome: string
  descricao: string | null
  exemplos: string[]
  ordem: number
  aprovado: boolean
  origem: string | null
}): Pilar {
  return {
    slug: linha.slug,
    nome: linha.nome,
    descricao: linha.descricao,
    exemplos: linha.exemplos ?? [],
    ordem: linha.ordem,
    aprovado: linha.aprovado,
    origem: linha.origem === 'humano' || linha.origem === 'llm' ? linha.origem : null,
  }
}

/** Tudo que existe (aprovado e proposto), na ordem de exibição. */
export async function lerPilares(projectId: number): Promise<Pilar[]> {
  const linhas = await db.contentPillar.findMany({
    where: { projectId },
    orderBy: [{ aprovado: 'desc' }, { ordem: 'asc' }, { createdAt: 'asc' }],
    select: {
      slug: true,
      nome: true,
      descricao: true,
      exemplos: true,
      ordem: true,
      aprovado: true,
      origem: true,
    },
  })
  return linhas.map(paraPilar)
}

/**
 * A taxonomia que vale — só o que foi aprovado por gente.
 *
 * É a que o classificador recebe e a que a destilação usa. Lista vazia
 * significa "este cliente ainda não tem taxonomia", e todo consumidor trata
 * isso como ausência de dado, nunca como erro.
 */
export async function taxonomiaAprovada(projectId: number): Promise<Pilar[]> {
  const linhas = await db.contentPillar.findMany({
    where: { projectId, aprovado: true },
    orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
    select: {
      slug: true,
      nome: true,
      descricao: true,
      exemplos: true,
      ordem: true,
      aprovado: true,
      origem: true,
    },
  })
  return linhas.map(paraPilar)
}

export interface ResultadoDaGravacao {
  pilares: Pilar[]
  avisos: string[]
}

/**
 * Grava a lista que o olho humano aprovou.
 *
 * Upsert por (projeto, slug) — não apaga e recria — para que o id sobreviva e,
 * com ele, a leitura de quem já apontava para o pilar. Pilar que sumiu da lista
 * é REMOVIDO da taxonomia, mas os posts classificados nele continuam com o slug
 * gravado: é registro do que aconteceu, não configuração (mesmo contrato de
 * `campaignId` e `sourceGenerationId`).
 */
export async function salvarPilares(
  projectId: number,
  entrada: unknown,
  opcoes: { aprovar?: boolean; aprovadoPor?: string | null } = {},
): Promise<ResultadoDaGravacao> {
  const { pilares, avisos } = validarTaxonomia(entrada)
  const aprovar = opcoes.aprovar !== false
  const agora = new Date()

  for (const [i, p] of pilares.entries()) {
    const dados = {
      nome: p.nome,
      descricao: p.descricao ?? null,
      exemplos: p.exemplos ?? [],
      ordem: i,
      aprovado: aprovar,
      aprovadoEm: aprovar ? agora : null,
      aprovadoPor: aprovar ? (opcoes.aprovadoPor ?? null) : null,
      origem: p.origem ?? 'humano',
    }
    await db.contentPillar.upsert({
      where: { projectId_slug: { projectId, slug: p.slug } },
      create: { projectId, slug: p.slug, ...dados },
      update: dados,
    })
  }

  const sobreviventes = pilares.map((p) => p.slug)
  await db.contentPillar.deleteMany({
    where: { projectId, slug: { notIn: sobreviventes.length > 0 ? sobreviventes : [SLUG_IMPOSSIVEL] } },
  })

  if (aprovar && pilares.length > 0 && pilares.length < MIN_PILARES) {
    avisos.push(
      `A lista ficou com ${pilares.length} pilar(es). Abaixo de ${MIN_PILARES} a classificação separa pouco — quase tudo cai em "outro".`,
    )
  }

  return { pilares: await lerPilares(projectId), avisos }
}

interface PostComTexto {
  id: string
  texto: string
  quando: Date | null
}

/**
 * O recorte do histórico que a classificação enxerga — em UM lugar só.
 *
 * A contagem de pendentes e a leitura dos posts precisam do MESMO filtro: é a
 * comparação entre as duas que produz o "faltam M" mostrado na tela, e dois
 * `where` parecidos escritos em lugares diferentes divergem no primeiro ajuste.
 *
 * `pendentesDaVersao` empurra a idempotência para o BANCO. Antes ela era um
 * `Set` de ids carregado inteiro e aplicado depois do `take`, o que fazia o
 * `limite` mentir: pedir 100 trazia os 100 posts mais recentes, quase todos já
 * classificados, e a passada seguinte não avançava um milímetro. Com o filtro no
 * `where`, `take` e limite falam da mesma coisa — o que ainda falta.
 */
function filtroDoHistorico(projectId: number, desde: Date, pendentesDaVersao?: string | null) {
  return {
    projectId,
    status: 'POSTED' as const,
    scheduledDatetime: { gte: desde },
    ...(pendentesDaVersao
      ? { OR: [{ pilarVersao: null }, { pilarVersao: { not: pendentesDaVersao } }] }
      : {}),
  }
}

/**
 * Os posts publicados do cliente com o texto que houver.
 *
 * Traz TODOS (inclusive os sem texto), porque quem classifica precisa marcar
 * `sem-texto` neles — é o que distingue "não medi" de "não se encaixa".
 */
async function historicoComTexto(
  projectId: number,
  opcoes: {
    desde?: Date
    limite?: number
    apenasComTexto?: boolean
    /** Só o que ainda NÃO foi classificado nesta versão do classificador. */
    pendentesDaVersao?: string | null
  } = {},
): Promise<PostComTexto[]> {
  const desde = opcoes.desde ?? new Date(Date.now() - JANELA_PADRAO_DIAS * 24 * 3600_000)
  const posts = await db.socialPost.findMany({
    where: filtroDoHistorico(projectId, desde, opcoes.pendentesDaVersao),
    orderBy: { scheduledDatetime: 'desc' },
    take: opcoes.limite ?? 1500,
    select: {
      id: true,
      caption: true,
      slotValues: true,
      reminderExtraInfo: true,
      scheduledDatetime: true,
      Generation: { select: { fieldValues: true } },
    },
  })

  const saida = posts.map((p) => {
    const { texto } = textoDoPost({
      caption: p.caption,
      slotValues: p.slotValues,
      reminderExtraInfo: p.reminderExtraInfo,
      fieldValues: p.Generation?.fieldValues ?? null,
    })
    return { id: p.id, texto, quando: p.scheduledDatetime }
  })

  return opcoes.apenasComTexto ? saida.filter((p) => p.texto.length > 0) : saida
}

/**
 * Propõe a taxonomia a partir do histórico e grava as novidades como NÃO
 * aprovadas — a proposta sobrevive a um refresh da tela sem nunca virar
 * taxonomia em uso.
 */
export async function proporPilares(
  projectId: number,
  opcoes: { desde?: Date } = {},
): Promise<PropostaDePilares & { jaExistiam: string[] }> {
  const projeto = await db.project.findUnique({ where: { id: projectId }, select: { name: true } })
  const textos = (await historicoComTexto(projectId, { ...opcoes, apenasComTexto: true })).map((p) => p.texto)

  const proposta = await proporPilaresDeTextos(projeto?.name ?? 'a marca', textos)
  const existentes = await lerPilares(projectId)
  const jaTem = new Set(existentes.map((p) => p.slug))

  const novos = proposta.pilares.filter((p) => !jaTem.has(p.slug))
  const jaExistiam = proposta.pilares.filter((p) => jaTem.has(p.slug)).map((p) => p.slug)

  const base = existentes.length
  for (const [i, p] of novos.entries()) {
    await db.contentPillar.create({
      data: {
        projectId,
        slug: p.slug,
        nome: p.nome,
        descricao: p.descricao ?? null,
        exemplos: p.exemplos ?? [],
        ordem: base + i,
        aprovado: false,
        origem: 'llm',
      },
    })
  }

  return { ...proposta, pilares: await lerPilares(projectId), jaExistiam }
}

export interface ResultadoDaClassificacaoDoHistorico {
  /** Posts que entraram nos lotes que realmente rodaram nesta passada. */
  analisados: number
  classificados: number
  semTexto: number
  porPilar: Array<{ pilar: string; total: number }>
  naoClassificados: number
  /** Quantos estavam esperando classificação quando a passada começou. */
  pendentes: number
  /** Quantos continuam esperando — o teto ou o relógio cortaram o resto. */
  restantes: number
  avisos: string[]
}

/**
 * Classifica o histórico publicado do cliente na taxonomia aprovada.
 *
 * Idempotente por padrão: só toca o que ainda não foi classificado nesta
 * versão do classificador. `reclassificar: true` refaz tudo — é o que se usa
 * depois de mudar a lista de pilares.
 *
 * DUAS TRAVAS DE TAMANHO, e as duas devolvem `restantes` em vez de estourar:
 *
 * - `limite` corta quantos posts entram nesta passada (o teto do cron por
 *   projeto, e o padrão do botão da aba Marca);
 * - `prazoEm` é o instante em que a passada para de PEGAR lote novo. O lote em
 *   voo termina — ele é uma chamada paga de modelo, e descartá-la no meio seria
 *   pagar por nada.
 *
 * Nunca lança. Lote que falha vira aviso e os outros seguem.
 */
export async function classificarHistorico(
  projectId: number,
  opcoes: { desde?: Date; reclassificar?: boolean; limite?: number; prazoEm?: number } = {},
): Promise<ResultadoDaClassificacaoDoHistorico> {
  const vazio = { analisados: 0, classificados: 0, semTexto: 0, porPilar: [], naoClassificados: 0 }
  const taxonomia = await taxonomiaAprovada(projectId)
  if (taxonomia.length === 0) {
    return {
      ...vazio,
      pendentes: 0,
      restantes: 0,
      avisos: ['Este cliente ainda não tem pilares aprovados — aprove a lista na aba Marca antes de classificar.'],
    }
  }

  const desde = opcoes.desde ?? new Date(Date.now() - JANELA_PADRAO_DIAS * 24 * 3600_000)
  const prazoEm = opcoes.prazoEm ?? Number.POSITIVE_INFINITY
  const pendentesDaVersao = opcoes.reclassificar ? null : VERSAO_DO_CLASSIFICADOR

  const pendentes = await db.socialPost.count({
    where: filtroDoHistorico(projectId, desde, pendentesDaVersao),
  })
  const historico = await historicoComTexto(projectId, {
    desde,
    limite: opcoes.limite,
    pendentesDaVersao,
  })

  const avisos: string[] = []
  let analisados = 0
  let classificados = 0
  let semTexto = 0
  let naoClassificados = 0
  const porPilar = new Map<string, number>()

  for (let i = 0; i < historico.length; i += TAMANHO_DO_LOTE) {
    if (!haTempo(prazoEm)) {
      // `unshift`: os avisos são cortados em 20 e este explica por que a
      // passada terminou. Ele não pode ser o primeiro a cair.
      avisos.unshift('O tempo desta passada acabou — o que ficou continua pendente para a próxima.')
      break
    }
    const lote: PostParaClassificar[] = historico.slice(i, i + TAMANHO_DO_LOTE).map((p) => ({ id: p.id, texto: p.texto }))
    analisados += lote.length
    const r = await classificarLote(taxonomia, lote)
    avisos.push(...r.avisos)
    naoClassificados += r.naoClassificados.length

    for (const c of r.classificacoes) {
      try {
        await db.socialPost.update({
          where: { id: c.postId },
          data: {
            pilar: c.pilar,
            pilarConfianca: c.confianca,
            pilarVersao: c.versao,
            pilarClassificadoEm: new Date(),
          },
        })
        classificados += 1
        if (c.pilar === 'sem-texto') semTexto += 1
        porPilar.set(c.pilar, (porPilar.get(c.pilar) ?? 0) + 1)
      } catch (erro) {
        console.warn('[pilares] não consegui gravar a classificação do post', c.postId, erro)
      }
    }
  }

  return {
    analisados,
    classificados,
    semTexto,
    porPilar: [...porPilar.entries()]
      .map(([pilar, total]) => ({ pilar, total }))
      .sort((a, b) => b.total - a.total),
    naoClassificados,
    pendentes,
    // Contra os CLASSIFICADOS, não contra os analisados: post cujo lote falhou
    // (modelo fora do ar, eco que não casou) continua sem `pilarVersao` e será
    // tentado de novo — dizer que ele acabou é o tipo de teto que mente.
    restantes: restantesDaPassada(pendentes, classificados),
    avisos: avisos.slice(0, 20),
  }
}
