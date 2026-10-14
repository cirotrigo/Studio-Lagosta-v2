/**
 * Leitura da fixture ANONIMIZADA da peça piloto (13/10/2026) e reconstrução
 * dos arquivos que o renderizador precisa — tudo local, sem banco, Blob,
 * Drive nem rede. A proveniência e a tolerância estão no LEIAME.md da fixture.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

import type { Layer } from '@/types/template'
import type { ContrasteMedido } from '@/lib/compositor/regua'

const PASTA = path.join(__dirname, '..', 'fixtures', 'piloto-2026-10-13')
const ler = <T>(nome: string): T => JSON.parse(fs.readFileSync(path.join(PASTA, nome), 'utf8')) as T

interface Raster {
  largura: number
  altura: number
  /** base64 de bytes de cinza (1 canal). */
  valores: string
}

export interface FotoDaFixture {
  origem: { largura: number; altura: number }
  grade: Raster
  janelas: Array<Raster & { id: string; x: number; y: number; w: number; h: number; escala: number; motivo: string }>
  /** A vitrine: região protegida / narrativamente relevante — não "o assunto principal". */
  regiaoProtegida: {
    descricao: string
    naPeca: { x: number; y: number; width: number; height: number }
    fracoesDaFoto: { x0: number; y0: number; x1: number; y1: number }
  }
}

export interface LogoDaFixture extends Raster {
  papel: string
  original: { largura: number; altura: number }
  tintaMedia: string
  luminanciaDaTinta: number
  alfa: string
  /** base64 dos pixels RGBA no tamanho gravado — a logo é reconstruída fiel, não pela média. */
  rgba: string
}

export interface PecaDaFixture {
  canvas: { width: number; height: number }
  spec: Record<string, unknown> & { preferencias?: Record<string, unknown>; blocos: Array<{ ordem?: number; papel: string; linhas: string[]; grupoVisual?: string }> }
  v1: { layers: Layer[] }
  v2: {
    layers: Layer[]
    revisao: {
      ajustes: Array<Record<string, unknown>>
      aplicados: Array<{ tipo: string; indice: number; camadas: string[]; detalhe: string }>
      recusados: Array<{ indice: number; tipo: string; motivo: string }>
      versaoAntes: string
    }
  }
  composicaoRegistrada: {
    gradientes: Array<{ cor: string; borda: 'topo' | 'rodape'; forca: number; altura: number; necessidade: number }>
    contraste: ContrasteMedido[]
    logo: { canto: string; tinta: number }
    candidatos: Array<Record<string, unknown>>
    posicao: Record<string, unknown>
    medidasFinais: Array<{ id: string; papel: string; width: number; height: number; linhas: number; fontSize: number; fontFamily: string; lineHeight: number }>
    avisos: string[]
  }
}

export interface MarcaDaFixture {
  paresDeLeitura: Array<[string, string]>
  candidatasDoVeuNaBibliotecaAtual: string[]
  logos: { wordmark: LogoDaFixture; monograma: LogoDaFixture }
}

export interface AssinaturaDaFixture {
  pagina: { id: string; name: string; width: number; height: number; tags: string[]; background: string; layers: Layer[] }
  /** `Project.assinatura`: os números estruturados do projeto. */
  numerosDoProjeto: unknown
}

export const fixture = {
  foto: () => ler<FotoDaFixture>('foto.json'),
  peca: () => ler<PecaDaFixture>('peca.json'),
  marca: () => ler<MarcaDaFixture>('marca.json'),
  assinatura: () => ler<AssinaturaDaFixture>('assinatura.json'),
  /** Todos os arquivos da fixture como texto — para a prova de "nenhuma URL". */
  arquivos: () => fs.readdirSync(PASTA).filter((n) => n.endsWith('.json')).map((n) => ({ nome: n, texto: fs.readFileSync(path.join(PASTA, n), 'utf8') })),
}

const bytes = (r: Raster) => Buffer.from(r.valores, 'base64')

/**
 * A foto da peça, reconstruída: a grade de 43×76 ampliada para o tamanho da
 * peça e as janelas de medida coladas por cima, nas mesmas coordenadas.
 */
export async function fotoReconstruida(): Promise<Buffer> {
  const f = fixture.foto()
  const { largura: W, altura: H } = f.origem
  const base = await sharp(bytes(f.grade), { raw: { width: f.grade.largura, height: f.grade.altura, channels: 1 } })
    .resize(W, H, { fit: 'fill' })
    .raw()
    .toBuffer()
  const coladas = await Promise.all(
    f.janelas.map(async (j) => ({
      input: await sharp(bytes(j), { raw: { width: j.largura, height: j.altura, channels: 1 } }).resize(j.w, j.h, { fit: 'fill' }).png().toBuffer(),
      left: j.x,
      top: j.y,
    })),
  )
  return sharp(base, { raw: { width: W, height: H, channels: 1 } }).composite(coladas).png().toBuffer()
}

/** A logo da fixture como PNG, pixel a pixel (RGBA gravado). */
export async function logoReconstruida(logo: LogoDaFixture): Promise<Buffer> {
  return sharp(Buffer.from(logo.rgba, 'base64'), { raw: { width: logo.largura, height: logo.altura, channels: 4 } }).png().toBuffer()
}

/**
 * Fora das janelas a foto é só a grade, que amacia os brilhos (o p98 do
 * serviço caía de 166 para 150): medir ali seria otimista. Toda caixa de texto
 * e de logo medida sobre a fixture tem de caber numa janela — senão é falha de
 * SETUP (estenda as janelas no gerador), nunca um resultado.
 */
export function caixasForaDasJanelas(layers: Layer[]): string[] {
  const janelas = fixture.foto().janelas
  return layers
    .filter((l) => (l.type === 'text' || l.type === 'rich-text' || l.type === 'logo') && l.visible !== false)
    .filter((l) => {
      const { x, y } = l.position
      const { width: w, height: h } = l.size
      return !janelas.some((j) => x >= j.x && y >= j.y && x + w <= j.x + j.w && y + h <= j.y + j.h)
    })
    .map((l) => l.id)
}

export function exigirMedidaFiel(layers: Layer[]): void {
  const fora = caixasForaDasJanelas(layers)
  if (fora.length > 0) throw new Error(`Medida fora das janelas fiéis da fixture (${fora.join(', ')}): estenda as janelas no gerador antes de medir.`)
}

export const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`

/** Os tokens `fixture:*` das camadas trocados pelos arquivos reconstruídos (data URLs). */
export async function arquivosDaFixture(): Promise<Record<string, string>> {
  const marca = fixture.marca()
  const foto = dataUrl(await fotoReconstruida())
  return {
    'fixture:foto': foto,
    // A foto de exemplo da página de assinatura não entra na peça; qualquer imagem local serve.
    'fixture:foto-da-assinatura': foto,
    'fixture:logo-wordmark': dataUrl(await logoReconstruida(marca.logos.wordmark)),
    'fixture:logo-monograma': dataUrl(await logoReconstruida(marca.logos.monograma)),
  }
}

export function comArquivos(layers: Layer[], arquivos: Record<string, string>): Layer[] {
  return layers.map((l) => {
    if (typeof l.fileUrl !== 'string' || !l.fileUrl.startsWith('fixture:')) return l
    const url = arquivos[l.fileUrl]
    if (!url) throw new Error(`token sem arquivo na fixture: ${l.fileUrl}`)
    return { ...l, fileUrl: url }
  })
}
