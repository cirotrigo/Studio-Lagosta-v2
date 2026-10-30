/**
 * O CENÁRIO do #15 `minimal-tipografico-lista` com FONTES REAIS: Georgia (regular e bold itálica, a segunda voz) do
 * sistema e Montserrat (OFL) de um kit local, registradas no `@napi-rs/canvas` — o MESMO motor do medidor do servidor
 * (`createServerTextBoxMeasurer`, real, não dublado) e do renderizador da prova PNG. Sem fonte no disco, o teste que a
 * usa é pulado e diz por quê (nunca cai calado num medidor sintético).
 *
 * A marca é SINTÉTICA (página de assinatura gerada aqui; `fundoClaro` de teste): nenhuma marca real é consultada.
 */
import { noPisoDe1310 } from './compositor'
import { existsSync } from 'node:fs'
import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { CenarioDoCompositor, PaginaDeAssinatura } from './compositor'
import { dataUrl } from './fixture'
import { logoSintetica, variantesClaraEEscura } from './sinteticos'

export const CLARO = '#F4EFE6'
export const TINTA = '#1F1F1F'
export const ID_LISTA = 'minimal-tipografico-lista'

const SUPLEMENTAR = '/System/Library/Fonts/Supplemental'
/** As fontes reais: [arquivo, família]. A Montserrat vem de um kit local do checkout compartilhado (só leitura). */
export const FONTES_REAIS: Array<[string, string]> = [
  [`${SUPLEMENTAR}/Georgia.ttf`, 'Georgia'],
  // O compositor não lê `fontStyle` da assinatura: a itálica entra como família própria, como a fonte do projeto entra.
  [`${SUPLEMENTAR}/Georgia Bold Italic.ttf`, 'Georgia Italica'],
  ['/Users/cirotrigo/Documents/Studio-Lagosta-v2/design-canvas/tero-semana1/Montserrat-Regular.ttf', 'Montserrat'],
  ['/Users/cirotrigo/Documents/Studio-Lagosta-v2/design-canvas/tero-semana1/Montserrat-SemiBold.ttf', 'Montserrat'],
]
export const fontesNoDisco = () => FONTES_REAIS.every(([arquivo]) => existsSync(arquivo))

/** Registra as fontes reais no canvas e devolve o medidor REAL do servidor. */
export async function medidorComFontesReais(importarReal: () => Promise<typeof import('@/lib/creatives/server-text-measurer')>): Promise<{ medir: MeasureTextBox; registradas: string[] }> {
  const { GlobalFonts } = await import('@napi-rs/canvas')
  for (const [arquivo, familia] of FONTES_REAIS) GlobalFonts.registerFromPath(arquivo, familia)
  const registradas = [...new Set(GlobalFonts.families.map((f: { family: string }) => f.family))].filter((f) => f === 'Georgia' || f === 'Georgia Italica' || f === 'Montserrat')
  return { medir: await (await importarReal()).createServerTextBoxMeasurer(), registradas }
}

const texto = (papel: string, y: number, estilo: Record<string, unknown>, grupo: string): Layer =>
  ({
    id: `${papel}-pagina`,
    name: papel,
    type: 'text',
    visible: true,
    locked: false,
    order: 1,
    isDynamic: true,
    position: { x: 92, y },
    size: { width: 896, height: 120 },
    content: 'Texto da assinatura',
    style: { lineHeight: 1.1, color: TINTA, textAlign: 'left', ...estilo },
    textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: Number(estilo.lineHeight ?? 1.1) } },
    metadata: { groupId: grupo, compositor: { papel } },
  }) as Layer

/** A página de assinatura da marca sintética: manchete Georgia com segunda voz Georgia bold itálica, lista e rodapé Montserrat. */
export async function paginaDoCenario15(
  id: string,
  tinta = TINTA,
  /** Um FILETE do arranjo preso ao apoio (`ornamentoDe`): `abaixo` px sob a caixa do texto da página, `altura` px. */
  filete?: { abaixo: number; altura: number },
): Promise<PaginaDeAssinatura> {
  const comTinta = (l: Layer) => ({ ...l, style: { ...l.style, color: tinta } }) as Layer
  const doFilete: Layer[] = filete
    ? [
        {
          id: 'filete-apoio',
          name: 'Filete',
          type: 'shape',
          visible: true,
          locked: false,
          order: 2,
          position: { x: 98, y: 900 + 46 + filete.abaixo },
          size: { width: 60, height: filete.altura },
          rotation: 0,
          style: { shapeType: 'rectangle', fill: TINTA },
          metadata: { groupId: 'g-lista', ornamentoDe: 'el-apoio' },
        } as Layer,
      ]
    : []
  return {
    id,
    name: `Assinatura sintética ${id}`,
    width: 1080,
    height: 1920,
    tags: [],
    background: '#808080',
    layers: [
      texto('headline', 300, { fontFamily: 'Georgia', fontSize: 104, lineHeight: 1.05 }, 'g-manchete'),
      texto('headline2', 520, { fontFamily: 'Georgia Italica', fontSize: 104, lineHeight: 1.05, fontWeight: 'bold' }, 'g-manchete'),
      { ...texto('apoio', 900, { fontFamily: 'Montserrat', fontSize: 38, lineHeight: 1.2 }, 'g-lista'), size: { width: 896, height: 46 }, metadata: { groupId: 'g-lista', compositor: { papel: 'apoio' }, elementId: 'el-apoio' } } as Layer,
      ...doFilete,
      texto('cta', 1600, { fontFamily: 'Montserrat', fontSize: 26, lineHeight: 1.2 }, 'g-cta'),
      texto('servico', 1600, { fontFamily: 'Montserrat', fontSize: 26, lineHeight: 1.2, fontWeight: '600' }, 'g-servico'),
      { id: 'logo-pagina', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 830, y: 200 }, size: { width: 160, height: 80 }, fileUrl: dataUrl(await logoSintetica('#808080')), style: { objectFit: 'contain' } } as Layer,
    ].map(comTinta),
  }
}

/** O cenário do compositor real para o #15: sem foto, `fundoClaro` de teste na RAIZ de `Project.assinatura`. */
export async function cenario15(pagina: PaginaDeAssinatura, medir: MeasureTextBox, assinatura: Record<string, unknown> = { fundoClaro: CLARO }): Promise<CenarioDoCompositor> {
  return {
    projeto: { id: 9002, assinatura: noPisoDe1310(assinatura), logoDoProjeto: null, logosDoProjeto: (await variantesClaraEEscura()).map((l) => ({ fileUrl: l.fileUrl, isProjectLogo: true })) },
    paginasDeAssinatura: [pagina],
    foto: null,
    candidatasDoVeu: [],
    catalogo: null,
    medidor: medir,
  }
}

/**
 * A copy autoral do #15: manchete de 3 linhas com a última na SEGUNDA VOZ (declarada pelo autor), a lista de 3 itens
 * (o terceiro longo o bastante para a escada encolher a lista — a casa nunca quebra a linha do autor), o cta e o
 * serviço — as duas colunas do rodapé.
 */
export const COPY_15 = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat', em: '2026-10-24T12:00:00.000Z' },
  revisoes: [],
  blocos: [
    { id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Algo', 'novo feito', 'para você'], estilo: { linhasNaVoz2: [2] } },
    { id: 'lista', funcao: 'apoio', ordem: 1, linhas: ['Artesanal', 'Sustentável', 'Produzido localmente, com ingredientes da estação'] },
    { id: 'chamada', funcao: 'cta', ordem: 2, linhas: ['Compre em nosso site'] },
    { id: 'endereco', funcao: 'servico', ordem: 3, linhas: ['www.restaurante.com.br'] },
  ],
}

/** A spec do #15: SEM foto, com o contrato. */
export function spec15(variante: string, extra: Record<string, unknown> = {}) {
  return { projectId: 9002, formato: 'story', preferencias: { variante }, arquetipo: { id: ID_LISTA }, copyAutoral: COPY_15, ...extra }
}
