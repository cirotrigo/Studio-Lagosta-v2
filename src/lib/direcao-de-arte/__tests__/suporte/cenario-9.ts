/**
 * O CENÁRIO do #9 `minimal-divisao-cor-topo-arco@1` (fixture, I9 25/10/2026) com as FONTES DO REPO (Montserrat 400/600/
 * 800 de `assets/fonts/montserrat`, as que o `CanvasRenderer` registra — não o kit do checkout compartilhado), no
 * medidor REAL do servidor. A marca é SINTÉTICA: as páginas de assinatura de Story E de Feed com os corpos, pesos,
 * entrelinhas e tintas das amostras Bv3 aceitas (32/87/40 e 29/86/32), a logo anel+barra 160×80 (clara e escura) e o
 * liso `#0B0B0B`/`#F4EFE6`. A foto é a de bastidores da própria Lagosta versionada na worktree, servida pelo dublê do
 * fetch — nada de Drive, Blob ou rede. Esses números moram SÓ aqui (IF-05), nunca no produto.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { CenarioDoCompositor, PaginaDeAssinatura } from './compositor'
import { dataUrl } from './fixture'
import { logoSintetica } from './sinteticos'
import { ID_ARCO } from '../../../compositor/arquetipos/__tests__/suporte/arquetipo-arco-9'

export { ID_ARCO }
export const PROJETO_9 = 9009
export const ESCURO_9 = '#0B0B0B'
export const CLARO_9 = '#F4EFE6'
/** A identidade da foto na spec (a chave da peça): os BYTES vêm do cenário, pelo dublê do fetch. */
export const FOTO_URL_9 = 'https://fotos.test/arco-9.jpg'
export const CAMINHO_DA_FOTO = 'lagostacriativa.com.br/assets/media__1773025412903.jpg'

/** As fontes do repo: [arquivo relativo à raiz, peso]. */
export const FONTES_DO_REPO: Array<[string, number]> = [
  ['assets/fonts/montserrat/Montserrat-400.ttf', 400],
  ['assets/fonts/montserrat/Montserrat-600.ttf', 600],
  ['assets/fonts/montserrat/Montserrat-800.ttf', 800],
]

/** Registra a Montserrat do repo e devolve o medidor REAL do servidor. */
export async function medidorComAsFontesDoRepo(importarReal: () => Promise<typeof import('@/lib/creatives/server-text-measurer')>): Promise<MeasureTextBox> {
  const { GlobalFonts } = await import('@napi-rs/canvas')
  for (const [arquivo] of FONTES_DO_REPO) GlobalFonts.registerFromPath(join(process.cwd(), arquivo), 'Montserrat')
  return (await importarReal()).createServerTextBoxMeasurer()
}

export type Formato9 = 'story' | 'feed'
export type Liso9 = 'claro' | 'escuro'
/** Os corpos das Bv3 (`resumo.json` das amostras v3): pré, manchete, apoio. */
export const CORPOS_9: Record<Formato9, { pre: number; headline: number; apoio: number }> = {
  story: { pre: 32, headline: 87, apoio: 40 },
  feed: { pre: 29, headline: 86, apoio: 32 },
}
/** A tinta dos textos: escura no liso claro, clara no liso escuro. */
export const tintaDo = (liso: Liso9) => (liso === 'claro' ? ESCURO_9 : CLARO_9)

const texto = (papel: 'pre' | 'headline' | 'apoio', y: number, estilo: Record<string, unknown>): Layer =>
  ({
    id: `${papel}-pagina`,
    name: papel,
    type: 'text',
    visible: true,
    locked: false,
    order: 1,
    isDynamic: true,
    position: { x: 92, y },
    size: { width: 648, height: 100 },
    content: 'Texto da assinatura',
    style: { textAlign: 'left', letterSpacing: 0, fontFamily: 'Montserrat', ...estilo },
    textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: Number(estilo.lineHeight) } },
    metadata: { groupId: `g-${papel}`, compositor: { papel } },
  }) as Layer

/** A página de assinatura do formato: o nome carrega a variante (`arco9-<liso>`), o id o formato. */
export async function paginaDoCenario9(formato: Formato9, liso: Liso9): Promise<PaginaDeAssinatura> {
  const c = CORPOS_9[formato]
  const cor = tintaDo(liso)
  const altura = formato === 'story' ? 1920 : 1350
  return {
    id: `arco9-${liso}-${formato}`,
    name: `Assinatura sintética #9 ${varianteDo(liso)}`,
    width: 1080,
    height: altura,
    tags: [],
    background: '#808080',
    layers: [
      texto('pre', 300, { fontSize: c.pre, fontWeight: 600, lineHeight: 1.2, color: cor }),
      texto('headline', 380, { fontSize: c.headline, fontWeight: 800, lineHeight: 0.95, color: cor }),
      texto('apoio', 620, { fontSize: c.apoio, fontWeight: 400, lineHeight: 1.2, color: cor }),
      { id: 'logo-pagina', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 800, y: 200 }, size: { width: 160, height: 80 }, fileUrl: dataUrl(await logoSintetica(cor)), style: { objectFit: 'contain' } } as Layer,
    ],
  }
}
export const varianteDo = (liso: Liso9) => `arco9-${liso}`

export const fotoDoRepo = () => readFileSync(join(process.cwd(), CAMINHO_DA_FOTO))
export const dataUrlJpeg = (b: Buffer) => `data:image/jpeg;base64,${b.toString('base64')}`

/** O cenário do compositor real: as DUAS páginas (Story e Feed) do liso, a foto do repo e as logos clara e escura. */
export async function cenario9(
  liso: Liso9,
  medir: MeasureTextBox,
  opcoes: { foto?: Buffer; catalogo?: CenarioDoCompositor['catalogo'] } = {},
): Promise<CenarioDoCompositor> {
  const foto = opcoes.foto ?? fotoDoRepo()
  return {
    projeto: {
      id: PROJETO_9,
      assinatura: { fundo: ESCURO_9, fundoClaro: CLARO_9 },
      logoDoProjeto: null,
      logosDoProjeto: [
        { fileUrl: dataUrl(await logoSintetica(CLARO_9)), isProjectLogo: true },
        { fileUrl: dataUrl(await logoSintetica(ESCURO_9)), isProjectLogo: true },
      ],
    },
    paginasDeAssinatura: [await paginaDoCenario9('story', liso), await paginaDoCenario9('feed', liso)],
    foto: { url: dataUrlJpeg(foto), bytes: foto },
    candidatasDoVeu: [],
    catalogo: opcoes.catalogo ?? null,
    medidor: medir,
  }
}

/** A copy LITERAL das Bv3 por formato (IF-04): a manchete com a quebra autoral; o apoio do Story em duas linhas autorais. */
export const COPY_9: Record<Formato9, { pre: string; headline: string[]; apoio: string[] }> = {
  story: { pre: 'ESTA SEMANA', headline: ['Bastidores da', 'nova sessão'], apoio: ['Luz natural e cada', 'prato no ponto certo'] },
  feed: { pre: 'ESTA SEMANA', headline: ['Bastidores da', 'nova sessão'], apoio: ['Luz natural e cada prato no ponto certo'] },
}

export function copy9(formato: Formato9, extras: { pre?: string[] | null; apoio?: string[] | null; mais?: Array<{ id: string; funcao: string; linhas: string[] }> } = {}) {
  const c = COPY_9[formato]
  const blocos = [
    ...(extras.pre === null ? [] : [{ id: 'chamada', funcao: 'pre', linhas: extras.pre ?? [c.pre] }]),
    { id: 'manchete', funcao: 'headline', linhas: c.headline },
    ...(extras.apoio === null ? [] : [{ id: 'detalhe', funcao: 'apoio', linhas: extras.apoio ?? c.apoio }]),
    ...(extras.mais ?? []),
  ]
  return {
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude', superficie: 'chat', em: '2026-10-25T04:00:00.000Z' },
    revisoes: [],
    blocos: blocos.map((b, ordem) => ({ ...b, ordem })),
  }
}

/** A spec do #9 (fixture): foto por URL de identidade fixa, o contrato e a variante do liso. */
export function spec9(formato: Formato9, liso: Liso9, extra: Record<string, unknown> = {}) {
  return { projectId: PROJETO_9, formato, preferencias: { variante: varianteDo(liso) }, arquetipo: { id: ID_ARCO, versao: 1 }, foto: { url: FOTO_URL_9 }, copyAutoral: copy9(formato), ...extra }
}
