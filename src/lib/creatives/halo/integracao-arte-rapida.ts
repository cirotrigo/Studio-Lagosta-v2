/**
 * A cola entre `createArteRapida` e o halo/layout pela foto — server, com
 * Prisma e rede. Tudo aqui é BEST-EFFORT: falha na foto, no banco ou na
 * medição nunca derruba a criação da arte; cai no véu como está e devolve o
 * motivo como aviso.
 *
 * Só entra na família certa: templates do lote gerado por tema
 * (`lote-tema-2026-08`) ou página que já tem véu — template desenhado à mão
 * não é mexido.
 */

import { db } from '@/lib/db'
import { fetchBuffer } from '@/lib/posts/register-project-fonts'
import type { Layer } from '@/types/template'

import { aplicarHalo, ehCamadaDeVeu, ehFotoDeFundo, type HaloDeBloco } from './aplicar-halo'
import { lerFotoComoCover, medirFaixasDaFoto, type CanvasSize, type FotoCinza } from './halo-medicao'
import {
  ehTemplateDeTresLayouts,
  escolherLayoutPelaFoto,
  layoutDoNomeDaPagina,
  type EscolhaDeLayout,
  type LayoutPelaFoto,
} from './layout-pela-foto'

/** Tag que `scripts/criar-templates-por-tema.ts` grava nos templates gerados. */
export const TAG_DA_FAMILIA_GERADA = 'lote-tema-2026-08'
export const COR_DA_MANCHA_PADRAO = '#111111'

/** A foto decodificada UMA vez, reaproveitada pelo layout e pelo halo. */
export interface FotoParaMedicao {
  url: string
  raster: FotoCinza
}

function ehUrlHttp(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

/**
 * Baixa e decodifica a foto como cover no canvas. `null` (com log) em
 * qualquer falha — quem chama segue sem medição.
 */
export async function lerFotoParaMedicao(
  url: string | null | undefined,
  canvas: CanvasSize,
): Promise<FotoParaMedicao | null> {
  if (!ehUrlHttp(url)) return null
  try {
    const bytes = await fetchBuffer(url)
    const raster = await lerFotoComoCover(bytes, canvas)
    return { url, raster }
  } catch (error) {
    console.warn('[halo] Não deu para ler a foto para medição:', (error as Error).message)
    return null
  }
}

/** A família de modelos em que o halo substitui o véu. */
export function ehFamiliaDeHalo(templateTags: string[] | null | undefined, layers: Layer[]): boolean {
  const tags = (templateTags ?? []).map((t) => t.toLowerCase())
  if (tags.includes(TAG_DA_FAMILIA_GERADA)) return true
  return layers.some(ehCamadaDeVeu)
}

/**
 * A cor da mancha, na ordem do `_halo.py`: "quem porta escolhe a cor do véu
 * que o cliente já usava". 1) a cor do véu da própria página; 2) a cor da
 * marca cadastrada com nome de fundo/escuro; 3) quase-preto.
 */
export async function corDaManchaDoProjeto(projectId: number, layers: Layer[]): Promise<string> {
  const veu = layers.find(ehCamadaDeVeu)
  const stops = veu?.style?.gradientStops
  const corDoVeu = Array.isArray(stops)
    ? stops.map((s) => (s as { color?: unknown }).color).find((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
    : undefined
  if (typeof corDoVeu === 'string') return corDoVeu

  try {
    const cores = await db.brandColor.findMany({
      where: { projectId },
      select: { name: true, hexCode: true },
    })
    const escura = cores.find((c) => /dark|escur|fundo|preto|black|background/i.test(c.name))
    if (escura && /^#[0-9a-f]{6}$/i.test(escura.hexCode.trim())) return escura.hexCode.trim()
  } catch (error) {
    console.warn('[halo] Falha ao ler as cores da marca:', (error as Error).message)
  }
  return COR_DA_MANCHA_PADRAO
}

export interface ResultadoDoHaloNaArte {
  layers: Layer[]
  /** Como a arte saiu: com halo, ou com o véu porque algo impediu. */
  aplicado: boolean
  blocos: number
  halos: HaloDeBloco[]
  avisos: string[]
  corDaMancha: string | null
}

export interface AplicarHaloNaArteInput {
  projectId: number
  layers: Layer[]
  canvas: CanvasSize
  templateTags: string[] | null | undefined
  /** A foto já lida para o layout, quando a URL coincide com a do fundo. */
  fotoLida: FotoParaMedicao | null
}

/**
 * Halo em vez de véu na arte montada — quando a família permite. Nunca lança.
 */
export async function aplicarHaloNaArte(input: AplicarHaloNaArteInput): Promise<ResultadoDoHaloNaArte> {
  const semHalo = (aviso?: string): ResultadoDoHaloNaArte => ({
    layers: input.layers,
    aplicado: false,
    blocos: 0,
    halos: [],
    avisos: aviso ? [aviso] : [],
    corDaMancha: null,
  })

  if (!ehFamiliaDeHalo(input.templateTags, input.layers)) return semHalo()

  const fundo = input.layers.find((l) => ehFotoDeFundo(l, input.canvas) && l.visible !== false)
  const urlDoFundo = fundo?.fileUrl
  if (!ehUrlHttp(urlDoFundo)) {
    return semHalo('halo não aplicado: a arte não tem foto de fundo acessível; ficou o véu')
  }

  try {
    const foto =
      input.fotoLida && input.fotoLida.url === urlDoFundo
        ? input.fotoLida
        : await lerFotoParaMedicao(urlDoFundo, input.canvas)
    if (!foto) return semHalo('halo não aplicado: não deu para ler a foto de fundo; ficou o véu')

    const corDaMancha = await corDaManchaDoProjeto(input.projectId, input.layers)
    const resultado = await aplicarHalo({
      layers: input.layers,
      canvas: input.canvas,
      foto: foto.raster,
      corDaMancha,
    })
    return {
      layers: resultado.layers,
      aplicado: true,
      blocos: resultado.halos.filter((h) => h.camadaId).length,
      halos: resultado.halos,
      avisos: resultado.avisos,
      corDaMancha,
    }
  } catch (error) {
    const message = (error as Error).message
    console.warn('[halo] Falha ao aplicar o halo — a arte segue com o véu:', message)
    return semHalo(`halo não aplicado (${message}); ficou o véu`)
  }
}

// ─── Layout pela foto ────────────────────────────────────────────────

export interface PaginaIrma {
  id: string
  name: string
}

export interface EscolhaDePaginaPelaFoto extends EscolhaDeLayout {
  /** A página-irmã escolhida (null quando é a própria página de origem). */
  pagina: { id: string; name: string } | null
  layoutDaOrigem: LayoutPelaFoto | null
}

/**
 * Entre os irmãos "(3 layouts)" de um template, qual recebe esta foto.
 * `null` quando a página não é da família, não tem irmãos ou a foto não foi
 * lida. Nunca lança.
 */
export async function escolherPaginaPelaFoto(args: {
  templateId: number
  templateNome: string
  paginaAtual: { id: string; name: string }
  foto: FotoParaMedicao | null
}): Promise<EscolhaDePaginaPelaFoto | null> {
  if (!args.foto) return null
  if (!ehTemplateDeTresLayouts(args.templateNome)) return null

  try {
    const irmas: PaginaIrma[] = await db.page.findMany({
      where: { templateId: args.templateId, isTemplate: true },
      select: { id: true, name: true },
    })
    const porLayout = new Map<LayoutPelaFoto, PaginaIrma>()
    for (const p of irmas) {
      const layout = layoutDoNomeDaPagina(p.name)
      if (layout && !porLayout.has(layout)) porLayout.set(layout, p)
    }
    if (porLayout.size < 2) return null

    const faixas = await medirFaixasDaFoto(args.foto.raster, args.foto.raster.canvas)
    const escolha = escolherLayoutPelaFoto(faixas)
    const alvo = porLayout.get(escolha.layout)
    if (!alvo) {
      return {
        ...escolha,
        pagina: null,
        layoutDaOrigem: layoutDoNomeDaPagina(args.paginaAtual.name),
        motivo: `${escolha.motivo}; o template não tem a página "${escolha.layout}", ficou a de origem`,
      }
    }
    return {
      ...escolha,
      pagina: alvo.id === args.paginaAtual.id ? null : alvo,
      layoutDaOrigem: layoutDoNomeDaPagina(args.paginaAtual.name),
    }
  } catch (error) {
    console.warn('[halo] Falha ao escolher o layout pela foto:', (error as Error).message)
    return null
  }
}
