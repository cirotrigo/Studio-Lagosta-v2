/**
 * O CENÁRIO do #8 `minimal-divisao-foto-topo` com FONTES REAIS (as do #15: Georgia e Georgia bold itálica do sistema,
 * Montserrat de um kit local), no medidor REAL do servidor. A marca é SINTÉTICA ("Marca sintética #8"): página de
 * assinatura gerada aqui, com a cor de cada papel por parâmetro, papel escuro e claro de teste e as duas variantes da
 * logo (clara e escura). A foto é gerada (cinza com textura, tingida), com o "assunto" num retângulo claro — nenhuma
 * foto, logo ou marca real é consultada.
 */
import { noPisoDe1310 } from './compositor'
import sharp from 'sharp'
import type { Layer } from '@/types/template'
import type { CenarioDoCompositor, PaginaDeAssinatura } from './compositor'
import { dataUrl } from './fixture'
import { fotoSintetica, logoSintetica, variantesClaraEEscura } from './sinteticos'

export { fontesNoDisco, medidorComFontesReais } from './cenario-15'
export const ID_DIVISAO = 'minimal-divisao-foto-topo'
export const PROJETO_8 = 9008
/** Os dois papéis da marca sintética: o escuro (`numeros.fundo`) e o claro (`numeros.fundoClaro`). */
export const ESCURO_8 = '#141414'
export const CLARO_8 = '#F4EFE6'
export const BRANCO = '#FFFFFF'
export const TINTA_8 = '#1F1F1F'
/** A identidade da foto na spec (a chave da peça): os BYTES vêm do cenário, pelo dublê do fetch. */
export const FOTO_URL = 'https://fotos.test/divisao-8.png'

export type PapelDaPagina8 = 'headline' | 'headline2' | 'apoio' | 'servico'

const texto = (papel: PapelDaPagina8, y: number, estilo: Record<string, unknown>, grupo: string): Layer =>
  ({
    id: `${papel}-pagina`,
    name: papel,
    type: 'text',
    visible: true,
    locked: false,
    order: 1,
    isDynamic: true,
    position: { x: 92, y },
    size: { width: 896, height: 100 },
    content: 'Texto da assinatura',
    style: { lineHeight: 1.1, textAlign: 'left', ...estilo },
    textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: Number(estilo.lineHeight ?? 1.1) } },
    metadata: { groupId: grupo, compositor: { papel } },
  }) as Layer

/**
 * A página de assinatura do #8: manchete Georgia (com a segunda voz Georgia bold itálica), apoio e serviço Montserrat.
 * `cores` = a tinta de cada papel (padrão: todas `tinta`). `gradiente` = um gradiente de LEITURA desenhado no rodapé
 * (a prova de que o #8 não o usa).
 */
export async function paginaDoCenario8(id: string, opcoes: { tinta?: string; cores?: Partial<Record<PapelDaPagina8, string>>; gradiente?: boolean } = {}): Promise<PaginaDeAssinatura> {
  const cor = (p: PapelDaPagina8) => opcoes.cores?.[p] ?? opcoes.tinta ?? BRANCO
  return {
    id,
    name: `Assinatura sintética #8 ${id}`,
    width: 1080,
    height: 1920,
    tags: [],
    background: '#808080',
    layers: [
      ...(opcoes.gradiente
        ? [
            {
              id: 'grad-rodape',
              name: 'grad-rodape',
              type: 'gradient',
              visible: true,
              locked: false,
              order: 0,
              position: { x: 0, y: 1220 },
              size: { width: 1080, height: 700 },
              style: { gradientAngle: 0, gradientStops: [{ id: 'a', position: 0, color: '#000000', opacity: 0.8 }, { id: 'b', position: 1, color: '#000000', opacity: 0 }] },
            } as Layer,
          ]
        : []),
      texto('headline', 1250, { fontFamily: 'Georgia', fontSize: 78, lineHeight: 1.05, color: cor('headline') }, 'g-manchete'),
      texto('headline2', 1340, { fontFamily: 'Georgia Italica', fontSize: 78, lineHeight: 1.05, fontWeight: 'bold', color: cor('headline2') }, 'g-manchete'),
      texto('apoio', 1490, { fontFamily: 'Montserrat', fontSize: 30, lineHeight: 1.2, color: cor('apoio') }, 'g-apoio'),
      texto('servico', 1620, { fontFamily: 'Montserrat', fontSize: 28, lineHeight: 1.2, fontWeight: '600', color: cor('servico') }, 'g-servico'),
      { id: 'logo-pagina', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 800, y: 1600 }, size: { width: 160, height: 80 }, fileUrl: dataUrl(await logoSintetica('#808080')), style: { objectFit: 'contain' } } as Layer,
    ],
  }
}

/**
 * A foto sintética: textura cinza tingida de âmbar, com o "assunto" (um retângulo bem claro) entre as frações `assunto`
 * da altura (e no terço central da largura). `escura` = a mesma foto escurecida (a MESMA identidade com outra luz).
 */
export async function fotoDoCenario8(dim: { width: number; height: number }, opcoes: { assunto?: [number, number]; escura?: boolean } = {}): Promise<Buffer> {
  const [a0, a1] = opcoes.assunto ?? [0.35, 0.65]
  const base = opcoes.escura ? 40 : 150
  const cinza = await fotoSintetica((x, y) => {
    const noAssunto = y >= a0 * dim.height && y <= a1 * dim.height && x >= dim.width / 3 && x <= (2 * dim.width) / 3
    return noAssunto ? base + 90 : base + 30 * Math.sin(y / 90) + 20 * Math.cos(x / 70)
  }, dim)
  return sharp(cinza).tint({ r: 214, g: 160, b: 110 }).png().toBuffer()
}

/**
 * O cenário do compositor real para o #8. `assinatura` = a raiz de `Project.assinatura` (padrão: o escuro e o claro de
 * teste, sem destaque); `foto` = os bytes servidos pelo dublê (a URL desenhada é um data URL deles, para o render).
 */
export async function cenario8(
  pagina: PaginaDeAssinatura,
  medir: CenarioDoCompositor['medidor'],
  opcoes: { assinatura?: Record<string, unknown>; foto?: Buffer | null; catalogo?: CenarioDoCompositor['catalogo']; variantes?: Array<{ fileUrl: string; isProjectLogo: true }> } = {},
): Promise<CenarioDoCompositor> {
  const foto = opcoes.foto === undefined ? await fotoDoCenario8({ width: 1080, height: 1350 }) : opcoes.foto
  return {
    projeto: { id: PROJETO_8, assinatura: noPisoDe1310(opcoes.assinatura ?? { fundo: ESCURO_8, fundoClaro: CLARO_8 }), logoDoProjeto: null, logosDoProjeto: opcoes.variantes ?? (await variantesClaraEEscura()) },
    paginasDeAssinatura: [pagina],
    foto: foto ? { url: dataUrl(foto), bytes: foto } : null,
    candidatasDoVeu: [],
    catalogo: opcoes.catalogo ?? null,
    medidor: medir,
  }
}

/** A copy autoral do #8: manchete (com a voz 2 nas linhas declaradas), apoio opcional e serviço de uma linha. */
export function copy8(args: { manchete: string[]; voz2?: number[]; apoio?: string[] | null; servico?: string[]; extras?: Array<{ id: string; funcao: string; linhas: string[] }> } = { manchete: ['Noite de vinhos'] }) {
  const blocos = [
    { id: 'manchete', funcao: 'headline', linhas: args.manchete, ...(args.voz2 ? { estilo: { linhasNaVoz2: args.voz2 } } : {}) },
    ...(args.apoio === null ? [] : [{ id: 'detalhe', funcao: 'apoio', linhas: args.apoio ?? ['Harmonização com o chef da casa'] }]),
    { id: 'quando', funcao: 'servico', linhas: args.servico ?? ['Sexta, 14/11 · 20h'] },
    ...(args.extras ?? []),
  ]
  return {
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude', superficie: 'chat', em: '2026-10-24T12:00:00.000Z' },
    revisoes: [],
    blocos: blocos.map((b, ordem) => ({ ...b, ordem })),
  }
}

/** A spec do #8: COM foto (identidade fixa por padrão), o contrato e a variante pedida. */
export function spec8(variante: string, extra: Record<string, unknown> = {}) {
  return { projectId: PROJETO_8, formato: 'story', preferencias: { variante }, arquetipo: { id: ID_DIVISAO, versao: 1 }, foto: { url: FOTO_URL }, copyAutoral: copy8(), ...extra }
}
