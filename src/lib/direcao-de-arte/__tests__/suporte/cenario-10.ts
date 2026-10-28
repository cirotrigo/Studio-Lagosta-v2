/**
 * O CENÁRIO do #10 `minimal-coluna-foto@1` / `minimal-coluna-foto-esquerda@1` (fixture, IH 25/10/2026) com as FONTES DO
 * REPO (Montserrat 400/600/800 de `assets/fonts/montserrat`) no medidor REAL do servidor — o padrão do `cenario-9.ts`,
 * sem importar nada do arco. A marca é SINTÉTICA: as páginas de assinatura de Story E de Feed com os corpos das
 * amostras v2 aceitas no G-A10 (80/40/30, pesos 800/400/600, entrelinhas .95/1,2/1,2 nos DOIS formatos — o Feed derivado
 * daria 70, PREFLIGHT F4), a logo anel+barra 160×80 (clara e escura) e o liso `#0B0B0B`/`#F4EFE6`. A foto é a de
 * bastidores da Lagosta versionada na worktree, servida pelo dublê do fetch. A copy tem as linhas LITERAIS das amostras
 * (F3: o produto não quebra dentro da linha). Esses números moram SÓ aqui, nunca no produto.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { CenarioDoCompositor, PaginaDeAssinatura } from './compositor'
import { dataUrl } from './fixture'
import { logoSintetica } from './sinteticos'

/** A foto de bastidores versionada na worktree (a mesma das amostras v2: `insumos.foto`, sha fdc37e8d…). */
export const CAMINHO_DA_FOTO = 'lagostacriativa.com.br/assets/media__1773025412903.jpg'
export const fotoDoRepo = () => readFileSync(join(process.cwd(), CAMINHO_DA_FOTO))
export const dataUrlJpeg = (b: Buffer) => `data:image/jpeg;base64,${b.toString('base64')}`

/** Registra a Montserrat do repo (400/600/800, as que o `CanvasRenderer` registra) e devolve o medidor REAL do servidor. */
export async function medidorComAsFontesDoRepo(importarReal: () => Promise<typeof import('@/lib/creatives/server-text-measurer')>): Promise<MeasureTextBox> {
  const { GlobalFonts } = await import('@napi-rs/canvas')
  for (const peso of [400, 600, 800]) GlobalFonts.registerFromPath(join(process.cwd(), `assets/fonts/montserrat/Montserrat-${peso}.ttf`), 'Montserrat')
  return (await importarReal()).createServerTextBoxMeasurer()
}

export const ID_COLUNA_D = 'minimal-coluna-foto'
export const ID_COLUNA_E = 'minimal-coluna-foto-esquerda'
export type Lado10 = 'D' | 'E'
export const idDoLado = (lado: Lado10) => (lado === 'D' ? ID_COLUNA_D : ID_COLUNA_E)
export const PROJETO_10 = 9010
export const ESCURO_10 = '#0B0B0B'
export const CLARO_10 = '#F4EFE6'
/** A identidade da foto na spec (a chave da peça): os BYTES vêm do cenário, pelo dublê do fetch. */
export const FOTO_URL_10 = 'https://fotos.test/coluna-10.jpg'

export type Formato10 = 'story' | 'feed'
export type Liso10 = 'claro' | 'escuro'
/** Os corpos das amostras v2 (`pecas/v2/*.json`): manchete, apoio, serviço — iguais no Story e no Feed. */
export const CORPOS_10 = { headline: 80, apoio: 40, servico: 30 } as const
/** A tinta dos textos: escura no liso claro, clara no liso escuro. */
export const tintaDo10 = (liso: Liso10) => (liso === 'claro' ? ESCURO_10 : CLARO_10)

const texto = (papel: 'headline' | 'apoio' | 'servico', y: number, estilo: Record<string, unknown>): Layer =>
  ({
    id: `${papel}-pagina`,
    name: papel,
    type: 'text',
    visible: true,
    locked: false,
    order: 1,
    isDynamic: true,
    position: { x: 92, y },
    size: { width: 456, height: 100 },
    content: 'Texto da assinatura',
    style: { textAlign: 'left', letterSpacing: 0, fontFamily: 'Montserrat', ...estilo },
    textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: Number(estilo.lineHeight) } },
    metadata: { groupId: `g-${papel}`, compositor: { papel } },
  }) as Layer

export const varianteDo10 = (liso: Liso10) => `coluna10-${liso}`

/** A página de assinatura do formato: o nome carrega a variante (`coluna10-<liso>`), o id o formato. */
export async function paginaDoCenario10(formato: Formato10, liso: Liso10, id = `coluna10-${liso}-${formato}`): Promise<PaginaDeAssinatura> {
  const cor = tintaDo10(liso)
  return {
    id,
    name: `Assinatura sintética #10 ${varianteDo10(liso)}`,
    width: 1080,
    height: formato === 'story' ? 1920 : 1350,
    tags: [],
    background: '#808080',
    layers: [
      texto('headline', 300, { fontSize: CORPOS_10.headline, fontWeight: 800, lineHeight: 0.95, color: cor }),
      texto('apoio', 900, { fontSize: CORPOS_10.apoio, fontWeight: 400, lineHeight: 1.2, color: cor }),
      texto('servico', 1100, { fontSize: CORPOS_10.servico, fontWeight: 600, lineHeight: 1.2, color: cor }),
      { id: 'logo-pagina', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 92, y: 200 }, size: { width: 160, height: 80 }, fileUrl: dataUrl(await logoSintetica(cor)), style: { objectFit: 'contain' } } as Layer,
    ],
  }
}

/** O cenário do compositor real: as DUAS páginas (Story e Feed) do liso, a foto do repo e as logos clara e escura. */
export async function cenario10(
  liso: Liso10,
  medir: MeasureTextBox,
  opcoes: { foto?: Buffer; catalogo?: CenarioDoCompositor['catalogo']; paginas?: PaginaDeAssinatura[] } = {},
): Promise<CenarioDoCompositor> {
  const foto = opcoes.foto ?? fotoDoRepo()
  return {
    projeto: {
      id: PROJETO_10,
      assinatura: { fundo: ESCURO_10, fundoClaro: CLARO_10 },
      logoDoProjeto: null,
      logosDoProjeto: [
        { fileUrl: dataUrl(await logoSintetica(CLARO_10)), isProjectLogo: true },
        { fileUrl: dataUrl(await logoSintetica(ESCURO_10)), isProjectLogo: true },
      ],
    },
    paginasDeAssinatura: opcoes.paginas ?? [await paginaDoCenario10('story', liso), await paginaDoCenario10('feed', liso)],
    foto: { url: dataUrlJpeg(foto), bytes: foto },
    candidatasDoVeu: [],
    catalogo: opcoes.catalogo ?? null,
    medidor: medir,
  }
}

/** A copy LITERAL das amostras v2 (F3): manchete em 3 linhas e apoio em 2, com a quebra autoral; serviço em 1. */
export const COPY_10 = { headline: ['Bastidores', 'da nova', 'sessão'], apoio: ['Luz natural e cada', 'prato no ponto certo'], servico: ['Ter a dom · 18h às 23h'] }

export function copy10(extras: { headline?: string[]; apoio?: string[] | null; servico?: string[] | null; mais?: Array<{ id: string; funcao: string; linhas: string[] }> } = {}) {
  const blocos = [
    { id: 'manchete', funcao: 'headline', linhas: extras.headline ?? COPY_10.headline },
    ...(extras.apoio === null ? [] : [{ id: 'detalhe', funcao: 'apoio', linhas: extras.apoio ?? COPY_10.apoio }]),
    ...(extras.servico === null ? [] : [{ id: 'quando', funcao: 'servico', linhas: extras.servico ?? COPY_10.servico }]),
    ...(extras.mais ?? []),
  ]
  return {
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude', superficie: 'chat', em: '2026-10-25T13:00:00.000Z' },
    revisoes: [],
    blocos: blocos.map((b, ordem) => ({ ...b, ordem })),
  }
}

/** A spec do #10 (fixture): foto por URL de identidade fixa, o contrato do lado e a variante do liso. */
export function spec10(formato: Formato10, lado: Lado10, liso: Liso10, extra: Record<string, unknown> = {}) {
  return { projectId: PROJETO_10, formato, preferencias: { variante: varianteDo10(liso) }, arquetipo: { id: idDoLado(lado), versao: 1 }, foto: { url: FOTO_URL_10 }, copyAutoral: copy10(), ...extra }
}
