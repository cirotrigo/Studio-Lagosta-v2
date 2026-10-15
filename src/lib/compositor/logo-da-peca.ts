/**
 * A CONFERÊNCIA DA LOGO NA PEÇA COMPOSTA (CP3, 15/10/2026): o passo que o
 * compositor roda DEPOIS da régua, com as camadas finais — foto no corte,
 * gradientes e tratamentos já desenhados — e que prova, pixel a pixel, que a
 * logo lê onde ela está (`legibilidade-da-logo.ts`).
 *
 * Dois modos, e o que cada um pode fazer:
 *
 * - **Com arquétipo** (o caminho novo): a logo desenhada que não lê é trocada
 *   por outra variante AUTORIZADA, ou — na logo automática do centro-óptico —
 *   levada a outro canto já autorizado pelo sistema. Primeiro ELIMINA (não
 *   carregou, sem pixel, p10 < limiar); só depois a preferência: a ordem das
 *   variantes (a gravada na recomposição, depois a explícita da página, depois
 *   as do projeto) e, dentro da variante, a ordem dos cantos (o atual ou
 *   congelado primeiro, depois os mais calmos). Nenhuma lê → recusa
 *   `LOGO_SEM_VARIANTE_LEGIVEL`; alguma não carregou e nenhuma das outras lê →
 *   `LOGO_INDISPONIVEL` (não dá para afirmar que "nenhuma lê"). A logo FIXA do
 *   arquétipo nunca muda de lugar: só a variante. Nenhum véu novo é desenhado
 *   para salvar a logo; o véu automático da logo que não a salvou SAI — e as
 *   outras variantes são medidas SEM ele (decisão: o véu da logo existe só para
 *   a logo; mantê-lo para salvar outra variante seria o "véu para a logo" que o
 *   owner proibiu — a confirmar com ele).
 *
 * - **Sem arquétipo** (o legado): nada muda na peça — o baseline da base é
 *   idêntico. A medida e a mesma grade entram no DIAGNÓSTICO e nos avisos:
 *   `LOGO_SEM_VARIANTE_LEGIVEL` quando nenhuma variante lê em nenhum canto;
 *   `PREFERENCIA_INVIAVEL` quando a preferência (canto pedido, posição da
 *   página) é o que impede a solução que existe.
 *
 * Determinístico: mesma peça, mesmas logos, mesma escolha.
 */

import type { Layer } from '@/types/template'
import type { Rect } from '@/lib/creatives/halo/halo'
import { CreativeError } from '@/lib/creatives/errors'
import {
  ALFA_VISIVEL_DA_LOGO,
  LIMIAR_DE_CONTRASTE_DA_LOGO,
  LOGO_INDISPONIVEL,
  LOGO_SEM_VARIANTE_LEGIVEL,
  PERCENTIL_DA_LOGO,
  bytesDaLogo,
  escolherLogoLegivel,
  fundoSemALogo,
  medirLogoNoFundo,
  razaoDoArquivo,
  resumoDaMedida,
  type AvaliacaoDaLogo,
  mesmaVariante,
  type MedidaDaLogo,
  type PosicaoDaLogo,
  type RasterRGB,
  type VarianteCarregada,
  type VarianteDaLogo,
} from './legibilidade-da-logo'
import type { Canto } from './spec'

/** Por URL: os bytes e a proporção (ou o motivo de não ter carregado). A variante (origem, ids) é de quem pede. */
export type CacheDeLogos = Map<string, Promise<Omit<VarianteCarregada, 'variante'>>>

/** O diagnóstico da logo (CP3) em `DiagnosticoDaComposicao.logo.legibilidade`. */
export interface LegibilidadeDaLogo {
  /** `nao-medida`: o fundo não renderizou ou a logo desenhada não carregou (só no legado; com arquétipo é recusa). */
  estado: 'medida' | 'nao-medida'
  motivo?: string
  limiar: number
  alfaMinimo: number
  percentil: number
  /** A variante DESENHADA ao final, o canto e a caixa dela. */
  variante: VarianteDaLogo
  canto: Canto
  posicao: Rect
  medida: MedidaDaLogo | null
  legivel: boolean
  /**
   * O que a conferência fez: `mantida` (a desenhada lê), `reproduzida` (a gravada na recomposição lê e foi
   * desenhada), `variante-trocada`, `canto-trocado`, `variante-e-canto-trocados` (só com arquétipo), ou
   * `sem-mudanca` (legado: a peça não muda, o diagnóstico diz).
   */
  escolha: 'mantida' | 'reproduzida' | 'variante-trocada' | 'canto-trocado' | 'variante-e-canto-trocados' | 'veu-removido' | 'sem-mudanca'
  /** Legado: o código que a conferência SINALIZA (a peça sai mesmo assim; o gate é do CP5). */
  codigo?: typeof LOGO_SEM_VARIANTE_LEGIVEL | 'PREFERENCIA_INVIAVEL'
  /** Legado: a primeira variante × canto que leria. */
  alternativa?: { variante: VarianteDaLogo; canto: Canto; posicao: Rect; medida: MedidaDaLogo }
  /** Toda a grade medida, na ordem de preferência. */
  avaliacoes: Array<{ variante: VarianteDaLogo; canto: Canto; posicao: Rect; estado: AvaliacaoDaLogo['estado']; medida: MedidaDaLogo | null; motivo?: string }>
  /** Os véus automáticos da logo que saíram (não a salvaram). */
  veusRemovidos?: string[]
  /** Legado: a explicação, que NÃO vai aos avisos da peça (o caminho sem arquétipo não muda em nada visível). */
  mensagem?: string
}

export interface ArgsDaConferencia {
  layers: Layer[]
  canvas: { width: number; height: number }
  background: string
  /** A camada da logo de canto (id `logo`), como o passo 5 a desenhou. */
  logo: Layer
  /** A variante desenhada no passo 5 (a da assinatura). */
  desenhada: VarianteDaLogo
  /** As variantes autorizadas, em ordem (a explícita primeiro). */
  variantes: VarianteDaLogo[]
  /** Recomposição: a variante gravada na peça — vai primeiro. */
  gravada?: VarianteDaLogo | null
  cantoAtual: Canto
  /**
   * Os cantos alternativos AUTORIZADOS para o tamanho da logo (sem colisão, dentro da área), em ordem de
   * preferência; `[]` para a logo fixa do arquétipo. Recebe a largura e devolve as caixas para a altura dada.
   */
  posicoesAlternativas: (tamanho: { width: number; height: number }) => PosicaoDaLogo[]
  /**
   * A caixa que uma variante de OUTRO tamanho ocuparia no canto atual — a mesma regra dos cantos alternativos
   * (pela largura, no canto), ou o contain da caixa materializada na logo fixa. A variante desenhada é medida na
   * caixa EXATA em que foi desenhada (`logo.position`/`size`), nunca numa caixa recalculada.
   */
  caixaNoCantoAtual: (tamanho: { width: number; height: number }) => Rect
  /**
   * A caixa está livre de texto e dentro da área (o mesmo critério das alternativas) — conferida por CAIXA, porque
   * outra variante no canto atual pode ser mais alta que a desenhada. Colisão ELIMINA, mesmo legível.
   */
  livre: (caixa: Rect) => boolean
  /** Os véus automáticos da logo na peça (ids das camadas): saem quando a logo desenhada não lê (arquétipo). */
  veusDaLogo: ReadonlySet<string>
  modo: 'arquetipo' | 'legado'
  /** Legado: a preferência que segurou a logo no canto atual (`pedido` da spec ou a posição da página). */
  preferencia?: 'pedido' | 'pagina' | null
  cache?: CacheDeLogos
}

export interface ResultadoDaConferencia {
  layers: Layer[]
  legibilidade: LegibilidadeDaLogo
  avisos: string[]
  variante: VarianteDaLogo
  canto: Canto
  veusRemovidos: string[]
}

const arred = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })

/**
 * A caixa de uma variante DENTRO da caixa dada (contain pela proporção do
 * arquivo): rente ao lado do canto, centrada na altura. A mesma proporção dá a
 * mesma caixa.
 */
export function caixaDaVariante(caixa: Rect, razao: number, canto: Canto): Rect {
  const w = Math.min(caixa.width, razao > 0 ? caixa.height / razao : caixa.width)
  const h = w * razao
  const x = canto.endsWith('direito') ? caixa.x + caixa.width - w : caixa.x
  const y = caixa.y + (caixa.height - h) / 2
  return arred({ x, y, width: w, height: h })
}

async function carregar(v: VarianteDaLogo, cache?: CacheDeLogos): Promise<VarianteCarregada> {
  const existente = cache?.get(v.url)
  if (existente) return { variante: v, ...(await existente) }
  const p = (async (): Promise<Omit<VarianteCarregada, 'variante'>> => {
    try {
      const bytes = await bytesDaLogo(v.url)
      const razao = await razaoDoArquivo(bytes, v.url)
      return { bytes, razao }
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro)
      return { bytes: null, razao: null, indisponivel: motivo }
    }
  })()
  cache?.set(v.url, p)
  return { variante: v, ...(await p) }
}

/** O nome do arquivo na URL (sem query), para o operador saber QUAL logo; data URL vira "(embutida)". */
const nomeDoArquivo = (url: string): string => {
  if (url.startsWith('data:')) return '(embutida)'
  const caminho = url.split('?')[0].split('#')[0]
  return decodeURIComponent(caminho.slice(caminho.lastIndexOf('/') + 1)) || url
}
const rotulo = (v: VarianteDaLogo) => `${v.origem === 'pagina' ? 'a logo da página de assinatura' : 'a logo principal do projeto'} (${nomeDoArquivo(v.url)})`

export async function conferirLogoDaPeca(args: ArgsDaConferencia): Promise<ResultadoDaConferencia> {
  const contrato = { limiar: LIMIAR_DE_CONTRASTE_DA_LOGO, alfaMinimo: ALFA_VISIVEL_DA_LOGO, percentil: PERCENTIL_DA_LOGO }
  const caixaAtual = arred({ x: args.logo.position.x, y: args.logo.position.y, width: args.logo.size.width, height: args.logo.size.height })
  const avisos: string[] = []

  const naoMedida = (motivo: string): ResultadoDaConferencia => ({
    layers: args.layers,
    legibilidade: { estado: 'nao-medida', motivo, ...contrato, variante: args.desenhada, canto: args.cantoAtual, posicao: caixaAtual, medida: null, legivel: false, escolha: 'sem-mudanca', avaliacoes: [] },
    avisos,
    variante: args.desenhada,
    canto: args.cantoAtual,
    veusRemovidos: [],
  })

  // A ordem das variantes: a gravada (recomposição) primeiro, se ainda é autorizada; depois a lista autorizada.
  const autorizada = (v: VarianteDaLogo | null | undefined) => !!v && args.variantes.some((a) => mesmaVariante(a, v))
  const ordem: VarianteDaLogo[] = []
  if (args.gravada) {
    if (autorizada(args.gravada)) ordem.push(args.variantes.find((a) => mesmaVariante(a, args.gravada!))!)
    else avisos.push(`A variante da logo gravada nesta arte (${rotulo(args.gravada)}) já não é autorizada: a conferência partiu da logo da assinatura.`)
  }
  for (const v of args.variantes) if (!ordem.some((o) => o.url === v.url)) ordem.push(v)
  // Nenhuma variante autorizada (a desenhada não entra "por definição"): sem o que medir, dito.
  if (ordem.length === 0) {
    if (args.modo === 'arquetipo') throw new CreativeError(LOGO_SEM_VARIANTE_LEGIVEL, 'Nenhuma variante autorizada da logo está cadastrada (a logo desenhada não é a da página de assinatura nem uma Logo principal do projeto): não há o que medir, e nenhuma variante é fabricada.', 422, { variantes: [], desenhada: args.desenhada })
    return naoMedida('nenhuma variante autorizada cadastrada')
  }
  const primeira = ordem[0]

  // 1. As variantes carregadas (todas: a grade é medida inteira) e o fundo como está.
  const carregadas = await Promise.all(ordem.map((v) => carregar(v, args.cache)))
  const daPrimeira = carregadas[0]
  if (!daPrimeira.bytes || daPrimeira.razao === null) {
    if (args.modo === 'arquetipo') throw new CreativeError(LOGO_INDISPONIVEL, `A logo (${rotulo(primeira)}) não pôde ser carregada: ${daPrimeira.indisponivel}. A leitura não foi medida — a peça não sai sem a prova.`, 503, { variante: primeira, motivo: daPrimeira.indisponivel })
    return naoMedida(`${rotulo(primeira)} não carregou (${daPrimeira.indisponivel})`)
  }
  let fundo: RasterRGB
  try {
    fundo = await fundoSemALogo({ layers: args.layers, canvas: args.canvas, background: args.background, semAsCamadas: new Set([args.logo.id]) })
  } catch (erro) {
    const motivo = `o fundo da peça não renderizou (${erro instanceof Error ? erro.message : String(erro)})`
    if (args.modo === 'arquetipo') throw new CreativeError(LOGO_INDISPONIVEL, `A leitura da logo não foi medida: ${motivo}.`, 503, { etapa: 'render' })
    return naoMedida(motivo)
  }

  // 2. A desenhada (ou a gravada) onde está. A caixa de cada variante: a DESENHADA é medida na caixa exata em que o
  //    render a desenha; outra variante no canto atual ocupa a caixa que a regra do canto lhe dá (`caixaNoCantoAtual`,
  //    pela largura — ou o contain da caixa materializada na logo fixa), a mesma que teria num canto alternativo.
  const caixaDe = (c: VarianteCarregada, canto: Canto): Rect => {
    if (c.variante.url === args.desenhada.url && canto === args.cantoAtual) return caixaAtual
    const largura = caixaAtual.width
    return canto === args.cantoAtual ? args.caixaNoCantoAtual({ width: largura, height: Math.round(largura * (c.razao ?? 0)) }) : caixaAtual
  }
  const avaliar = async (c: VarianteCarregada, canto: Canto, posicao: Rect, f: RasterRGB, livre = true): Promise<AvaliacaoDaLogo> => {
    if (!c.bytes || c.razao === null) return { variante: c.variante, canto, posicao, medida: null, estado: 'indisponivel', motivo: c.indisponivel }
    if (!livre) return { variante: c.variante, canto, posicao, medida: null, estado: 'fora-da-area', motivo: 'o canto encosta num texto ou sai da área válida' }
    // Arquivo cuja cabeça decodifica e o corpo não (PNG/JPEG truncado) falha só aqui, no resize da grade: é
    // `indisponivel` (transitório), nunca uma exceção que derrube a peça legada (revisor F, 15/10/2026).
    let medida: MedidaDaLogo | null
    try {
      medida = await medirLogoNoFundo({ bytes: c.bytes, rect: posicao, fundo: f, url: c.variante.url })
    } catch (erro) {
      return { variante: c.variante, canto, posicao, medida: null, estado: 'indisponivel', motivo: `não decodificou (${erro instanceof Error ? erro.message : String(erro)})` }
    }
    if (!medida) return { variante: c.variante, canto, posicao, medida: null, estado: 'sem-pixels', motivo: 'nenhum pixel visível da logo sobre o fundo' }
    return { variante: c.variante, canto, posicao, medida, estado: medida.legivel ? 'legivel' : 'ilegivel' }
  }
  const caixaDaPrimeira = caixaDe(daPrimeira, args.cantoAtual)
  const atual = await avaliar(daPrimeira, args.cantoAtual, caixaDaPrimeira, fundo, args.livre(caixaDaPrimeira))
  const compacta = (a: AvaliacaoDaLogo): LegibilidadeDaLogo['avaliacoes'][number] => ({ variante: a.variante, canto: a.canto, posicao: a.posicao, estado: a.estado, medida: a.medida, ...(a.motivo ? { motivo: a.motivo } : {}) })
  const desenhar = (a: AvaliacaoDaLogo): Layer[] =>
    args.layers.map((l) =>
      l.id !== args.logo.id
        ? l
        : { ...l, fileUrl: a.variante.url, position: { x: a.posicao.x, y: a.posicao.y }, size: { width: a.posicao.width, height: a.posicao.height }, metadata: { ...(l.metadata ?? {}), compositor: { ...((l.metadata as { compositor?: Record<string, unknown> } | undefined)?.compositor ?? {}), canto: a.canto } } },
    )
  if (atual.estado === 'legivel') {
    const reproduzida = primeira.url !== args.desenhada.url
    return {
      layers: reproduzida ? desenhar(atual) : args.layers,
      legibilidade: { estado: 'medida', ...contrato, variante: primeira, canto: args.cantoAtual, posicao: atual.posicao, medida: atual.medida, legivel: true, escolha: reproduzida ? 'reproduzida' : 'mantida', avaliacoes: [compacta(atual)] },
      avisos,
      variante: primeira,
      canto: args.cantoAtual,
      veusRemovidos: [],
    }
  }

  // 3. A desenhada não lê: a grade variante × canto. Com arquétipo, sem os véus automáticos da logo (não a salvaram,
  //    e nenhum véu novo nasce para a logo); no legado a peça é a que está.
  const veusRemovidos = args.modo === 'arquetipo' ? args.layers.filter((l) => args.veusDaLogo.has(l.id)).map((l) => l.id) : []
  const camadasBase = veusRemovidos.length > 0 ? args.layers.filter((l) => !args.veusDaLogo.has(l.id)) : args.layers
  const fundoDaGrade = veusRemovidos.length > 0 ? await fundoSemALogo({ layers: camadasBase, canvas: args.canvas, background: args.background, semAsCamadas: new Set([args.logo.id]) }) : fundo
  const avaliacoes: AvaliacaoDaLogo[] = []
  for (const c of carregadas) {
    const caixaNoAtual = caixaDe(c, args.cantoAtual)
    const noCantoAtual = c === daPrimeira && veusRemovidos.length === 0 ? atual : await avaliar(c, args.cantoAtual, caixaNoAtual, fundoDaGrade, args.livre(caixaNoAtual))
    avaliacoes.push(noCantoAtual)
    if (c.razao === null) continue
    const largura = caixaAtual.width
    for (const p of args.posicoesAlternativas({ width: largura, height: Math.round(largura * c.razao) })) {
      if (p.canto === args.cantoAtual) continue
      avaliacoes.push(await avaliar(c, p.canto, p.rect, fundoDaGrade, args.livre(p.rect)))
    }
  }
  const { escolha, indisponiveis } = escolherLogoLegivel(avaliacoes)
  // O que cada célula da grade diz: a medida — ou POR QUE não mediu (não carregou; o canto colide). Uma logo que
  // leria mas encosta num texto nunca é rotulada "sem pixel visível" (revisor F, 15/10/2026).
  const descricao = (a: AvaliacaoDaLogo) => (a.estado === 'indisponivel' ? `não carregou (${a.motivo})` : a.estado === 'fora-da-area' ? `não medida: ${a.motivo}` : resumoDaMedida(a.medida))
  const resumoDaGrade = avaliacoes.map((a) => `${rotulo(a.variante)} no ${a.canto}: ${descricao(a)}`).join('; ')

  if (args.modo === 'legado') {
    const codigo: LegibilidadeDaLogo['codigo'] | undefined = escolha ? (escolha.canto !== args.cantoAtual && args.preferencia ? 'PREFERENCIA_INVIAVEL' : undefined) : indisponiveis.length === 0 ? LOGO_SEM_VARIANTE_LEGIVEL : undefined
    // Sem arquétipo NADA muda — nem os avisos (o baseline da base é idêntico): a explicação fica no diagnóstico.
    const mensagem =
      (atual.estado === 'fora-da-area'
        ? `A logo (${rotulo(primeira)}) não foi medida no ${args.cantoAtual}: ${atual.motivo}. `
        : `A logo (${rotulo(primeira)}) não lê no ${args.cantoAtual} pelo critério regional (${descricao(atual)}). `) +
        (escolha
          ? `Leria ${rotulo(escolha.variante)} no ${escolha.canto} (${resumoDaMedida(escolha.medida)})${codigo === 'PREFERENCIA_INVIAVEL' ? ` — a preferência (${args.preferencia === 'pedido' ? 'canto pedido' : 'posição da página'}) impede: PREFERENCIA_INVIAVEL` : ''}.`
          : indisponiveis.length > 0
            ? `Nenhuma das variantes que carregaram lê; ${indisponiveis.length} não carregou — sem conclusão.`
            : `Nenhuma variante autorizada lê em nenhum canto: ${LOGO_SEM_VARIANTE_LEGIVEL}.`) +
      ' Sem arquétipo a peça sai como está (só diagnóstico).'
    return {
      layers: args.layers,
      legibilidade: {
        estado: 'medida',
        ...contrato,
        variante: primeira,
        canto: args.cantoAtual,
        posicao: atual.posicao,
        medida: atual.medida,
        legivel: false,
        escolha: 'sem-mudanca',
        ...(codigo ? { codigo } : {}),
        ...(escolha && escolha.medida ? { alternativa: { variante: escolha.variante, canto: escolha.canto, posicao: escolha.posicao, medida: escolha.medida } } : {}),
        avaliacoes: avaliacoes.map(compacta),
        mensagem,
      },
      avisos,
      variante: primeira,
      canto: args.cantoAtual,
      veusRemovidos: [],
    }
  }

  if (!escolha) {
    const detalhes = { limiar: LIMIAR_DE_CONTRASTE_DA_LOGO, alfaMinimo: ALFA_VISIVEL_DA_LOGO, percentil: PERCENTIL_DA_LOGO, canto: args.cantoAtual, avaliacoes: avaliacoes.map(compacta), ...(avisos.length > 0 ? { avisos } : {}), ...(args.gravada ? { gravada: args.gravada, gravadaAutorizada: autorizada(args.gravada) } : {}) }
    if (indisponiveis.length > 0) {
      throw new CreativeError(LOGO_INDISPONIVEL, `Nenhuma variante da logo que carregou lê (${resumoDaGrade}), e ${indisponiveis.map(rotulo).join(', ')} não carregou: a conferência não pôde concluir.`, 503, { ...detalhes, indisponiveis })
    }
    throw new CreativeError(
      LOGO_SEM_VARIANTE_LEGIVEL,
      `Nenhuma variante autorizada da logo lê contra o fundo real (critério: p10 da diferença de luz pixel a pixel ≥ ${LIMIAR_DE_CONTRASTE_DA_LOGO}, alfa ≥ ${ALFA_VISIVEL_DA_LOGO}). ${resumoDaGrade}.${avisos.length > 0 ? ` ${avisos.join(' ')}` : ''} Nenhuma variante é fabricada e nenhum véu novo é desenhado para a logo: cadastre uma variante legível ou troque a foto.`,
      422,
      detalhes,
    )
  }
  const trocouVariante = escolha.variante.url !== primeira.url
  const trocouCanto = escolha.canto !== args.cantoAtual
  avisos.push(
    (trocouVariante || trocouCanto
      ? `A logo (${rotulo(primeira)}) não lia no ${args.cantoAtual} (${resumoDaMedida(atual.medida)}): ficou ${rotulo(escolha.variante)} no ${escolha.canto} (${resumoDaMedida(escolha.medida)}).`
      : `A logo (${rotulo(primeira)}) não lia no ${args.cantoAtual} sob o véu automático dela (${resumoDaMedida(atual.medida)}); sem o véu ela lê (${resumoDaMedida(escolha.medida)}).`) +
      (veusRemovidos.length > 0 ? ` O véu automático da logo (${veusRemovidos.join(', ')}) não a salvava e saiu.` : ''),
  )
  // A variante que entrou bem menor que a desenhada (proporção diferente contida na caixa): dito — o piso de tamanho da
  // marca não é medido aqui.
  if (trocouVariante && escolha.posicao.width < 0.6 * caixaAtual.width) avisos.push(`A variante que entrou (${rotulo(escolha.variante)}) ficou com ${Math.round(escolha.posicao.width)} px de largura, menos de 60% da logo desenhada (${caixaAtual.width} px): confira o tamanho da marca.`)
  return {
    layers: desenhar(escolha).filter((l) => !veusRemovidos.includes(l.id)),
    legibilidade: {
      estado: 'medida',
      ...contrato,
      variante: escolha.variante,
      canto: escolha.canto,
      posicao: escolha.posicao,
      medida: escolha.medida,
      legivel: true,
      escolha: trocouVariante && trocouCanto ? 'variante-e-canto-trocados' : trocouVariante ? 'variante-trocada' : trocouCanto ? 'canto-trocado' : 'veu-removido',
      avaliacoes: avaliacoes.map(compacta),
      ...(veusRemovidos.length > 0 ? { veusRemovidos } : {}),
    },
    avisos,
    variante: escolha.variante,
    canto: escolha.canto,
    veusRemovidos,
  }
}
