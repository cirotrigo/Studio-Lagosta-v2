/**
 * O ARQUÉTIPO DENTRO DO COMPOSITOR (T1a, 14/10/2026): as unidades posicionais
 * e a materialização delas. É o MESMO código no `compor` e no `medir-copy` —
 * "cabe" e "não cabe" saem da mesma conta, com a mesma coluna, a mesma
 * referência, a mesma versão e a mesma assinatura.
 *
 * Com arquétipo, cada PAPEL é uma unidade posicional própria: papéis que a
 * página de assinatura agrupa (headline + apoio no mesmo Cmd+G) NÃO se fundem
 * — cada um pousa na referência dele. A segunda voz (`headline2`) é a manchete
 * e vai na unidade da manchete. Do agrupamento da página fica só o estilo.
 */
import type { Layer } from '@/types/template'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'
import { checkTextGeometry, type MeasureTextBox, type TextGeometryIssue } from '@/lib/creatives/text-geometry'
import { empilhar, PISO_DE_ESCALA, type PilhaDeBlocos } from '../blocos'
import { extensoesDosElementos } from '../combinacoes'
import type { BlocoPreparado, BlocosPreparados } from '../preparar-blocos'
import type { Alinhamento, Papel } from '../spec'
import { envoltoriosDoArquetipo } from './acentos'
import { alinhaDoPapel, caixasMaximas, excedeAlturaDaReferencia, materializarArquetipo, papelDominante, type GeometriaEfetiva, type Materializacao, type RetanguloPx } from './materializar'
import type { ArquetipoDeLayout, FormatoDoArquetipo, PapelDeTexto } from './tipos'

/** O papel do arquétipo que posiciona um bloco: a segunda voz vai com a manchete. */
export const papelGeometrico = (papel: Papel): PapelDeTexto => (papel === 'headline2' ? 'headline' : papel) as PapelDeTexto

export interface UnidadeDoArquetipo {
  papel: PapelDeTexto
  blocos: BlocoPreparado[]
  /** A pilha dos TEXTOS: é ela que pousa na referência (os ornamentos não deslocam a âncora). */
  pilha: PilhaDeBlocos
  /**
   * A altura da MESMA pilha com o orçamento de cada bloco (`orcamentoDeAltura`), só para decidir descer a escala.
   * Ausente (unidade montada fora de `unidadesDoArquetipo`) = a pilha física, como antes.
   */
  alturaDoOrcamento?: number
  /** Quanto os ornamentos presos aos textos (ícone, filete, selo do arranjo) passam da pilha, de cada lado (px). */
  ornamentos: { esquerda: number; direita: number; topo: number; base: number }
  /**
   * Quanto os ornamentos de CADA texto passam da caixa DELE (px), na ordem de `blocos`. O envelope acima só diz o que sai
   * da pilha inteira: o filete sob o 1º item da lista que desce para o vão interno não sai da pilha e somia (#15, rodada 1).
   */
  ornamentosPorBloco: Array<{ esquerda: number; direita: number; topo: number; base: number }>
}

/** O `groupId` da unidade: a régua e o autofix agrupam por ele — papéis diferentes nunca no mesmo. */
export const grupoDaUnidade = (papel: PapelDeTexto) => `grupo-arq-${papel}`

/**
 * A logo presa a um arranjo da assinatura (ao lado do serviço) sai do arranjo:
 * com arquétipo, a posição da logo é do arquétipo, e o elemento duplicaria a
 * marca numa segunda posição. A logo continua na peça — uma vez, onde o
 * arquétipo manda. Devolve os blocos sem o elemento e os ids afetados.
 */
export function semLogoDosArranjos(montados: BlocoPreparado[]): { montados: BlocoPreparado[]; retiradas: string[] } {
  const retiradas: string[] = []
  const saida = montados.map((b) => {
    if (!b.elementos?.some((e) => e.logo)) return b
    retiradas.push(b.layer.id)
    const elementos = b.elementos.filter((e) => !e.logo)
    const { elementos: _e, escalaDosElementos: _s, ...resto } = b
    return elementos.length > 0 ? { ...resto, elementos, escalaDosElementos: b.escalaDosElementos } : resto
  })
  return { montados: saida, retiradas }
}

/**
 * Uma unidade por papel, na ordem de leitura do arquétipo; dentro dela, os
 * blocos na ordem da COPY (a segunda voz depois da manchete; o serviço
 * repartido na ordem das linhas do autor) — nunca na ordem vertical da página.
 *
 * A pilha que pousa na referência é a dos TEXTOS: os ornamentos que o arranjo
 * prende a eles (ícone, filete, selo) são desenhados como sempre, presos à
 * tinta, mas não deslocam a âncora do texto — a posição deles na página é
 * geometria da página. O quanto passam da pilha vai em `ornamentos`, e a
 * materialização confere que eles também cabem na zona efetiva.
 * O vão entre eles é o RITMO DA CASA (`vaoEntre`: a segunda voz encosta na
 * primeira), nunca o que a página de assinatura desenhou (`vaoAntes`, o
 * encaixe): esse sai da posição dos textos na página, e com arquétipo a página
 * não decide geometria nenhuma — nem dentro da referência.
 */
export function unidadesDoArquetipo(
  arquetipo: ArquetipoDeLayout,
  montados: BlocoPreparado[],
  gap: number,
  /** O vão entre os ITENS de cada papel de lista, em px (#15): vale no lugar do ritmo da casa, só dentro da lista. */
  vaoDaLista: Partial<Record<PapelDeTexto, number>> = {},
): UnidadeDoArquetipo[] {
  const ordem = new Map(arquetipo.papeis.map((p) => [p.papel, p.ordemDeLeitura]))
  const porPapel = new Map<PapelDeTexto, BlocoPreparado[]>()
  for (const b of montados) {
    const papel = papelGeometrico(b.papel)
    porPapel.set(papel, [...(porPapel.get(papel) ?? []), b])
  }
  return [...porPapel.entries()]
    .sort(([a], [b]) => (ordem.get(a) ?? 99) - (ordem.get(b) ?? 99))
    .map(([papel, doPapel]) => {
      const ordemDaCopy = (b: BlocoPreparado) => (b.indicesDoBloco.length > 0 ? Math.min(...b.indicesDoBloco) : 0)
      const naOrdemDaCopy = doPapel
        .map((b, i) => ({ b, i }))
        .sort((x, y) => Number(x.b.papel === 'headline2') - Number(y.b.papel === 'headline2') || ordemDaCopy(x.b) - ordemDaCopy(y.b) || x.i - y.i)
        .map(({ b }) => b)
      const blocos = naOrdemDaCopy.map((b) => {
        // Sem o vão da página, também sem o encaixe que ele autorizava na conferência de colisão.
        const compositor = (b.layer.metadata as { compositor?: Record<string, unknown> } | undefined)?.compositor
        const { encaixe: _encaixe, ...semEncaixe } = compositor ?? {}
        const layer = { ...b.layer, metadata: { ...b.layer.metadata, groupId: grupoDaUnidade(papel), ...(compositor ? { compositor: semEncaixe } : {}) } }
        const { vaoAntes: _vao, ...semVao } = b
        return { ...semVao, layer }
      })
      const pilha = empilhar(
        blocos.map(({ elementos: _e, escalaDosElementos: _s, ...soTexto }) => soTexto),
        vaoDaLista[papel] ?? gap,
      )
      const alturaDoOrcamento = empilhar(
        blocos.map(({ elementos: _e, escalaDosElementos: _s, ...soTexto }) => ({ ...soTexto, height: soTexto.orcamentoDeAltura ?? soTexto.height })),
        vaoDaLista[papel] ?? gap,
      ).height
      // O quanto os ornamentos passam da pilha: a união das extensões de TODO texto (também o do meio — o filete sob
      // a manchete que desce além da segunda voz), cada uma na altura em que o texto dela pousa. A mesma conta de
      // extensão da `empilhar`.
      const ornamentos = { esquerda: 0, direita: 0, topo: 0, base: 0 }
      const ornamentosPorBloco = blocos.map(() => ({ esquerda: 0, direita: 0, topo: 0, base: 0 }))
      blocos.forEach((b, i) => {
        if (!b.elementos?.length) return
        const ext = extensoesDosElementos(b.elementos, { width: Math.max(1, b.width - 2 * PADDING_DE_DESENHO - 2), height: b.height }, b.escalaDosElementos ?? 1)
        ornamentosPorBloco[i] = { esquerda: Math.ceil(ext.esquerda), direita: Math.ceil(ext.direita), topo: Math.ceil(ext.topo), base: Math.ceil(ext.base) }
        ornamentos.esquerda = Math.max(ornamentos.esquerda, Math.ceil(ext.esquerda))
        ornamentos.direita = Math.max(ornamentos.direita, Math.ceil(ext.direita))
        ornamentos.topo = Math.max(ornamentos.topo, Math.ceil(ext.topo - pilha.offsets[i]))
        ornamentos.base = Math.max(ornamentos.base, Math.ceil(pilha.offsets[i] + b.height + ext.base - pilha.height))
      })
      return { papel, blocos, pilha, alturaDoOrcamento, ornamentos, ornamentosPorBloco }
    })
}

/** O vão entre os itens de cada papel de lista do arquétipo, em px do formato (`itens.<papel>.vao` × altura). */
export function vaosDaLista(arquetipo: ArquetipoDeLayout, formato: FormatoDoArquetipo, canvas: { height: number }): Partial<Record<PapelDeTexto, number>> {
  const itens = arquetipo.formatos[formato].itens ?? {}
  return Object.fromEntries(
    arquetipo.papeis.filter((p) => p.lista && itens[p.papel as PapelDeTexto]).map((p) => [p.papel, Math.round(itens[p.papel as PapelDeTexto]!.vao * canvas.height)]),
  )
}

/** Os papéis de lista do arquétipo (#15): um item por linha autoral com texto. */
export const papeisDeLista = (arquetipo: ArquetipoDeLayout): Set<PapelDeTexto> => new Set(arquetipo.papeis.filter((p) => p.lista).map((p) => p.papel as PapelDeTexto))

/**
 * A caixa de cada ITEM de cada lista, onde a unidade pousou: o x pelo alinhamento do papel (a mesma conta de
 * `camadasNaReferencia`), o y pela pilha. É por ela que o fio de cada item se prende — e o que ele não pode tocar.
 */
export function caixasDosItens(
  arquetipo: ArquetipoDeLayout,
  unidades: ReadonlyArray<UnidadeDoArquetipo>,
  papeis: Partial<Record<PapelDeTexto, { posicao: RetanguloPx }>>,
): Partial<Record<PapelDeTexto, RetanguloPx[]>> {
  const listas = papeisDeLista(arquetipo)
  const saida: Partial<Record<PapelDeTexto, RetanguloPx[]>> = {}
  for (const u of unidades) {
    const pos = papeis[u.papel]?.posicao
    if (!listas.has(u.papel) || !pos) continue
    const alinha = alinhaDoPapel(arquetipo, u.papel)
    saida[u.papel] = u.blocos.map((b, i) => ({
      x: Math.round(alinha === 'esquerda' ? pos.x : alinha === 'direita' ? pos.x + pos.width - b.width : pos.x + (pos.width - b.width) / 2),
      y: Math.round(pos.y + u.pilha.offsets[i]),
      width: Math.round(b.width),
      height: Math.round(b.height),
    }))
  }
  return saida
}

/** O passo da escada da unidade — o mesmo da escada do bloco (`montarBloco`). */
const PASSO_DA_UNIDADE = 0.04
/**
 * Onde a escada do papel de escala DOMINANTE começa (T4-A): 8× o corpo da assinatura. Alto o bastante para nenhuma
 * copy caber nele numa referência do catálogo; a escada desce até o maior corpo que cabe. Uma assinatura com corpo
 * menor que 1/8 do que a referência pede não chega à dominância — e a materialização recusa, dita.
 */
export const TETO_DA_ESCALA_DOMINANTE = 8

export interface PreparoNoArquetipo {
  preparados: BlocosPreparados
  /** Os blocos da peça (a logo dos arranjos já retirada). */
  montados: BlocoPreparado[]
  /** Textos cujo arranjo trazia a logo. */
  retiradas: string[]
  unidades: UnidadeDoArquetipo[]
  /** O fator em que a escada de cada unidade começou (ausente = no tamanho da assinatura). */
  fatores: Partial<Record<PapelDeTexto, number>>
}

/**
 * A ESCADA DA UNIDADE (T1a). A escada sancionada do bloco (`montarBloco`, até 80%)
 * vê um texto de cada vez; a unidade de um papel pode ter mais de um (a manchete
 * e a segunda voz; o serviço repartido) e os elementos presos a eles. Quando a
 * PILHA da unidade passa da caixa da referência, a preparação é refeita com a
 * escada daquele papel começando um degrau abaixo — o mesmo passo e o mesmo piso
 * de 80%. Nada além disso: se no piso ainda não cabe, a materialização recusa
 * com o orçamento da unidade. É a MESMA função no compor e no medir-copy.
 */
export function prepararNoArquetipo(args: {
  arquetipo: ArquetipoDeLayout
  formato: FormatoDoArquetipo
  canvas: { width: number; height: number }
  gap: number
  /** Roda `prepararBlocos` com a caixa de cada papel e o fator de início da escada de cada papel. */
  preparar: (escalaMaximaDoPapel: (papel: Papel) => number | undefined) => BlocosPreparados
}): PreparoNoArquetipo {
  const caixas = caixasMaximas(args.arquetipo, args.formato, args.canvas)
  const dominante = papelDominante(args.arquetipo)
  const listas = papeisDeLista(args.arquetipo)
  const fatores: Partial<Record<PapelDeTexto, number>> = dominante ? { [dominante]: TETO_DA_ESCALA_DOMINANTE } : {}
  for (;;) {
    const preparados = args.preparar((p) => fatores[papelGeometrico(p)])
    const { montados, retiradas } = semLogoDosArranjos(preparados.montados)
    const unidades = unidadesDoArquetipo(args.arquetipo, montados, args.gap, vaosDaLista(args.arquetipo, args.formato, args.canvas))
    let desceu = false
    for (const u of unidades) {
      // A LISTA (#15) tem UM corpo: o item que a escada do bloco encolheu puxa os outros para a mesma escala (uma lista
      // com itens de corpos diferentes não é a lista do modelo). Converge: o menor só desce.
      if (listas.has(u.papel) && u.blocos.length > 1) {
        const menor = Math.min(...u.blocos.map((b) => b.escala))
        if (u.blocos.some((b) => b.escala > menor + 1e-9) && (fatores[u.papel] ?? 1) > menor + 1e-9) {
          fatores[u.papel] = menor
          desceu = true
          continue
        }
      }
      const caixa = caixas[u.papel]
      // O orçamento legado escolhe o degrau; a descida só para quando a pilha FÍSICA (ceil) também cabe na régua
      // final exata da referência (a mesma da materialização).
      const pos = args.arquetipo.formatos[args.formato].papeis[u.papel]
      const fisicaExcede = Boolean(pos && 'referencia' in pos && excedeAlturaDaReferencia(u.pilha.height, pos.referencia, args.canvas))
      if (!caixa || ((u.alturaDoOrcamento ?? u.pilha.height) <= caixa.altura + 0.5 && u.pilha.width <= caixa.largura + 0.5 && !fisicaExcede)) continue
      // No dominante, a escada do bloco já desceu do teto: o próximo degrau é o de baixo do MAIOR corpo real da unidade
      // (todo teto acima dele dá a mesma peça; abaixo, encolhe ao menos esse bloco). Nunca pelo menor: a manchete
      // curta a 4,8× com a segunda voz já no piso pularia direto para o piso e recusaria uma unidade que cabe.
      // Nos outros papéis, exatamente como antes.
      const atual = u.papel === dominante ? Math.min(fatores[u.papel] ?? 1, Math.max(...u.blocos.map((b) => b.escala))) : (fatores[u.papel] ?? 1)
      if (atual - PASSO_DA_UNIDADE < PISO_DE_ESCALA - 1e-9) continue
      fatores[u.papel] = Number((atual - PASSO_DA_UNIDADE).toFixed(2))
      desceu = true
    }
    if (!desceu) return { preparados, montados, retiradas, unidades, fatores }
  }
}

/**
 * As camadas de texto de cada unidade, na posição que a materialização deu: o
 * x pelo alinhamento do arquétipo dentro da caixa da unidade, o y pela pilha
 * dos textos. É a MESMA conta no compor (que desenha) e no medir-copy (que
 * confere a geometria final antes de dizer "cabe").
 */
export function camadasNaReferencia(
  unidades: UnidadeDoArquetipo[],
  papeis: Partial<Record<PapelDeTexto, { posicao: { x: number; y: number; width: number; height: number } }>>,
  /** O do arquétipo, ou o de cada papel (`alinhaDoPapel`, T4-A). */
  alinhamento: Alinhamento | ((papel: PapelDeTexto) => Alinhamento),
): Array<{ unidade: UnidadeDoArquetipo; rect: { x: number; y: number; width: number; height: number }; camadas: Layer[] }> {
  return unidades.flatMap((u) => {
    const pos = papeis[u.papel]?.posicao
    if (!pos) return []
    const alinha = typeof alinhamento === 'function' ? alinhamento(u.papel) : alinhamento
    const textAlign = alinha === 'esquerda' ? 'left' : alinha === 'direita' ? 'right' : 'center'
    const camadas = u.blocos.map((b, i) => {
      const x = alinha === 'esquerda' ? pos.x : alinha === 'direita' ? pos.x + pos.width - b.width : pos.x + (pos.width - b.width) / 2
      return { ...b.layer, position: { x: Math.round(x), y: Math.round(pos.y + u.pilha.offsets[i]) }, style: { ...b.layer.style, textAlign } } as Layer
    })
    return [{ unidade: u, rect: pos, camadas }]
  })
}

/**
 * Os problemas que o AUTOFIX final resolveria encolhendo a fonte ou a
 * entrelinha (transbordo e colisão, `checkTextGeometry`) — com arquétipo eles
 * são recusa, não ajuste: o autofix desceria a partir do corpo já reduzido pela
 * escada e a peça sairia abaixo do piso de 80%, com medidas que o medir-copy
 * não deu. A mesma conferência no compor (antes do autofix) e no medir-copy.
 */
export function ajusteFinalNecessario(camadas: Layer[], canvas: { width: number; height: number }, medir: MeasureTextBox): TextGeometryIssue[] {
  return checkTextGeometry(camadas, canvas, medir).issues.filter((i) => i.tipo === 'overflow' || i.tipo === 'colisao')
}

/** As unidades pousadas na referência — ou na posição candidata, com `deslocamentos` (CP2B) — ou a recusa, com a área segura efetiva do projeto. */
export function materializarUnidades(args: {
  arquetipo: ArquetipoDeLayout
  formato: FormatoDoArquetipo
  canvas: { width: number; height: number }
  geometria: GeometriaEfetiva
  unidades: UnidadeDoArquetipo[]
  logo: { razao: number } | null
  deslocamentos?: Partial<Record<PapelDeTexto | 'logo', number>>
  conferirZona?: boolean
}): Materializacao {
  const medidas: Partial<Record<PapelDeTexto, { width: number; height: number }>> = {}
  const ornamentos: Partial<Record<PapelDeTexto, UnidadeDoArquetipo['ornamentos']>> = {}
  for (const u of args.unidades) {
    medidas[u.papel] = { width: u.pilha.width, height: u.pilha.height }
    ornamentos[u.papel] = u.ornamentos
  }
  // #5: a folga da pílula conta na zona (vazio sem envolvente: a materialização de sempre).
  const envoltorios = envoltoriosDoArquetipo(args.arquetipo, args.formato, args.canvas)
  const m = materializarArquetipo({ arquetipo: args.arquetipo, formato: args.formato, canvas: args.canvas, geometria: args.geometria, medidas, ornamentos, logo: args.logo, deslocamentos: args.deslocamentos, ...(Object.keys(envoltorios).length > 0 ? { envoltorios } : {}), ...(args.conferirZona === false ? { conferirZona: false } : {}) })
  if (!('problemas' in m)) return m
  // A recusa por capacidade leva o orçamento da unidade: a caixa, a escala em que a escada parou e cada bloco.
  const caixas = caixasMaximas(args.arquetipo, args.formato, args.canvas)
  for (const p of m.problemas) {
    const u = args.unidades.find((x) => x.papel === p.papel)
    const caixa = caixas[p.papel as PapelDeTexto]
    if (p.codigo !== 'ARQUETIPO_TEXTO_NAO_CABE' || !u || !caixa) continue
    p.orcamento = {
      capacidade: caixa,
      escala: Math.min(...u.blocos.map((b) => b.escala)),
      blocos: u.blocos.map((b) => ({ id: b.layer.id, papel: b.papel, escala: b.escala, width: b.width, height: b.height, linhas: b.linhasDaCopy.length })),
    }
  }
  return m
}
