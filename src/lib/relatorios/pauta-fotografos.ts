/**
 * A pauta de fotografia semanal — coleta, PDF e envio no grupo do WhatsApp.
 *
 * Toda SEGUNDA 09:00 BRT (12:00 UTC) o cron `/api/cron/pauta-fotografos` chama
 * `enviarPautaDeFotografia`: mede o acervo de cada cliente contra os assuntos
 * aprovados da marca (pilar × catálogo, pilar × destacadas) e contra as buscas
 * de foto que morreram, monta um PDF e o manda como DOCUMENTO no grupo — com a
 * pauta completa em texto como fallback quando o PDF ou o upload falham
 * (degradação honesta, nunca silêncio).
 *
 * As decisões (limiar de "magro", ordem das prioridades, textos) moram no
 * contrato puro `pauta-fotografos-contrato.ts`, testável sem banco.
 *
 * 🔴 NUNCA chame `buscarNoAcervo` aqui — ela registra um LearningSignal por
 * busca. O catálogo entra por `lerCatalogoDoProjeto`, que não registra nada.
 */

import { put } from '@vercel/blob'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { db } from '@/lib/db'
import { lerCatalogoDoProjeto, type ImagemCatalogo } from '@/lib/creatives/acervo'
import { palavrasDoTema, casaComTema, type PilarParaBusca } from '@/lib/creatives/ranquear-acervo'
import { normalizar } from '@/lib/posts/dia-semana'
import { sendWhatsAppDocument, sendWhatsAppText, isEvolutionConfigured } from '@/lib/notifications/evolution'
import {
  legendaDoPdf,
  mensagemCompleta,
  prioridadesDaPauta,
  clientesSemPauta,
  curadoriaPendente,
  situacaoDoPilar,
  MINIMO_DE_FOTOS_POR_PILAR,
  type PautaDeFotografia,
  type ClienteDaPauta,
  type PilarDaPauta,
  type TemaRejeitado,
} from './pauta-fotografos-contrato'

const OFFSET_BRT_MS = 3 * 3_600_000

function hojeBRT(): string {
  return new Date(Date.now() - OFFSET_BRT_MS).toISOString().slice(0, 10)
}

/** Buscas fechadas por tema com NENHUMA aceita — mesma régua do relatório de lacunas. */
function temasRejeitadosDosSinais(
  sinais: Array<{ desfecho: string | null; sugerido: unknown }>,
): TemaRejeitado[] {
  const porTema = new Map<string, { tema: string; aceitas: number; trocadas: number; expiradas: number }>()
  for (const s of sinais) {
    const criterios = (s.sugerido as { criterios?: { theme?: unknown } } | null)?.criterios
    const tema = typeof criterios?.theme === 'string' ? criterios.theme.trim() : ''
    if (!tema) continue
    const chave = normalizar(tema)
    const linha = porTema.get(chave) ?? { tema, aceitas: 0, trocadas: 0, expiradas: 0 }
    if (s.desfecho === 'aceita-como-veio' || s.desfecho === 'sugerido-aceito') linha.aceitas++
    else if (s.desfecho === 'trocada') linha.trocadas++
    else if (s.desfecho === 'expirada') linha.expiradas++
    porTema.set(chave, linha)
  }
  return [...porTema.values()]
    .map((l) => ({ tema: l.tema, fechadas: l.trocadas + l.expiradas + l.aceitas, trocadas: l.trocadas, expiradas: l.expiradas }))
    .filter((l) => l.fechadas >= 2 && l.trocadas + l.expiradas === l.fechadas)
    .sort((a, b) => b.fechadas - a.fechadas)
}

/** Mede um cliente: pilar × catálogo, pilar × destacadas, buscas mortas. */
async function medirCliente(projeto: { id: number; name: string }): Promise<ClienteDaPauta | null> {
  const [pilares, sinais, destacadasLinhas] = await Promise.all([
    db.contentPillar.findMany({
      where: { projectId: projeto.id, aprovado: true },
      select: { slug: true, nome: true, exemplos: true },
      orderBy: { ordem: 'asc' },
    }),
    db.learningSignal.findMany({
      where: { projectId: projeto.id, tipo: 'foto' },
      select: { desfecho: true, sugerido: true },
    }),
    db.photoDestaque.findMany({
      where: { projectId: projeto.id, revogadoEm: null },
      select: { driveFileId: true },
    }),
  ])

  const temasRejeitados = temasRejeitadosDosSinais(sinais)
  // Cliente sem taxonomia e sem busca morta não tem o que entrar na pauta.
  if (pilares.length === 0 && temasRejeitados.length === 0) return null

  let todas: ImagemCatalogo[]
  try {
    todas = (await lerCatalogoDoProjeto(projeto.id)).todas
  } catch {
    return {
      projectId: projeto.id,
      nome: projeto.name,
      totalDoAcervo: 0,
      totalDestacadas: 0,
      pilares: [],
      temasRejeitados,
      semCatalogo: true,
    }
  }

  const destacadas = new Set(destacadasLinhas.map((d) => d.driveFileId))
  const fotosDestacadas = todas.filter((i) => destacadas.has(i.driveFileId))

  const medidos: PilarDaPauta[] = pilares.map((pilar) => {
    const comoBusca: PilarParaBusca = { slug: pilar.slug, nome: pilar.nome, exemplos: pilar.exemplos }
    const palavras = palavrasDoTema(`${pilar.nome} ${pilar.slug}`, [comoBusca])
    const casaveis = todas.filter((img) => casaComTema(img, palavras).casa).length
    const destacadasQueCasam = fotosDestacadas.filter((img) => casaComTema(img, palavras).casa).length
    return {
      nome: pilar.nome,
      casaveis,
      pctDoAcervo: todas.length ? Math.round((casaveis / todas.length) * 1000) / 10 : 0,
      destacadasQueCasam,
    }
  })

  return {
    projectId: projeto.id,
    nome: projeto.name,
    totalDoAcervo: todas.length,
    totalDestacadas: fotosDestacadas.length,
    pilares: medidos,
    temasRejeitados,
  }
}

export async function montarPautaDeFotografia(): Promise<PautaDeFotografia> {
  const projetos = await db.project.findMany({
    where: { OR: [{ googleDriveImagesFolderId: { not: null } }, { googleDriveFolderId: { not: null } }] },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })

  const clientes: ClienteDaPauta[] = []
  for (const p of projetos) {
    const medido = await medirCliente(p)
    if (medido) clientes.push(medido)
  }

  return { geradaEm: hojeBRT(), clientes }
}

// ── PDF ─────────────────────────────────────────────────────────────────────

const A4: [number, number] = [595.28, 841.89]
const MARGEM = 56
const TINTA = rgb(0.15, 0.14, 0.12)
const APAGADO = rgb(0.44, 0.42, 0.38)
const ACENTO = rgb(0.18, 0.36, 0.27)
const CRITICO = rgb(0.62, 0.24, 0.17)
const ALERTA = rgb(0.55, 0.4, 0.12)

interface Cursor {
  doc: PDFDocument
  page: PDFPage
  y: number
  regular: PDFFont
  bold: PDFFont
}

function novaPagina(c: Cursor) {
  c.page = c.doc.addPage(A4)
  c.y = A4[1] - MARGEM
}

function quebrar(texto: string, font: PDFFont, size: number, largura: number): string[] {
  const palavras = texto.split(/\s+/)
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p
    if (font.widthOfTextAtSize(tentativa, size) > largura && atual) {
      linhas.push(atual)
      atual = p
    } else {
      atual = tentativa
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

function escrever(
  c: Cursor,
  texto: string,
  opcoes: { size?: number; bold?: boolean; cor?: ReturnType<typeof rgb>; indent?: number; espacoDepois?: number } = {},
) {
  const size = opcoes.size ?? 10.5
  const font = opcoes.bold ? c.bold : c.regular
  const indent = opcoes.indent ?? 0
  const largura = A4[0] - 2 * MARGEM - indent
  for (const linha of quebrar(texto, font, size, largura)) {
    // Desce ANTES de desenhar: drawText posiciona pela BASELINE, então a
    // própria linha precisa do espaço da sua altura — senão texto grande
    // invade o que veio acima (aconteceu com o título sobre o olho).
    if (c.y - size * 1.15 < MARGEM) novaPagina(c)
    c.y -= size * 1.15
    c.page.drawText(linha, { x: MARGEM + indent, y: c.y, size, font, color: opcoes.cor ?? TINTA })
    c.y -= size * 0.3
  }
  c.y -= opcoes.espacoDepois ?? 0
}

/** O PDF da pauta — texto puro, sem emoji (as fontes padrão do PDF não os têm). */
export async function gerarPdfDaPauta(pauta: PautaDeFotografia): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const c: Cursor = { doc, page: doc.addPage(A4), y: A4[1] - MARGEM, regular, bold }

  const [ano, mes, dia] = pauta.geradaEm.split('-')
  escrever(c, 'LAGOSTA CRIATIVA — ACERVO DOS CLIENTES', { size: 9, cor: ACENTO, bold: true })
  c.y -= 2
  escrever(c, 'Pauta dos Fotógrafos', { size: 26, bold: true, espacoDepois: 2 })
  escrever(c, `Semana de ${dia}/${mes}/${ano} — gerada automaticamente pelo Studio`, { size: 10, cor: APAGADO, espacoDepois: 10 })
  escrever(
    c,
    'Duas medições: quanto do acervo de cada cliente cobre os assuntos aprovados da marca, e as buscas de foto em que nada serviu. "Fotos do assunto" conta presença por descrição/tags/pasta — não qualidade.',
    { size: 9.5, cor: APAGADO, espacoDepois: 14 },
  )

  const prioridades = prioridadesDaPauta(pauta)
  escrever(c, 'PRIORIDADES DA SEMANA', { size: 11, bold: true, cor: ACENTO, espacoDepois: 4 })
  if (prioridades.length === 0) {
    escrever(c, 'Nenhuma lacuna forte nesta rodada.', { cor: APAGADO, espacoDepois: 10 })
  } else {
    prioridades.forEach((p, i) => {
      const marca =
        p.tipo === 'falta-no-acervo' ? 'FALTA NO ACERVO' : p.tipo === 'busca-morta' ? 'AS BUSCAS MORRERAM' : 'COBERTURA MAGRA'
      const cor = p.tipo === 'falta-no-acervo' ? CRITICO : p.tipo === 'busca-morta' ? CRITICO : ALERTA
      escrever(c, `${i + 1}. ${p.cliente} — ${p.assunto}`, { bold: true, espacoDepois: 0 })
      escrever(c, `${marca}: ${p.detalhe}`, { size: 9.5, cor, indent: 16, espacoDepois: 6 })
    })
    c.y -= 8
  }

  escrever(c, 'POR CLIENTE', { size: 11, bold: true, cor: ACENTO, espacoDepois: 6 })
  for (const cliente of pauta.clientes) {
    if (c.y < MARGEM + 90) novaPagina(c)
    escrever(c, cliente.nome, { size: 14, bold: true, espacoDepois: 0 })
    if (cliente.semCatalogo) {
      escrever(c, 'sem catálogo de imagens legível — fora da medição desta semana', { size: 9.5, cor: APAGADO, espacoDepois: 10 })
      continue
    }
    escrever(c, `acervo: ${cliente.totalDoAcervo} fotos — ${cliente.totalDestacadas} destacada(s)`, {
      size: 9,
      cor: APAGADO,
      espacoDepois: 4,
    })

    for (const t of cliente.temasRejeitados) {
      escrever(c, `Buscas morreram: "${t.tema}" — ${t.fechadas} busca(s), nenhuma foto serviu`, {
        size: 10,
        cor: CRITICO,
        indent: 8,
      })
    }
    for (const p of cliente.pilares) {
      const s = situacaoDoPilar(p.casaveis)
      if (s === 'zero') {
        escrever(c, `FALTA NO ACERVO: ${p.nome} — zero fotos do assunto`, { size: 10, cor: CRITICO, indent: 8, bold: true })
      } else if (s === 'magro') {
        escrever(c, `Magro: ${p.nome} — ${p.casaveis} foto(s), abaixo de ${MINIMO_DE_FOTOS_POR_PILAR}`, {
          size: 10,
          cor: ALERTA,
          indent: 8,
        })
      }
    }
    const pendentes = cliente.pilares.filter(curadoriaPendente).map((p) => p.nome)
    if (pendentes.length > 0) {
      escrever(c, `Curadoria pendente (tem foto, falta a estrela): ${pendentes.join(', ')}`, {
        size: 10,
        cor: ACENTO,
        indent: 8,
      })
    }
    const nadaAApontar =
      cliente.temasRejeitados.length === 0 &&
      cliente.pilares.every((p) => situacaoDoPilar(p.casaveis) === 'ok') &&
      pendentes.length === 0
    if (nadaAApontar) {
      escrever(c, 'sem pauta urgente — assuntos cobertos e com destaques', { size: 10, cor: APAGADO, indent: 8 })
    }
    c.y -= 8
  }

  if (c.y < MARGEM + 70) novaPagina(c)
  c.y -= 6
  escrever(c, 'REGRAS DE SEMPRE NAS SESSÕES', { size: 9.5, bold: true, cor: APAGADO, espacoDepois: 2 })
  escrever(
    c,
    'Ocupação moderada e sem rosto em foco. Prato ATUAL do cardápio, nunca o antigo. Nada de preço ou papel escrito na cena. Priorizar verticais: story é 9:16 e o texto precisa de área calma na foto.',
    { size: 9.5, cor: APAGADO },
  )

  return doc.save()
}

// ── Envio ───────────────────────────────────────────────────────────────────

export interface ResultadoDaPauta {
  geradaEm: string
  clientes: number
  prioridades: number
  enviado: boolean
  viaPdf: boolean
  pdfUrl?: string
}

/**
 * Monta, gera o PDF, sobe para o Blob e manda como documento no grupo.
 * PDF ou upload falhando, a pauta sai em TEXTO — nunca em silêncio.
 */
export async function enviarPautaDeFotografia(opcoes?: { teste?: boolean }): Promise<ResultadoDaPauta> {
  const pauta = await montarPautaDeFotografia()
  const prioridades = prioridadesDaPauta(pauta).length
  const base: ResultadoDaPauta = {
    geradaEm: pauta.geradaEm,
    clientes: pauta.clientes.length,
    prioridades,
    enviado: false,
    viaPdf: false,
  }

  if (!isEvolutionConfigured()) {
    console.warn('[pauta-fotografos] Evolution não configurada — pauta montada, nada enviado.')
    return base
  }

  try {
    const bytes = await gerarPdfDaPauta(pauta)
    const blob = await put(`relatorios/pauta-fotografos-${pauta.geradaEm}.pdf`, Buffer.from(bytes), {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: true,
    })
    const enviado = await sendWhatsAppDocument(blob.url, {
      fileName: `pauta-fotografos-${pauta.geradaEm}.pdf`,
      caption: legendaDoPdf(pauta, opcoes),
    })
    if (enviado) return { ...base, enviado: true, viaPdf: true, pdfUrl: blob.url }
    console.warn('[pauta-fotografos] envio do PDF falhou — caindo para texto.')
  } catch (erro) {
    console.error('[pauta-fotografos] PDF/upload falhou — caindo para texto:', erro)
  }

  const enviadoTexto = await sendWhatsAppText(mensagemCompleta(pauta, opcoes))
  return { ...base, enviado: enviadoTexto, viaPdf: false }
}

export { prioridadesDaPauta, clientesSemPauta }
