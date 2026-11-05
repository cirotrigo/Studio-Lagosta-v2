/**
 * Peças SINTÉTICAS para as propriedades fora da peça piloto: foto gerada por
 * regiões de luz (com textura determinística, para o mapa de calma ter o que
 * ler), página de assinatura gerada e logo gerada. Nenhum cliente, nenhuma
 * cor de marca real — as cores são só fixture.
 */
import sharp from 'sharp'

import type { Layer } from '@/types/template'
import { dataUrl } from './fixture'
import { medidorCalibrado, type CenarioDoCompositor, type PaginaDeAssinatura } from './compositor'

export const VEU_ESCURO = '#1A1A1A'
export const VEU_CLARO = '#F2F2F2'

/**
 * Foto em cinza (1080×1920 por padrão): `luz(x, y)` dá a base de cada pixel; a textura soma ±6. Outra proporção
 * (`dimensoes`) é o que dá ao compositor os 3 cortes candidatos — a mesma textura, pixel a pixel, no tamanho padrão.
 */
export async function fotoSintetica(luz: (x: number, y: number) => number, dimensoes: { width: number; height: number } = { width: 1080, height: 1920 }): Promise<Buffer> {
  const W = dimensoes.width
  const H = dimensoes.height
  const px = Buffer.alloc(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ruido = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 13 - 6
      px[y * W + x] = Math.max(0, Math.min(255, Math.round(luz(x, y) + ruido)))
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer()
}

/**
 * CP3: as duas variantes AUTORIZADAS do projeto (clara e escura), para os testes de GEOMETRIA (T1a, CP2B): a página
 * sintética desenha a logo cinza de propósito, e a conferência da logo pode trocá-la por uma que leia sem mudar a caixa
 * (a mesma proporção 160×80).
 */
export async function variantesClaraEEscura(): Promise<Array<{ fileUrl: string; isProjectLogo: true }>> {
  return [
    { fileUrl: dataUrl(await logoSintetica('#F5F5F5')), isProjectLogo: true },
    { fileUrl: dataUrl(await logoSintetica('#1E1E1E')), isProjectLogo: true },
  ]
}

/** Logo 160×80: um anel e uma barra opacos na tinta pedida, o resto transparente. */
export async function logoSintetica(tinta: string): Promise<Buffer> {
  const W = 160
  const H = 80
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(tinta.slice(i, i + 2), 16))
  const px = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 40, y - 40)
      const opaco = (d < 36 && d > 22) || (x > 90 && x < 150 && y > 30 && y < 50)
      const p = (y * W + x) * 4
      px[p] = r
      px[p + 1] = g
      px[p + 2] = b
      px[p + 3] = opaco ? 255 : 0
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
}

interface TextoDaPagina {
  cor: string
}

/** Página de assinatura de story gerada: H1 (e apoio) no topo, serviço no rodapé, logo no canto superior direito. */
export function paginaSintetica(args: { id: string; headline: TextoDaPagina; apoio?: TextoDaPagina; servico?: TextoDaPagina; logoUrl: string; fundoUrl: string }): PaginaDeAssinatura {
  const texto = (id: string, y: number, fontSize: number, cor: string, extra: Partial<Layer> = {}): Layer => ({
    id: `${id}-pagina`,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: 1,
    isDynamic: true,
    position: { x: 92, y },
    size: { width: 896, height: Math.round(fontSize * 1.2) },
    content: 'Texto da assinatura',
    style: { fontFamily: 'Sintetica Display', fontSize, lineHeight: 1, color: cor, textAlign: 'left' },
    textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: 1 } },
    ...extra,
  })
  const layers: Layer[] = [
    { id: 'fundo', name: 'Imagem de fundo', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: args.fundoUrl, style: { objectFit: 'cover' } },
    texto('headline', 300, 90, args.headline.cor, { metadata: { groupId: 'g-topo' } }),
    ...(args.apoio ? [texto('apoio', 420, 40, args.apoio.cor, { metadata: { groupId: 'g-topo' } })] : []),
    ...(args.servico ? [texto('servico', 1640, 34, args.servico.cor, { style: { fontFamily: 'Sintetica Texto', fontSize: 34, lineHeight: 1.2, color: args.servico.cor, textAlign: 'center' } })] : []),
    { id: 'logo-pagina', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 830, y: 200 }, size: { width: 160, height: 80 }, fileUrl: args.logoUrl, style: { objectFit: 'contain' } },
  ]
  return { id: args.id, name: `Assinatura sintética ${args.id}`, width: 1080, height: 1920, tags: [], background: '#808080', layers }
}

export async function cenarioSintetico(args: {
  pagina: PaginaDeAssinatura
  foto: Buffer
  candidatasDoVeu: string[]
  assunto?: { x0: number; y0: number; x1: number; y1: number }
  /** CP3: as linhas `Logo` do projeto (data URLs). `isProjectLogo` padrão true = variante autorizada. */
  logosDoProjeto?: Array<{ fileUrl: string; isProjectLogo?: boolean }>
}): Promise<CenarioDoCompositor> {
  return {
    projeto: { id: 9002, assinatura: {}, logoDoProjeto: null, ...(args.logosDoProjeto ? { logosDoProjeto: args.logosDoProjeto.map((l) => ({ fileUrl: l.fileUrl, isProjectLogo: l.isProjectLogo ?? true })) } : {}) },
    paginasDeAssinatura: [args.pagina],
    foto: { url: dataUrl(args.foto), bytes: args.foto },
    candidatasDoVeu: args.candidatasDoVeu,
    catalogo: { driveFileId: 'foto-sintetica', ...(args.assunto ? { assunto: args.assunto } : {}) },
    medidor: medidorCalibrado(),
  }
}

export function specSintetica(args: { pagina: string; blocos: Array<{ papel: string; linhas: string[] }>; preferencias?: Record<string, unknown> }) {
  return {
    projectId: 9002,
    formato: 'story',
    foto: { driveFileId: 'foto-sintetica' },
    blocos: args.blocos.map((b, ordem) => ({ ...b, ordem })),
    preferencias: { variante: args.pagina, ...(args.preferencias ?? {}) },
  }
}
