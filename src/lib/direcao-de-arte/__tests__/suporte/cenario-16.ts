/**
 * O CENÁRIO do #16 `minimal-tipografico-convite` com FONTES REAIS (as do #15: Georgia e Georgia bold itálica do sistema,
 * Montserrat de um kit local), no medidor REAL do servidor. A marca é SINTÉTICA: página de assinatura gerada aqui, com o
 * prefixo "→ " no cta; `fundoClaro` e destaque dourado de teste. Nenhuma marca real é consultada.
 */
import type { Layer } from '@/types/template'
import type { CenarioDoCompositor, PaginaDeAssinatura } from './compositor'
import { CLARO, TINTA } from './cenario-15'
import { dataUrl } from './fixture'
import { logoSintetica, variantesClaraEEscura } from './sinteticos'

export { CLARO, TINTA, fontesNoDisco, medidorComFontesReais } from './cenario-15'
export const ID_CONVITE = 'minimal-tipografico-convite'
/** O destaque de cor da marca sintética: as cantoneiras o seguem (o da manchete). */
export const DOURADO = '#B08D57'

const texto = (papel: string, y: number, estilo: Record<string, unknown>, grupo: string, content = 'Texto da assinatura'): Layer =>
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
    content,
    style: { lineHeight: 1.1, color: TINTA, textAlign: 'center', ...estilo },
    textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: Number(estilo.lineHeight ?? 1.1) } },
    metadata: { groupId: grupo, compositor: { papel } },
  }) as Layer

/**
 * A página de assinatura do convite: pré Montserrat, manchete Georgia com segunda voz Georgia bold itálica, apoio,
 * serviço e cta Montserrat — o cta com o PREFIXO "→ " da marca (`aplicarPrefixo`). `logo` = a tinta da logo da página.
 * `semCta` tira o estilo do cta (a recusa 422 de hoje).
 */
export async function paginaDoCenario16(id: string, opcoes: { logo?: string; semCta?: boolean } = {}): Promise<PaginaDeAssinatura> {
  return {
    id,
    name: `Assinatura sintética ${id}`,
    width: 1080,
    height: 1920,
    tags: [],
    background: '#808080',
    layers: [
      texto('pre', 200, { fontFamily: 'Montserrat', fontSize: 30, lineHeight: 1.2, letterSpacing: 2 }, 'g-pre'),
      texto('headline', 300, { fontFamily: 'Georgia', fontSize: 78, lineHeight: 1.05 }, 'g-manchete'),
      texto('headline2', 400, { fontFamily: 'Georgia Italica', fontSize: 78, lineHeight: 1.05, fontWeight: 'bold' }, 'g-manchete'),
      texto('apoio', 900, { fontFamily: 'Montserrat', fontSize: 30, lineHeight: 1.2 }, 'g-apoio'),
      texto('servico', 1100, { fontFamily: 'Montserrat', fontSize: 28, lineHeight: 1.2, fontWeight: '600' }, 'g-servico'),
      ...(opcoes.semCta ? [] : [texto('cta', 1600, { fontFamily: 'Montserrat', fontSize: 26, lineHeight: 1.2 }, 'g-cta', '→ Reserve pelo site')]),
      { id: 'logo-pagina', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 460, y: 120 }, size: { width: 160, height: 80 }, fileUrl: dataUrl(await logoSintetica(opcoes.logo ?? '#808080')), style: { objectFit: 'contain' } } as Layer,
    ],
  }
}

/**
 * O cenário do compositor real para o #16: sem foto, `fundoClaro` e destaque dourado de teste na RAIZ de
 * `Project.assinatura`. `variantes` = as logos do projeto (`isProjectLogo`); padrão, a clara e a escura sintéticas.
 */
export async function cenario16(
  pagina: PaginaDeAssinatura,
  medir: CenarioDoCompositor['medidor'],
  assinatura: Record<string, unknown> = { fundoClaro: CLARO, destaque: { fill: DOURADO } },
  variantes?: Array<{ fileUrl: string; isProjectLogo: true }>,
): Promise<CenarioDoCompositor> {
  return {
    projeto: { id: 9002, assinatura, logoDoProjeto: null, logosDoProjeto: variantes ?? (await variantesClaraEEscura()) },
    paginasDeAssinatura: [pagina],
    foto: null,
    candidatasDoVeu: [],
    catalogo: null,
    medidor: medir,
  }
}

/** A copy autoral do convite: pré, manchete de 2 linhas com a última na SEGUNDA VOZ, apoio, serviço e a linha final (cta). */
export const COPY_16 = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat', em: '2026-10-24T12:00:00.000Z' },
  revisoes: [],
  blocos: [
    { id: 'convite', funcao: 'pre', ordem: 0, linhas: ['Você é convidado'] },
    { id: 'manchete', funcao: 'headline', ordem: 1, linhas: ['Noite de', 'vinhos'], estilo: { linhasNaVoz2: [1] } },
    { id: 'detalhe', funcao: 'apoio', ordem: 2, linhas: ['Harmonização com o chef'] },
    { id: 'quando', funcao: 'servico', ordem: 3, linhas: ['Sexta, 14 de novembro · 20h'] },
    { id: 'site', funcao: 'cta', ordem: 4, linhas: ['www.casa.com.br'] },
  ],
}

/** A spec do #16: SEM foto, com o contrato. */
export function spec16(variante: string, extra: Record<string, unknown> = {}) {
  return { projectId: 9002, formato: 'story', preferencias: { variante }, arquetipo: { id: ID_CONVITE, versao: 1 }, copyAutoral: COPY_16, ...extra }
}
