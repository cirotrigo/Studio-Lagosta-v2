/**
 * O CENÁRIO do #5 `minimal-fb-topo-centro` com FONTES REAIS (as do #4/#15: Georgia e Georgia bold itálica do sistema,
 * Montserrat de um kit local), no medidor REAL do servidor. A marca é SINTÉTICA ("Marca sintética #5"): página de
 * assinatura gerada aqui (manchete com a voz 2, apoio e serviço, centrados), as duas variantes da logo (clara e escura) e
 * a foto gerada pela mesma conta do #4 (`fotoDoCenario4`: o alto até 40% com a luz `topo`, a base de 55% com a luz `base`)
 * — nenhuma foto, logo ou marca real é consultada.
 *
 * Diferença em relação ao #4: o texto mora no TOPO (logo, manchete e apoio na mesma faixa) e na base só o serviço, de uma
 * linha, envolvido pela pílula de contorno. A luz `base` é a que a pílula e o serviço leem; a `topo`, a da logo e da manchete.
 */
import { noPisoDe1310 } from './compositor'
import type { Layer } from '@/types/template'
import type { CenarioDoCompositor, PaginaDeAssinatura } from './compositor'
import { dataUrl } from './fixture'
import { logoSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './sinteticos'

export { fontesNoDisco, medidorComFontesReais } from './cenario-15'
export { fotoDoCenario4 as fotoDoCenario5, LOGO_CLARA, LOGO_ESCURA, DIMENSOES, BRANCO } from './cenario-4'
export const ID_TOPO_CENTRO = 'minimal-fb-topo-centro'
export const PROJETO_5 = 9005
export const TINTA_ESCURA = '#1E1E1E'
/** A identidade da foto na spec: os BYTES vêm do cenário, pelo dublê do fetch. */
export const FOTO_URL = 'https://fotos.test/topo-centro-5.png'

type PapelDaPagina5 = 'headline' | 'headline2' | 'apoio' | 'servico'

const texto = (papel: PapelDaPagina5, y: number, estilo: Record<string, unknown>, grupo: string): Layer =>
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
 * A página de assinatura do #5: manchete Georgia (com a segunda voz Georgia bold itálica), apoio e serviço Montserrat, na
 * `tinta` (padrão branco). `logo` = a tinta da logo que a página desenha (padrão a clara). `corpoDoServico` = o corpo do
 * serviço (padrão 30, o do preflight).
 */
export async function paginaDoCenario5(id: string, opcoes: { tinta?: string; logo?: string; corpoDoServico?: number; corpoDaManchete?: number } = {}): Promise<PaginaDeAssinatura> {
  const cor = opcoes.tinta ?? '#FFFFFF'
  const corpo = opcoes.corpoDaManchete ?? 78
  return {
    id,
    name: `Assinatura sintética #5 ${id}`,
    width: 1080,
    height: 1920,
    tags: [],
    background: '#808080',
    layers: [
      texto('headline', 300, { fontFamily: 'Georgia', fontSize: corpo, lineHeight: 1.05, color: cor }, 'g-manchete'),
      texto('headline2', 390, { fontFamily: 'Georgia Italica', fontSize: corpo, lineHeight: 1.05, fontWeight: 'bold', color: cor }, 'g-manchete'),
      texto('apoio', 560, { fontFamily: 'Montserrat', fontSize: 36, lineHeight: 1.2, color: cor }, 'g-apoio'),
      texto('servico', 1590, { fontFamily: 'Montserrat', fontSize: opcoes.corpoDoServico ?? 30, lineHeight: 1.2, fontWeight: '600', color: cor }, 'g-servico'),
      { id: 'logo-pagina', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 460, y: 200 }, size: { width: 160, height: 80 }, fileUrl: dataUrl(await logoSintetica(opcoes.logo ?? '#F5F5F5')), style: { objectFit: 'contain' } } as Layer,
    ],
  }
}

/**
 * O cenário do compositor real para o #5. `foto` = os bytes servidos pelo dublê; `variantes` = as logos do projeto
 * (`isProjectLogo`), padrão a clara e a escura; `assinatura` = os números do projeto (a área segura mais apertada do H-07).
 */
export async function cenario5(
  pagina: PaginaDeAssinatura,
  medir: CenarioDoCompositor['medidor'],
  opcoes: { foto: Buffer; assinatura?: Record<string, unknown>; catalogo?: CenarioDoCompositor['catalogo']; variantes?: Array<{ fileUrl: string; isProjectLogo: true }> },
): Promise<CenarioDoCompositor> {
  return {
    projeto: { id: PROJETO_5, assinatura: noPisoDe1310(opcoes.assinatura ?? {}), logoDoProjeto: null, logosDoProjeto: opcoes.variantes ?? (await variantesClaraEEscura()) },
    paginasDeAssinatura: [pagina],
    foto: { url: dataUrl(opcoes.foto), bytes: opcoes.foto },
    candidatasDoVeu: [VEU_ESCURO, VEU_CLARO],
    catalogo: opcoes.catalogo ?? null,
    medidor: medir,
  }
}

/** A copy autoral do #5: manchete (com a voz 2 nas linhas declaradas), apoio opcional e serviço de uma linha. */
export function copy5(args: { manchete?: string[]; voz2?: number[]; apoio?: string[]; servico?: string[]; extras?: Array<{ id: string; funcao: string; linhas: string[] }> } = {}) {
  const blocos = [
    { id: 'manchete', funcao: 'headline', linhas: args.manchete ?? ['Noite de', 'vinhos'], ...(args.voz2 !== undefined ? (args.voz2.length ? { estilo: { linhasNaVoz2: args.voz2 } } : {}) : { estilo: { linhasNaVoz2: [1] } }) },
    ...(args.apoio ? [{ id: 'detalhe', funcao: 'apoio', linhas: args.apoio }] : []),
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

/** A spec do #5: COM foto (identidade fixa por padrão), o contrato e a variante pedida. */
export function spec5(variante: string, extra: Record<string, unknown> = {}) {
  return { projectId: PROJETO_5, formato: 'story', preferencias: { variante }, arquetipo: { id: ID_TOPO_CENTRO, versao: 1 }, foto: { url: FOTO_URL }, copyAutoral: copy5(), ...extra }
}
