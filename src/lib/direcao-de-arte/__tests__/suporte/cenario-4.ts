/**
 * O CENÁRIO do #4 `minimal-fb-base-centro` com FONTES REAIS (as do #15: Georgia e Georgia bold itálica do sistema,
 * Montserrat de um kit local), no medidor REAL do servidor. A marca é SINTÉTICA ("Marca sintética #4"): página de
 * assinatura gerada aqui (manchete com a voz 2 e serviço, centrados), as duas variantes da logo (clara e escura) e a foto
 * gerada (cinza com textura) com a LUZ DO ALTO por parâmetro — nenhuma foto, logo ou marca real é consultada.
 *
 * Diferença em relação ao #8 (`cenario-8.ts`): aqui a foto é INTEIRA, sem caixa e sem papel de fundo — o texto e a logo
 * pousam na foto, e a leitura da logo é do CP3 sobre a foto. As expectativas de fundo e de papel do #8 não valem aqui.
 */
import type { Layer } from '@/types/template'
import type { CenarioDoCompositor, PaginaDeAssinatura } from './compositor'
import { dataUrl } from './fixture'
import { fotoSintetica, logoSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './sinteticos'

export { fontesNoDisco, medidorComFontesReais } from './cenario-15'
export const ID_BASE_CENTRO = 'minimal-fb-base-centro'
export const PROJETO_4 = 9004
export const BRANCO = '#FFFFFF'
/** As tintas das duas variantes autorizadas (`variantesClaraEEscura`). */
export const LOGO_CLARA = '#F5F5F5'
export const LOGO_ESCURA = '#1E1E1E'
/** A identidade da foto na spec: os BYTES vêm do cenário, pelo dublê do fetch. */
export const FOTO_URL = 'https://fotos.test/base-centro-4.png'
export const DIMENSOES = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const

type PapelDaPagina4 = 'headline' | 'headline2' | 'servico'

const texto = (papel: PapelDaPagina4, y: number, estilo: Record<string, unknown>, grupo: string): Layer =>
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
    style: { lineHeight: 1.1, textAlign: 'center', ...estilo },
    textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: Number(estilo.lineHeight ?? 1.1) } },
    metadata: { groupId: grupo, compositor: { papel } },
  }) as Layer

/**
 * A página de assinatura do #4: manchete Georgia (com a segunda voz Georgia bold itálica) e serviço Montserrat, na
 * `tinta` (padrão branco). `logo` = a tinta da logo que a página desenha (padrão a clara). `corpoDaManchete` = o corpo
 * das duas vozes da manchete (padrão 78). `gradiente` = um gradiente de LEITURA desenhado pela página no rodapé (o
 * tratamento explícito da família A).
 */
export async function paginaDoCenario4(id: string, opcoes: { tinta?: string; logo?: string; gradiente?: boolean; corpoDaManchete?: number } = {}): Promise<PaginaDeAssinatura> {
  const cor = opcoes.tinta ?? BRANCO
  const corpo = opcoes.corpoDaManchete ?? 78
  return {
    id,
    name: `Assinatura sintética #4 ${id}`,
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
      texto('headline', 1250, { fontFamily: 'Georgia', fontSize: corpo, lineHeight: 1.05, color: cor }, 'g-manchete'),
      texto('headline2', 1340, { fontFamily: 'Georgia Italica', fontSize: corpo, lineHeight: 1.05, fontWeight: 'bold', color: cor }, 'g-manchete'),
      texto('servico', 1560, { fontFamily: 'Montserrat', fontSize: 30, lineHeight: 1.2, fontWeight: '600', color: cor }, 'g-servico'),
      { id: 'logo-pagina', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 460, y: 200 }, size: { width: 160, height: 80 }, fileUrl: dataUrl(await logoSintetica(opcoes.logo ?? LOGO_CLARA)), style: { objectFit: 'contain' } } as Layer,
    ],
  }
}

/**
 * A foto sintética, INTEIRA: o alto (até 40% da altura) com a luz `topo`, a base (de 55%) com a luz `base`, uma
 * transição suave entre os dois. `ocupado` põe no alto uma textura de alta energia (listras finas ±70), a "foto com
 * coisa no alto" sem região anotada.
 */
export async function fotoDoCenario4(dim: { width: number; height: number }, opcoes: { topo: number; base?: number; ocupado?: boolean }): Promise<Buffer> {
  const base = opcoes.base ?? 40
  return fotoSintetica((x, y) => {
    const t = Math.min(1, Math.max(0, (y / dim.height - 0.4) / 0.15))
    const alto = opcoes.ocupado ? opcoes.topo + 70 * Math.sign(Math.sin(x / 6) * Math.cos(y / 7)) : opcoes.topo
    return alto * (1 - t) + base * t
  }, dim)
}

/**
 * O cenário do compositor real para o #4. `foto` = os bytes servidos pelo dublê (a URL desenhada é um data URL deles);
 * `variantes` = as logos do projeto (`isProjectLogo`), padrão a clara e a escura; `catalogo` = a entrada do acervo (a
 * região anotada); `candidatasDoVeu` = as cores aprovadas de véu da marca (padrão: o escuro e o claro de teste).
 */
export async function cenario4(
  pagina: PaginaDeAssinatura,
  medir: CenarioDoCompositor['medidor'],
  opcoes: { foto: Buffer; assinatura?: Record<string, unknown>; catalogo?: CenarioDoCompositor['catalogo']; variantes?: Array<{ fileUrl: string; isProjectLogo: true }>; candidatasDoVeu?: string[] },
): Promise<CenarioDoCompositor> {
  return {
    projeto: { id: PROJETO_4, assinatura: opcoes.assinatura ?? {}, logoDoProjeto: null, logosDoProjeto: opcoes.variantes ?? (await variantesClaraEEscura()) },
    paginasDeAssinatura: [pagina],
    foto: { url: dataUrl(opcoes.foto), bytes: opcoes.foto },
    candidatasDoVeu: opcoes.candidatasDoVeu ?? [VEU_ESCURO, VEU_CLARO],
    catalogo: opcoes.catalogo ?? null,
    medidor: medir,
  }
}

/** A copy autoral do #4: manchete (com a voz 2 nas linhas declaradas) e serviço; `extras` = blocos que o `@1` recusa. */
export function copy4(args: { manchete?: string[]; voz2?: number[]; servico?: string[]; extras?: Array<{ id: string; funcao: string; linhas: string[] }> } = {}) {
  const blocos = [
    { id: 'manchete', funcao: 'headline', linhas: args.manchete ?? ['Noite de', 'vinhos'], ...(args.voz2 !== undefined ? (args.voz2.length ? { estilo: { linhasNaVoz2: args.voz2 } } : {}) : { estilo: { linhasNaVoz2: [1] } }) },
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

/** A spec do #4: COM foto (identidade fixa por padrão), o contrato e a variante pedida. */
export function spec4(variante: string, extra: Record<string, unknown> = {}) {
  return { projectId: PROJETO_4, formato: 'story', preferencias: { variante }, arquetipo: { id: ID_BASE_CENTRO, versao: 1 }, foto: { url: FOTO_URL }, copyAutoral: copy4(), ...extra }
}
