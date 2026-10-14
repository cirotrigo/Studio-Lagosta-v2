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
  assuntoAnotado: {
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
 * A foto da peça, reconstruída: a grade de 43×64 ampliada para o tamanho
 * original e as janelas de medida coladas por cima, nas coordenadas da foto.
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

/** A logo da fixture como PNG: a máscara de alfa gravada, pintada com a tinta média. */
export async function logoReconstruida(logo: LogoDaFixture): Promise<Buffer> {
  const alfa = Buffer.from(logo.alfa, 'base64')
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(logo.tintaMedia.slice(i, i + 2), 16))
  const rgba = Buffer.alloc(logo.largura * logo.altura * 4)
  for (let i = 0; i < alfa.length; i++) {
    rgba[i * 4] = r
    rgba[i * 4 + 1] = g
    rgba[i * 4 + 2] = b
    rgba[i * 4 + 3] = alfa[i]
  }
  return sharp(rgba, { raw: { width: logo.largura, height: logo.altura, channels: 4 } }).png().toBuffer()
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
