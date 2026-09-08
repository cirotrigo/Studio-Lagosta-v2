/**
 * Embeddings das fotos do acervo — a busca que ENXERGA a foto (F2, 07/09/2026).
 *
 * O catálogo descreve cada foto em ~150 caracteres, e a busca lexical (F1) só
 * acha o que essa frase disse. "Salão cheio", "fachada à noite", "mesa posta
 * vista de cima" são perguntas sobre a IMAGEM. Aqui cada foto ganha dois
 * vetores no MESMO modelo (`gemini-embedding-2`, multimodal, 1.536 dims via
 * MRL): o da imagem e o da descrição+tags. A consulta (o tema, em português)
 * ganha o vetor dela e a distância por coseno diz o que é parecido.
 *
 * Decidido pelo Ciro em 07/09/2026: Gemini Embedding 2 com a chave PAGA
 * (`GOOGLE_GENERATIVE_AI_API_KEY`) — a mesma que já descreve as fotos. No
 * free tier as fotos dos clientes alimentam o modelo do Google.
 *
 * Medido antes de escrever (2 fotos da Real, 2 textos, 1.536 dims): 4
 * embeddings em 1,2s, norma 1,0, e o par certo vence o errado nos dois
 * sentidos (crepe·"crepe" 0,397 × crepe·"vitrine" 0,366; vitrine·"vitrine"
 * 0,418 × vitrine·"crepe" 0,316). A margem é estreita — por isso a
 * similaridade entra NORMALIZADA por posição no ranking (`normalizarPorRank`),
 * nunca como coseno cru.
 *
 * Regras:
 * - **Nada aqui derruba a busca.** Chave ausente, API fora do ar, tabela
 *   vazia: `buscarSemelhantes` devolve Map vazio e a busca segue só com a F1.
 * - Os vetores moram em `PhotoEmbedding` (pgvector no Neon), lidos e escritos
 *   por SQL cru — o Prisma não modela `vector`.
 * - `VERSAO` entra em toda linha: mudou o modelo ou a dimensão, as linhas
 *   antigas saem do alcance da consulta e o indexador as refaz.
 */

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export const MODELO_DE_EMBEDDING = 'gemini-embedding-2'
export const DIMENSOES = 1536
/** `modelo/dims/safra` — sobe a safra quando o texto embedado muda de forma. */
export const VERSAO_DO_EMBEDDING = `${MODELO_DE_EMBEDDING}/${DIMENSOES}/v1`

/** A API aceita até 6 imagens por chamada. */
const IMAGENS_POR_CHAMADA = 6
const TEXTOS_POR_CHAMADA = 20
/**
 * 🔴 Sem timeout, uma chamada parada prende a fila PARA SEMPRE — e a fila
 * é sequencial (08/09/2026: o reembed da Real parou em 2.765 de 3.054 e
 * ficou 50 minutos a 0% de CPU, sem conexão aberta). O SDK aceita
 * `httpOptions.timeout`; o `comTeto` é o cinto para o caso de o SDK não
 * honrar.
 */
const TIMEOUT_DA_CHAMADA_MS = 60_000

function comTeto<T>(promessa: Promise<T>, ms: number, rotulo: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const estouro = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${rotulo}: passou de ${ms / 1000}s`)), ms)
  })
  return Promise.race([promessa, estouro]).finally(() => clearTimeout(timer)) as Promise<T>
}

export function embeddingsConfigurados(): boolean {
  return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
}

let cliente: import('@google/genai').GoogleGenAI | null = null
async function genai() {
  if (cliente) return cliente
  const chave = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!chave) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY ausente')
  const { GoogleGenAI } = await import('@google/genai')
  cliente = new GoogleGenAI({ apiKey: chave })
  return cliente
}

type Conteudo = { parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> }

async function embedar(contents: Conteudo[]): Promise<number[][]> {
  if (contents.length === 0) return []
  const ai = await genai()
  // Backoff SÓ para 429/503 (mesma regra do cron de reconciliação): erro de
  // conteúdo ou de credencial não melhora esperando.
  let resposta: Awaited<ReturnType<typeof ai.models.embedContent>> | undefined
  for (let tentativa = 0; ; tentativa++) {
    try {
      resposta = await comTeto(
        ai.models.embedContent({
          model: MODELO_DE_EMBEDDING,
          contents,
          config: { outputDimensionality: DIMENSOES, httpOptions: { timeout: TIMEOUT_DA_CHAMADA_MS } },
        }),
        TIMEOUT_DA_CHAMADA_MS + 5_000,
        'embedContent',
      )
      break
    } catch (erro) {
      const msg = String((erro as Error)?.message ?? erro)
      const limitado = /\b(429|503)\b|rate limit|quota|overloaded|unavailable|RESOURCE_EXHAUSTED|passou de \d+s|timeout|ETIMEDOUT|ECONNRESET/i.test(msg)
      if (!limitado || tentativa >= 4) throw erro
      await new Promise((r) => setTimeout(r, 1500 * 2 ** tentativa + Math.floor(Math.random() * 500)))
    }
  }
  const vetores = (resposta?.embeddings ?? []).map((e) => e.values ?? [])
  if (vetores.length !== contents.length || vetores.some((v) => v.length !== DIMENSOES)) {
    throw new Error(
      `embedContent devolveu ${vetores.length} vetor(es) para ${contents.length} conteúdo(s) (dims ${vetores[0]?.length ?? 0})`,
    )
  }
  return vetores
}

async function emLotes<T>(itens: T[], tamanho: number, fn: (lote: T[]) => Promise<number[][]>): Promise<number[][]> {
  const saida: number[][] = []
  for (let i = 0; i < itens.length; i += tamanho) saida.push(...(await fn(itens.slice(i, i + tamanho))))
  return saida
}

/** Vetores de textos em português (consulta ou descrição do catálogo). */
export async function embedarTextos(textos: string[]): Promise<number[][]> {
  return emLotes(textos, TEXTOS_POR_CHAMADA, (lote) => embedar(lote.map((text) => ({ parts: [{ text }] }))))
}

export interface ImagemParaEmbedar {
  mimeType: 'image/jpeg' | 'image/png'
  base64: string
}

/** Vetores de imagens (miniaturas `=s400` bastam — é o que a visão já lê). */
export async function embedarImagens(imagens: ImagemParaEmbedar[]): Promise<number[][]> {
  return emLotes(imagens, IMAGENS_POR_CHAMADA, (lote) =>
    embedar(lote.map((i) => ({ parts: [{ inlineData: { mimeType: i.mimeType, data: i.base64 } }] }))),
  )
}

/**
 * O texto que representa a foto no espaço semântico: descrição, tags, temas
 * de uso, prato e pasta — tudo o que o catálogo sabe, numa frase só. Mudou a
 * forma, sobe a safra em `VERSAO_DO_EMBEDDING`.
 */
export function textoDaFotoParaEmbedding(entrada: {
  description?: string | null
  tags?: string[] | null
  bestFor?: string[] | null
  menuItem?: string | null
  folder?: string | null
  assunto?: string | null
  elementos?: string[] | null
  lotacao?: string | null
  momento?: string | null
  enquadramento?: string | null
}): string {
  const partes: string[] = []
  if (entrada.assunto?.trim()) partes.push(`Assunto: ${entrada.assunto.trim()}.`)
  if (entrada.description?.trim()) partes.push(entrada.description.trim())
  if (entrada.menuItem?.trim()) partes.push(`Prato: ${entrada.menuItem.trim()}.`)
  if (entrada.elementos?.length) partes.push(`No quadro: ${entrada.elementos.join(', ')}.`)
  const forma = [entrada.enquadramento, entrada.momento, entrada.lotacao ? `salão ${entrada.lotacao}` : null].filter(Boolean)
  if (forma.length) partes.push(`Forma: ${forma.join(', ')}.`)
  if (entrada.tags?.length) partes.push(`Tags: ${entrada.tags.join(', ')}.`)
  if (entrada.bestFor?.length) partes.push(`Serve para: ${entrada.bestFor.join(', ')}.`)
  if (entrada.folder?.trim()) partes.push(`Pasta: ${entrada.folder.trim()}.`)
  return partes.join(' ')
}

function vetorSql(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`
}

export interface LinhaDeEmbedding {
  driveFileId: string
  md5?: string | null
  vetorImagem?: number[] | null
  vetorTexto?: number[] | null
  texto?: string | null
}

/** Upsert por (projeto, foto). Lança — o indexador decide o que fazer com a falha. */
export async function gravarEmbeddingsDeFoto(projectId: number, linhas: LinhaDeEmbedding[]): Promise<number> {
  let gravadas = 0
  for (const l of linhas) {
    if (!l.vetorImagem && !l.vetorTexto) continue
    await db.$executeRaw`
      INSERT INTO "PhotoEmbedding" ("id", "projectId", "driveFileId", "md5", "versao", "vetorImagem", "vetorTexto", "texto", "geradoEm")
      VALUES (
        ${`pe_${projectId}_${l.driveFileId}`}, ${projectId}, ${l.driveFileId}, ${l.md5 ?? null}, ${VERSAO_DO_EMBEDDING},
        ${l.vetorImagem ? vetorSql(l.vetorImagem) : null}::vector,
        ${l.vetorTexto ? vetorSql(l.vetorTexto) : null}::vector,
        ${l.texto ?? null}, NOW()
      )
      ON CONFLICT ("projectId", "driveFileId") DO UPDATE SET
        "md5" = EXCLUDED."md5",
        "versao" = EXCLUDED."versao",
        "vetorImagem" = COALESCE(EXCLUDED."vetorImagem", "PhotoEmbedding"."vetorImagem"),
        "vetorTexto" = COALESCE(EXCLUDED."vetorTexto", "PhotoEmbedding"."vetorTexto"),
        "texto" = COALESCE(EXCLUDED."texto", "PhotoEmbedding"."texto"),
        "geradoEm" = NOW()
    `
    gravadas++
  }
  return gravadas
}

/** As fotos já indexadas NA VERSÃO ATUAL, com o md5 de quando foram. */
export async function fotosIndexadas(
  projectId: number,
): Promise<Map<string, { md5: string | null; temImagem: boolean; temTexto: boolean; texto: string | null }>> {
  const linhas = await db.$queryRaw<
    Array<{ driveFileId: string; md5: string | null; temImagem: boolean; temTexto: boolean; texto: string | null }>
  >`
    SELECT "driveFileId", "md5", ("vetorImagem" IS NOT NULL) AS "temImagem", ("vetorTexto" IS NOT NULL) AS "temTexto", "texto"
    FROM "PhotoEmbedding" WHERE "projectId" = ${projectId} AND "versao" = ${VERSAO_DO_EMBEDDING}
  `
  return new Map(linhas.map((l) => [l.driveFileId, { md5: l.md5, temImagem: l.temImagem, temTexto: l.temTexto, texto: l.texto }]))
}

/**
 * Reembeda SÓ o texto de fotos cuja descrição mudou (reenriquecimento v3):
 * o vetor da imagem fica, o do texto é refeito — sem ida ao Drive, sem
 * chamada de imagem. Lança; quem chama decide.
 */
export async function reembedarTextos(projectId: number, linhas: Array<{ driveFileId: string; texto: string }>): Promise<number> {
  if (linhas.length === 0) return 0
  const vetores = await embedarTextos(linhas.map((l) => (l.texto.trim() ? l.texto : 'foto de restaurante')))
  return gravarEmbeddingsDeFoto(
    projectId,
    linhas.map((l, i) => ({ driveFileId: l.driveFileId, vetorTexto: vetores[i], texto: l.texto })),
  )
}

export async function removerEmbeddingsDeFotos(projectId: number, driveFileIds: string[]): Promise<number> {
  if (driveFileIds.length === 0) return 0
  return db.$executeRaw`DELETE FROM "PhotoEmbedding" WHERE "projectId" = ${projectId} AND "driveFileId" IN (${Prisma.join(driveFileIds)})`
}

export interface Semelhanca {
  /** Coseno cru com o vetor da IMAGEM (null sem vetor). */
  imagem: number | null
  /** Coseno cru com o vetor do TEXTO (null sem vetor). */
  texto: number | null
  /** max(imagem, texto). */
  melhor: number
}

/**
 * As `limite` fotos mais parecidas com a consulta, num SELECT só (as duas
 * distâncias na mesma linha). Só a versão atual conta.
 *
 * ⚠️ Nunca lança: qualquer falha devolve Map vazio e a busca segue com a F1.
 */
export async function buscarSemelhantes(
  projectId: number,
  vetorConsulta: number[],
  limite = 60,
): Promise<Map<string, Semelhanca>> {
  try {
    const v = vetorSql(vetorConsulta)
    const linhas = await db.$queryRaw<Array<{ driveFileId: string; simImagem: number | null; simTexto: number | null }>>`
      SELECT "driveFileId",
             CASE WHEN "vetorImagem" IS NULL THEN NULL ELSE 1 - ("vetorImagem" <=> ${v}::vector) END AS "simImagem",
             CASE WHEN "vetorTexto"  IS NULL THEN NULL ELSE 1 - ("vetorTexto"  <=> ${v}::vector) END AS "simTexto"
      FROM "PhotoEmbedding"
      WHERE "projectId" = ${projectId} AND "versao" = ${VERSAO_DO_EMBEDDING}
      ORDER BY GREATEST(
        COALESCE(1 - ("vetorImagem" <=> ${v}::vector), -1),
        COALESCE(1 - ("vetorTexto"  <=> ${v}::vector), -1)
      ) DESC
      LIMIT ${limite}
    `
    const mapa = new Map<string, Semelhanca>()
    for (const l of linhas) {
      const imagem = l.simImagem === null ? null : Number(l.simImagem)
      const texto = l.simTexto === null ? null : Number(l.simTexto)
      mapa.set(l.driveFileId, { imagem, texto, melhor: Math.max(imagem ?? -1, texto ?? -1) })
    }
    return mapa
  } catch (erro) {
    console.warn('[embeddings-de-foto] não consegui consultar os vetores (seguindo só com o texto):', erro)
    return new Map()
  }
}

/** O vetor de uma consulta em português. Nunca lança: falha devolve null. */
export async function embedarConsulta(tema: string): Promise<number[] | null> {
  if (!embeddingsConfigurados() || !tema.trim()) return null
  try {
    const [v] = await embedarTextos([tema.trim()])
    return v ?? null
  } catch (erro) {
    console.warn('[embeddings-de-foto] não consegui embedar a consulta (seguindo só com o texto):', erro)
    return null
  }
}

/**
 * Similaridade 0..1 por POSIÇÃO no ranking vetorial, não por coseno cru.
 *
 * O coseno do gemini-embedding-2 entre texto e imagem vive numa faixa
 * estreita (0,30–0,45 medido) e varia por consulta; o que interessa ao
 * ranking é "quão no topo dos parecidos esta foto está". São DOIS rankings
 * — o do vetor da IMAGEM e o do vetor do TEXTO — e cada foto recebe as duas
 * posições normalizadas ponderadas por `FRACAO_DA_IMAGEM` (ausente num deles
 * = 0 naquele). Medido no juiz de visão da Real (07/09/2026): a imagem é a
 * via que acerta os temas em linguagem natural ("criança tomando sorvete":
 * imagem 4/5, texto 5/5, lexical 0/5; "gelato de pistache na casquinha":
 * imagem 4/5, lexical 1/5), e 0,9 foi o melhor da varredura — ver o
 * comentário de `SIMILARIDADE` em `ranquear-acervo.ts`.
 */
export const FRACAO_DA_IMAGEM = 0.9
export function normalizarPorRank(semelhantes: Map<string, Semelhanca>): Map<string, number> {
  const porImagem = [...semelhantes.entries()].filter(([, s]) => s.imagem !== null).sort((a, b) => b[1].imagem! - a[1].imagem!)
  const porTexto = [...semelhantes.entries()].filter(([, s]) => s.texto !== null).sort((a, b) => b[1].texto! - a[1].texto!)
  const posicao = (lista: Array<[string, Semelhanca]>) => {
    const m = new Map<string, number>()
    const n = lista.length
    lista.forEach(([id], i) => m.set(id, n <= 1 ? 1 : 1 - i / (n - 1)))
    return m
  }
  const pImg = posicao(porImagem)
  const pTxt = posicao(porTexto)
  const saida = new Map<string, number>()
  for (const id of semelhantes.keys()) {
    const v = FRACAO_DA_IMAGEM * (pImg.get(id) ?? 0) + (1 - FRACAO_DA_IMAGEM) * (pTxt.get(id) ?? 0)
    if (v > 0) saida.set(id, Math.max(0, Math.min(1, v)))
  }
  return saida
}
